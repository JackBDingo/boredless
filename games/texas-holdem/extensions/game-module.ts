/**
 * game-module.ts — Texas Hold'em V2 game module factory.
 *
 * Texas Hold'em is complex enough that it requires a near-full-extension
 * implementation. The game.yaml declares the phase graph and state model,
 * but ALL game logic (betting, hand evaluation, side pots, blinds) lives
 * in the extension functions.
 *
 * Implementation pattern:
 *   - This module creates a DeclarativeGameModule with an ExtensionActionHandler
 *     for lifecycle actions (th_deal_hand, th_deal_flop, etc.)
 *   - The input_gate phases in game.yaml use `primitive: confirm` so the
 *     PhaseMachine can manage them without errors
 *   - TexasHoldemGameModule wraps DeclarativeGameModule and intercepts 'bet'
 *     inputs BEFORE they reach the inner module
 *   - For bet inputs: mutations are collected locally and applied to state
 *     via a deferred flush mechanism (next phase on_enter)
 *   - Phase advancement: when betting round completes, we call completePhase()
 *     which submits synthetic 'confirm' inputs for all players
 *
 * Key insight: The DeclarativeGameModule's StateManager is private. We CANNOT
 * write to it directly from outside. The ExtensionActionHandler is the ONLY
 * external write path. Therefore, bet action mutations are buffered locally
 * and applied lazily in the next on_enter extension handler call.
 *
 * This means after a bet action, the inner module's state is briefly stale.
 * We compensate by building the working state from our OWN accumulated mutations
 * for subsequent bet actions in the same betting round.
 */

import type { GameDefinition } from '@boredless/shared';
import type { GamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';
import type { GameModule } from '../../../server/src/games/game-module.js';
import type { GameContext } from '../../../server/src/games/game-context.js';
import type { Player, PhaseState } from '@boredless/shared';

import {
  isTHAction,
  handleDealHand,
  handleDealFlop,
  handleDealTurn,
  handleDealRiver,
  handleShowdownEvaluate,
  handleBetAction,
  handleTimeout,
  type THActionContext,
} from './index.js';

// ---------------------------------------------------------------------------
// Betting phases
// ---------------------------------------------------------------------------

const BETTING_PHASES = new Set(['th_preflop', 'th_flop', 'th_turn', 'th_river']);

// ---------------------------------------------------------------------------
// Per-room bet state (managed by this wrapper, NOT by the inner module)
// ---------------------------------------------------------------------------

interface BettingState {
  /** Accumulated state mutations from bet actions, not yet flushed to StateManager */
  pendingGlobals: Record<string, unknown>;
  pendingPlayers: Record<string, Record<string, unknown>>;
  /** Working copy of globals (public + private + pending) for bet action computation */
  workingGlobals: Record<string, unknown>;
  /** Working copy of per-player state for bet action computation */
  workingPlayers: Record<string, Record<string, unknown>>;
  /** Whether the current betting round is complete */
  bettingComplete: boolean;
  /** Whether the hand ended early (last player standing) */
  handOver: boolean;
}

// ---------------------------------------------------------------------------
// Adapter: ExtensionActionContext → THActionContext
// ---------------------------------------------------------------------------

function toTHContext(ctx: ExtensionActionContext): THActionContext {
  return {
    roomId: ctx.roomId,
    globals: ctx.globals,
    players: ctx.players,
    playerInfo: ctx.playerInfo,
    setGlobal: ctx.setGlobal,
    setPlayer: ctx.setPlayer,
    getScore: ctx.getScore,
    addPoints: ctx.addPoints,
    log: (msg: string, data?: unknown) => ctx.log(msg, data as Record<string, unknown>),
  };
}

// ---------------------------------------------------------------------------
// Extension action handler factory
// ---------------------------------------------------------------------------

/**
 * Creates the extension handler for Texas Hold'em.
 *
 * The handler:
 *   1. Processes lifecycle actions (th_deal_hand, th_deal_flop, etc.)
 *      - On each on_enter, applies any pending mutations FIRST (flush),
 *        then runs the deal/showdown logic.
 *   2. Processes __th_flush to apply pending mutations outside of lifecycle hooks.
 *
 * @param bettingStates - Shared map of roomId → BettingState
 */
function createTHHandler(
  bettingStates: Map<string, BettingState>,
): ExtensionActionHandler {
  return (actionName: string, ctx: ExtensionActionContext): boolean => {
    const roomId = ctx.roomId;

    // --- Apply pending mutations from bet actions ---
    // This happens before every lifecycle action (deal, showdown) to ensure
    // the state is up-to-date when the lifecycle logic runs.
    function applyPendingMutations(): void {
      const bs = bettingStates.get(roomId);
      if (!bs) return;

      const hasPendingGlobals = Object.keys(bs.pendingGlobals).length > 0;
      const hasPendingPlayers = Object.keys(bs.pendingPlayers).length > 0;
      if (!hasPendingGlobals && !hasPendingPlayers) return;

      for (const [field, value] of Object.entries(bs.pendingGlobals)) {
        ctx.setGlobal(field, value);
      }
      for (const [playerId, fields] of Object.entries(bs.pendingPlayers)) {
        for (const [field, value] of Object.entries(fields)) {
          ctx.setPlayer(playerId, field, value);
        }
      }

      bs.pendingGlobals = {};
      bs.pendingPlayers = {};
    }

    // --- Lifecycle actions ---
    if (isTHAction(actionName)) {
      // Always flush pending mutations before running lifecycle logic
      applyPendingMutations();

      const thCtx = toTHContext(ctx);
      switch (actionName) {
        case 'th_deal_hand':
          handleDealHand(thCtx);
          return true;
        case 'th_deal_flop':
          handleDealFlop(thCtx);
          return true;
        case 'th_deal_turn':
          handleDealTurn(thCtx);
          return true;
        case 'th_deal_river':
          handleDealRiver(thCtx);
          return true;
        case 'th_showdown_evaluate':
          handleShowdownEvaluate(thCtx);
          return true;
        default:
          return false;
      }
    }

    // --- Explicit flush trigger (used for mid-phase state sync) ---
    if (actionName === '__th_flush') {
      applyPendingMutations();
      return true;
    }

    return false;
  };
}

// ---------------------------------------------------------------------------
// TexasHoldemGameModule
// ---------------------------------------------------------------------------

class TexasHoldemGameModule implements GameModule {
  readonly definition: GameDefinition;
  private readonly inner: DeclarativeGameModule;
  private readonly bettingStates = new Map<string, BettingState>();
  private readonly roomCtx = new Map<string, GameContext>();
  private readonly roomPlayers = new Map<string, Player[]>();

  constructor(
    definition: GameDefinition,
    gamePackage: GamePackage,
    timerImpl?: TimerImpl,
  ) {
    this.definition = definition;
    const handler = createTHHandler(this.bettingStates);
    this.inner = new DeclarativeGameModule(definition, gamePackage, timerImpl, handler);
  }

  setup(players: Player[], ctx: GameContext): void {
    this.roomCtx.set(ctx.roomId, ctx);
    this.roomPlayers.set(ctx.roomId, [...players]);
    this.bettingStates.set(ctx.roomId, {
      pendingGlobals: {},
      pendingPlayers: {},
      workingGlobals: {},
      workingPlayers: {},
      bettingComplete: false,
      handOver: false,
    });
    this.inner.setup(players, ctx);
  }

  getPhaseState(roomId: string): PhaseState {
    return this.inner.getPhaseState(roomId);
  }

  getPublicState(roomId: string): Record<string, unknown> {
    return this.inner.getPublicState(roomId);
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    return this.inner.getPrivateState(roomId, playerId);
  }

  handleInput(
    roomId: string,
    playerId: string,
    inputType: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const currentPhase = this.inner.getPhaseState(roomId).phaseType;

    if (inputType === 'bet' && BETTING_PHASES.has(currentPhase)) {
      return this.handleBettingInput(roomId, playerId, payload);
    }

    return this.inner.handleInput(roomId, playerId, inputType, payload);
  }

  /**
   * Process a player's betting action.
   *
   * State flow:
   *   1. Build working state = inner public + private snapshot + pending mutations
   *   2. Run handleBetAction (all state mutations go into pending accumulators)
   *   3. Update betting state
   *   4. Broadcast current state (from inner module — slightly stale but accurate for display)
   *   5. If betting complete: submit 'confirm' for all players → triggers phase advance
   *      → which fires on_complete → on_enter of next phase
   *      → on_enter runs th_deal_flop/turn/river/showdown_evaluate
   *      → BEFORE deal runs, handler flushes pending mutations
   *      → deal logic sees correct state
   */
  private handleBettingInput(
    roomId: string,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const bs = this.bettingStates.get(roomId);
    const ctx = this.roomCtx.get(roomId);
    const players = this.roomPlayers.get(roomId);

    if (!bs || !ctx || !players) {
      return { accepted: false, reason: 'Room not found' };
    }

    // Build working state (inner snapshot + pending mutations from previous bet actions)
    this.refreshWorkingState(roomId, bs, players);

    // Run bet action against working state
    const thCtx = this.buildTHContext(roomId, bs, ctx, players);
    const result = handleBetAction(thCtx, playerId, payload);

    if (!result.accepted) {
      return { accepted: false, reason: result.reason };
    }

    bs.bettingComplete = result.bettingComplete ?? false;
    bs.handOver = result.handOver ?? false;

    // For immediate broadcast: apply pending to working state (already done via setGlobal/setPlayer closures)
    // The inner module's state is still stale — that's OK for broadcast since we're about to advance
    // or the client will see updated state on next phase.

    // Broadcast (inner module state + pending overlay not possible without StateManager access)
    // We broadcast what the inner module knows (which is the on_enter initialized state)
    // plus the client-visible fields from pending mutations via the globals/players in workingGlobals.
    // For simplicity, broadcast the inner state — bet actions update active_player_id etc. which
    // the client needs. We need to get this right.
    //
    // Since we can't write to the inner StateManager directly, we use a workaround:
    // Build a "synthetic" public state by merging inner state with pending mutations.
    const syntheticPublicState = this.buildSyntheticPublicState(roomId, bs, players);
    ctx.broadcastPhase(this.inner.getPhaseState(roomId), syntheticPublicState);
    ctx.broadcastPrivateState(pid => this.buildSyntheticPrivateState(roomId, bs, players, pid));

    if (bs.bettingComplete || bs.handOver) {
      this.completeBettingPhase(roomId, bs, ctx, players);
    }

    return { accepted: true };
  }

  /**
   * Refresh the working state from inner module snapshots + pending mutations.
   */
  private refreshWorkingState(
    roomId: string,
    bs: BettingState,
    players: Player[],
  ): void {
    const publicState = this.inner.getPublicState(roomId) as Record<string, unknown>;
    const publicGlobals = (publicState['globals'] as Record<string, unknown> | undefined) ?? {};
    const publicPlayers = (publicState['players'] as Record<string, Record<string, unknown>> | undefined) ?? {};

    const mergedGlobals: Record<string, unknown> = { ...publicGlobals };
    const mergedPlayers: Record<string, Record<string, unknown>> = {};

    for (const player of players) {
      const privateState = this.inner.getPrivateState(roomId, player.id) as Record<string, unknown>;
      const privateGlobals = (privateState['globals'] as Record<string, unknown> | undefined) ?? {};
      const privatePlayerFields = (privateState['players'] as Record<string, Record<string, unknown>> | undefined)?.[player.id] ?? {};

      Object.assign(mergedGlobals, privateGlobals);
      mergedPlayers[player.id] = {
        ...((publicPlayers[player.id] as Record<string, unknown>) ?? {}),
        ...privatePlayerFields,
      };
    }

    // Apply pending mutations on top
    Object.assign(mergedGlobals, bs.pendingGlobals);
    for (const [pid, fields] of Object.entries(bs.pendingPlayers)) {
      if (!mergedPlayers[pid]) mergedPlayers[pid] = {};
      Object.assign(mergedPlayers[pid]!, fields);
    }

    bs.workingGlobals = mergedGlobals;
    bs.workingPlayers = mergedPlayers;
  }

  /**
   * Build a THActionContext that writes to pendingGlobals/pendingPlayers.
   */
  private buildTHContext(
    roomId: string,
    bs: BettingState,
    ctx: GameContext,
    players: Player[],
  ): THActionContext {
    // Use a mutable view that also updates the working state
    const globals = bs.workingGlobals;
    const playerStates = bs.workingPlayers;

    return {
      roomId,
      globals,
      players: playerStates,
      playerInfo: players.map(p => ({ id: p.id, name: p.name })),
      setGlobal: (field, value) => {
        bs.pendingGlobals[field] = value;
        globals[field] = value;
      },
      setPlayer: (pid, field, value) => {
        if (!bs.pendingPlayers[pid]) bs.pendingPlayers[pid] = {};
        bs.pendingPlayers[pid]![field] = value;
        if (!playerStates[pid]) playerStates[pid] = {};
        playerStates[pid]![field] = value;
      },
      getScore: (pid) => ctx.getScore(pid),
      addPoints: (pid, amount) => ctx.addPoints(pid, amount),
      log: (msg, data) => ctx.log.info(msg, data as Record<string, unknown>),
    };
  }

  /**
   * Build a synthetic public state by merging inner public state with pending mutations.
   */
  private buildSyntheticPublicState(
    roomId: string,
    bs: BettingState,
    _players: Player[],
  ): Record<string, unknown> {
    const innerPublic = this.inner.getPublicState(roomId) as Record<string, unknown>;
    const innerGlobals = (innerPublic['globals'] as Record<string, unknown> | undefined) ?? {};
    const innerPlayers = (innerPublic['players'] as Record<string, Record<string, unknown>> | undefined) ?? {};

    // Merge pending globals (exclude private fields)
    const privateFields = new Set([
      'deck_json', 'active_player_index', 'phase_advancing', 'game_over_flag',
      '_th_condition_result',
    ]);

    const mergedGlobals: Record<string, unknown> = { ...innerGlobals };
    for (const [field, value] of Object.entries(bs.pendingGlobals)) {
      if (!privateFields.has(field)) {
        mergedGlobals[field] = value;
      }
    }

    // Merge pending player state (only public fields)
    const playerPrivateFields = new Set([
      'hole_cards_json', 'available_actions_json', 'hand_result_json',
    ]);
    const mergedPlayers: Record<string, Record<string, unknown>> = {};
    for (const [pid, fields] of Object.entries(innerPlayers)) {
      mergedPlayers[pid] = { ...fields } as Record<string, unknown>;
    }
    for (const [pid, fields] of Object.entries(bs.pendingPlayers)) {
      if (!mergedPlayers[pid]) mergedPlayers[pid] = {};
      for (const [field, value] of Object.entries(fields)) {
        if (!playerPrivateFields.has(field)) {
          mergedPlayers[pid]![field] = value;
        }
      }
    }

    return {
      ...innerPublic,
      globals: mergedGlobals,
      players: mergedPlayers,
    };
  }

  /**
   * Build a synthetic private state for a player by merging inner private state
   * with pending mutations.
   */
  private buildSyntheticPrivateState(
    roomId: string,
    bs: BettingState,
    _players: Player[],
    playerId: string,
  ): Record<string, unknown> {
    const innerPrivate = this.inner.getPrivateState(roomId, playerId) as Record<string, unknown>;
    const innerGlobals = (innerPrivate['globals'] as Record<string, unknown> | undefined) ?? {};
    const innerPlayers = (innerPrivate['players'] as Record<string, Record<string, unknown>> | undefined) ?? {};

    // Merge all pending globals (including private for this player's own view)
    const mergedGlobals: Record<string, unknown> = {
      ...innerGlobals,
      ...bs.pendingGlobals,
    };
    // Strip very private fields from globals view
    delete mergedGlobals['deck_json'];

    // Merge per-player state
    const mergedPlayers: Record<string, Record<string, unknown>> = {};
    for (const [pid, fields] of Object.entries(innerPlayers)) {
      mergedPlayers[pid] = { ...fields } as Record<string, unknown>;
    }
    // Apply pending player mutations
    for (const [pid, fields] of Object.entries(bs.pendingPlayers)) {
      if (!mergedPlayers[pid]) mergedPlayers[pid] = {};
      Object.assign(mergedPlayers[pid]!, fields);
    }
    // For other players, hide private fields
    for (const [pid, fields] of Object.entries(mergedPlayers)) {
      if (pid !== playerId) {
        delete fields['hole_cards_json'];
        delete fields['available_actions_json'];
        delete fields['hand_result_json'];
      }
    }

    return {
      ...innerPrivate,
      globals: mergedGlobals,
      players: mergedPlayers,
    };
  }

  /**
   * Signal betting phase completion by submitting 'confirm' for all players.
   * This triggers the PhaseMachine's input_gate completion logic, which runs
   * on_complete → advance to next phase → on_enter of next phase.
   * The on_enter handler (th_deal_flop/turn/river/showdown) will flush
   * pending mutations BEFORE running deal logic.
   */
  private completeBettingPhase(
    roomId: string,
    bs: BettingState,
    ctx: GameContext,
    players: Player[],
  ): void {
    ctx.log.info('[th-module] Betting complete — submitting confirms to advance phase', { roomId });

    // If hand is over (win by fold), we need to skip betting phases and go to showdown.
    // Since the pending mutations already set winners_json and updated chip counts,
    // the showdown_evaluate extension will see the correct state when flushed.
    if (bs.handOver) {
      // Mark community cards as complete so showdown_evaluate skips dealing
      // (it already handles this via dealRemainingAndShowdown logic)
      ctx.log.info('[th-module] Hand over — skipping to showdown phase', { roomId });
    }

    // Submit confirms for all players to complete the current input_gate phase
    for (const player of players) {
      this.inner.handleInput(roomId, player.id, 'confirm', { confirmed: true });
    }
  }

  teardown(roomId: string): void {
    this.bettingStates.delete(roomId);
    this.roomCtx.delete(roomId);
    this.roomPlayers.delete(roomId);
    this.inner.teardown(roomId);
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a Texas Hold'em game module.
 * Used by auto-discover.ts as the createModule factory for texas-holdem.
 */
export function createTexasHoldemModule(
  definition: GameDefinition,
  gamePackage: GamePackage,
  _gameDir: string,
  timerImpl?: TimerImpl,
): GameModule {
  return new TexasHoldemGameModule(definition, gamePackage, timerImpl);
}
