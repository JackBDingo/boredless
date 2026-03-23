/**
 * game-module.ts — WordCraft V2 game module factory.
 *
 * Creates a DeclarativeGameModule with a registered ExtensionActionHandler.
 *
 * Architecture:
 *   WordCraft's playing phase is declared as `input_gate` with `required: []`
 *   in game.yaml. The DeclarativeGameModule won't auto-complete the phase gate.
 *
 *   WordCraftGameModule wraps DeclarativeGameModule and:
 *   1. Intercepts handleInput during the playing phase
 *   2. Routes to the appropriate action handler (place/swap/pass)
 *   3. Shares state mutation callbacks with the ExtensionActionHandler via
 *      a per-room MutationBridge that is set before input dispatch and read
 *      by the handler during the synthetic 'wc_apply_input' lifecycle action
 *   4. Triggers 'wc_apply_input' by calling a stored context reference that
 *      was captured when the extension handler was first called (on game setup)
 *
 * The MutationBridge pattern allows state mutations from input handlers to
 * flow through the proper ExtensionActionContext (which has direct access to
 * StateManager) without needing to expose StateManager internals.
 *
 * Pattern follows bluff-battle/extensions/game-module.ts.
 */

import type { GameDefinition, Player } from '@boredless/shared';
import type { GamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';
import type { GameModule } from '../../../server/src/games/game-module.js';
import type { GameContext } from '../../../server/src/games/game-context.js';

import {
  isWCAction,
  handleInitGame,
  handleOnPlayingEnter,
  handleSyncScores,
  handlePlace,
  handleSwap,
  handlePass,
  type WCActionContext,
} from './index.js';

// ---------------------------------------------------------------------------
// MutationBridge — shared context between input handlers and extension handler
// ---------------------------------------------------------------------------

/**
 * A per-room bridge that allows the WordCraftGameModule to capture a live
 * ExtensionActionContext and use it to flush state mutations collected by
 * input handlers.
 *
 * The bridge is populated when the extension handler is called for any
 * lifecycle action. At that point, we have a valid ExtensionActionContext
 * with access to the StateManager.
 *
 * For input handling, we:
 *  1. Run the action logic against a state snapshot, collecting mutations
 *  2. Immediately call bridge.flush(mutations) which applies them via ctx
 */
interface MutationBridge {
  /** Apply mutations via the live ExtensionActionContext */
  flush: (mutations: CollectedMutations) => void;
  /** The last captured context — used to build WCActionContext for input dispatch */
  capturedCtx: ExtensionActionContext;
}

interface CollectedMutations {
  globals: Record<string, unknown>;
  players: Record<string, Record<string, unknown>>;
  pointDeltas: Array<{ playerId: string; amount: number }>;
}

// ---------------------------------------------------------------------------
// Adapter: ExtensionActionContext → WCActionContext
// ---------------------------------------------------------------------------

function toWCContext(
  ctx: ExtensionActionContext,
  completePhase: () => void,
): WCActionContext {
  return {
    roomId: ctx.roomId,
    globals: ctx.globals,
    players: ctx.players,
    playerInfo: ctx.playerInfo,
    setGlobal: ctx.setGlobal,
    setPlayer: ctx.setPlayer,
    getScore: ctx.getScore,
    addPoints: ctx.addPoints,
    completePhase,
    log: (msg: string, data?: unknown) => ctx.log(msg, data as Record<string, unknown>),
  };
}

// ---------------------------------------------------------------------------
// WordCraftGameModule
// ---------------------------------------------------------------------------

class WordCraftGameModule implements GameModule {
  readonly definition: GameDefinition;
  private readonly inner: DeclarativeGameModule;

  // Per-room state
  private readonly _rooms = new Map<string, {
    ctx: GameContext;
    players: Player[];
    bridge: MutationBridge | null;
    /** Pending mutations waiting to be flushed on the next extension context call */
    pendingMutations: CollectedMutations | null;
    phaseCompleteRequested: boolean;
  }>();

  constructor(
    definition: GameDefinition,
    gamePackage: GamePackage,
    timerImpl?: TimerImpl,
  ) {
    this.definition = definition;
    const self = this;

    const handler: ExtensionActionHandler = (actionName: string, ctx: ExtensionActionContext): boolean => {
      const roomId = ctx.roomId;
      const room = self._rooms.get(roomId);

      // Always update the bridge with the latest context
      if (room) {
        room.bridge = {
          capturedCtx: ctx,
          flush: (mutations: CollectedMutations) => {
            for (const [field, value] of Object.entries(mutations.globals)) {
              ctx.setGlobal(field, value);
            }
            for (const [playerId, fields] of Object.entries(mutations.players)) {
              for (const [field, value] of Object.entries(fields)) {
                ctx.setPlayer(playerId, field, value);
              }
            }
            for (const { playerId, amount } of mutations.pointDeltas) {
              ctx.addPoints(playerId, amount);
            }
          },
        };

        // If there are pending mutations from input handling, flush them now
        if (room.pendingMutations) {
          room.bridge.flush(room.pendingMutations);
          room.pendingMutations = null;
        }
      }

      // Lifecycle actions
      if (!isWCAction(actionName)) return false;

      const completePhase = (): void => {
        // no-op for lifecycle hooks (phase advancement handled by YAML)
      };
      const wcCtx = toWCContext(ctx, completePhase);

      switch (actionName) {
        case 'wc_init_game':
          handleInitGame(wcCtx);
          return true;
        case 'wc_on_playing_enter':
          handleOnPlayingEnter(wcCtx);
          return true;
        case 'wc_sync_scores':
          handleSyncScores(wcCtx);
          return true;
        default:
          return false;
      }
    };

    this.inner = new DeclarativeGameModule(definition, gamePackage, timerImpl, handler);
  }

  setup(players: Player[], ctx: GameContext): void {
    this._rooms.set(ctx.roomId, {
      ctx,
      players,
      bridge: null,
      pendingMutations: null,
      phaseCompleteRequested: false,
    });
    this.inner.setup(players, ctx);
  }

  getPhaseState(roomId: string) {
    return this.inner.getPhaseState(roomId);
  }

  getPublicState(roomId: string) {
    return this.inner.getPublicState(roomId);
  }

  getPrivateState(roomId: string, playerId: string) {
    return this.enrichPrivateState(this.inner.getPrivateState(roomId, playerId), roomId, playerId);
  }

  handleInput(
    roomId: string,
    playerId: string,
    inputType: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const room = this._rooms.get(roomId);
    if (!room) return { accepted: false, reason: 'Game not found' };

    // Pass-through for synthetic phase-complete signals
    if (payload['_wc_phase_complete'] === true) {
      return this.inner.handleInput(roomId, playerId, inputType, payload);
    }

    // Check we're in the playing phase
    const publicState = this.inner.getPublicState(roomId);
    const phase = String(publicState['phase'] ?? '');
    if (phase !== 'playing') {
      return { accepted: false, reason: 'Not in playing phase' };
    }

    // Build a state snapshot for action handlers
    const globals: Record<string, unknown> = {
      ...((publicState['globals'] as Record<string, unknown>) ?? {}),
    };

    // Gather per-player private state
    const playersState: Record<string, Record<string, unknown>> = {};
    for (const player of room.players) {
      const priv = this.inner.getPrivateState(roomId, player.id);
      const privPlayers = (priv['players'] as Record<string, Record<string, unknown>>) ?? {};
      playersState[player.id] = { ...(privPlayers[player.id] ?? {}) };
    }

    // Collect mutations
    const mutations: CollectedMutations = { globals: {}, players: {}, pointDeltas: [] };
    let shouldComplete = false;

    const wcCtx: WCActionContext = {
      roomId,
      globals,
      players: playersState,
      playerInfo: room.players.map(p => ({ id: p.id, name: p.name })),
      setGlobal: (field: string, value: unknown) => {
        mutations.globals[field] = value;
        globals[field] = value; // Keep snapshot consistent within the action
      },
      setPlayer: (pid: string, field: string, value: unknown) => {
        if (!mutations.players[pid]) mutations.players[pid] = {};
        mutations.players[pid]![field] = value;
        if (!playersState[pid]) playersState[pid] = {};
        playersState[pid]![field] = value; // Keep snapshot consistent
      },
      getScore: (pid: string) => room.ctx.getScore(pid),
      addPoints: (pid: string, amount: number) => {
        mutations.pointDeltas.push({ playerId: pid, amount });
      },
      completePhase: () => { shouldComplete = true; },
      log: (msg: string, data?: unknown) => room.ctx.log.info(msg, data as Record<string, unknown>),
    };

    // Dispatch action
    const action = String(payload['action'] ?? '');
    let result: { accepted: boolean; reason?: string };
    switch (action) {
      case 'place': result = handlePlace(wcCtx, playerId, payload); break;
      case 'swap':  result = handleSwap(wcCtx, playerId, payload); break;
      case 'pass':  result = handlePass(wcCtx, playerId); break;
      default:
        return { accepted: false, reason: `Unknown action: ${action}` };
    }

    if (!result.accepted) return result;

    // Apply mutations via the bridge if available, otherwise queue for next lifecycle call
    const hasMutations =
      Object.keys(mutations.globals).length > 0 ||
      Object.keys(mutations.players).length > 0 ||
      mutations.pointDeltas.length > 0;

    if (hasMutations) {
      if (room.bridge) {
        room.bridge.flush(mutations);
      } else {
        // Bridge not yet established (shouldn't happen after setup, but be safe)
        room.pendingMutations = mutations;
      }
    }

    // Advance the playing phase to word_reveal
    if (shouldComplete) {
      // Submit from any player — required: [] means the phase completes immediately
      const firstPlayerId = room.players[0]?.id ?? playerId;
      this.inner.handleInput(roomId, firstPlayerId, 'structured_message', {
        _wc_phase_complete: true,
        value: '__done__',
      });
    }

    return result;
  }

  teardown(roomId: string): void {
    this._rooms.delete(roomId);
    this.inner.teardown(roomId);
  }

  // ---------------------------------------------------------------------------
  // Private: enrich private state
  // ---------------------------------------------------------------------------

  private enrichPrivateState(
    innerState: Record<string, unknown>,
    roomId: string,
    playerId: string,
  ): Record<string, unknown> {
    const publicState = this.inner.getPublicState(roomId);
    const globals = (publicState['globals'] as Record<string, unknown>) ?? {};
    const turnOrder = Array.isArray(globals['turn_order'])
      ? (globals['turn_order'] as string[]) : [];
    const currentIdx = typeof globals['current_player_index'] === 'number'
      ? globals['current_player_index'] : 0;
    const currentPlayerId = turnOrder[currentIdx] ?? null;
    const phase = String(publicState['phase'] ?? '');
    const isMyTurn = phase === 'playing' && currentPlayerId === playerId;
    const tilesInBag = typeof globals['tiles_in_bag'] === 'number'
      ? globals['tiles_in_bag'] : 0;

    // Extract rack from per-player private state (visibility: player)
    const innerPlayers = (innerState['players'] as Record<string, Record<string, unknown>>) ?? {};
    const myPlayerState = innerPlayers[playerId] ?? {};
    const rackJson = myPlayerState['rack_json'];
    let rack: unknown[] = [];
    if (typeof rackJson === 'string' && rackJson) {
      try { rack = JSON.parse(rackJson) as unknown[]; } catch { rack = []; }
    }

    return {
      ...innerState,
      isMyTurn,
      canSwap: (tilesInBag as number) >= 7,
      canPass: true,
      rack,
      tilesInBag,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a WordCraft GameModule with V2 declarative extension support.
 * Used by auto-discover.ts as the createModule factory for wordcraft.
 */
export function createWordCraftModule(
  definition: GameDefinition,
  gamePackage: GamePackage,
  _gameDir: string,
  timerImpl?: TimerImpl,
): GameModule {
  return new WordCraftGameModule(definition, gamePackage, timerImpl);
}
