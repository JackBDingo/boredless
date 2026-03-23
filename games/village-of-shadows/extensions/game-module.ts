/**
 * game-module.ts — Village of Shadows V2 game module factory.
 *
 * Creates a VOSGameModule which wraps DeclarativeGameModule and adds:
 *   1. Extension action dispatch (vos_assign_roles, vos_resolve_night, etc.)
 *   2. Custom input validation for night_action and vote (role/alive checks)
 *
 * The DeclarativeGameModule handles:
 *   - Phase state machine (timed → input_gate → timed loops)
 *   - State management (StateManager)
 *   - Projection (per-player private state via visibility)
 *   - Phase transitions and timers
 *
 * The VOS extensions handle:
 *   - Role assignment
 *   - Night resolution (reads per_player.night_target set by input_gate)
 *   - Vote resolution (reads per_player.vote_target set by input_gate)
 *   - Victory condition checking
 *   - Night/vote targeting setup
 */

import type { GameModule } from '../../../server/src/games/game-module.js';
import type { GameContext } from '../../../server/src/games/game-context.js';
import type { Player, PhaseState, GameDefinition } from '@boredless/shared';
import type { GamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';

import {
  isVOSAction,
  handleAssignRoles,
  handleSetupNight,
  handleSetupVote,
  handleResolveNight,
  handleResolveVote,
  handleCheckVictory,
  type VOSActionContext,
} from './index.js';
import { roleHasNightAction } from './role-system.js';

// ---------------------------------------------------------------------------
// Adapter: ExtensionActionContext → VOSActionContext
// ---------------------------------------------------------------------------

function toVOSContext(ctx: ExtensionActionContext): VOSActionContext {
  return {
    globals: ctx.globals,
    players: ctx.players,
    playerInfo: ctx.playerInfo,
    setGlobal: ctx.setGlobal,
    setPlayer: ctx.setPlayer,
    log: (msg: string, data?: unknown) => ctx.log(msg, data as Record<string, unknown>),
  };
}

// ---------------------------------------------------------------------------
// Extension action handler
// ---------------------------------------------------------------------------

function createVOSHandler(): ExtensionActionHandler {
  return (actionName: string, ctx: ExtensionActionContext): boolean => {
    if (!isVOSAction(actionName)) return false;
    const vosCtx = toVOSContext(ctx);
    switch (actionName) {
      case 'vos_assign_roles':    handleAssignRoles(vosCtx);    return true;
      case 'vos_setup_night':     handleSetupNight(vosCtx);     return true;
      case 'vos_setup_vote':      handleSetupVote(vosCtx);      return true;
      case 'vos_resolve_night':   handleResolveNight(vosCtx);   return true;
      case 'vos_resolve_vote':    handleResolveVote(vosCtx);    return true;
      case 'vos_check_victory':   handleCheckVictory(vosCtx);   return true;
      default: return false;
    }
  };
}

// ---------------------------------------------------------------------------
// VOSGameModule — wraps DeclarativeGameModule with custom input handling
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around DeclarativeGameModule that adds VOS-specific
 * input validation for night_action and vote inputs.
 *
 * All phase state machine logic (timers, transitions, state projection)
 * is delegated to DeclarativeGameModule. Only input routing is overridden.
 */
class VOSGameModule implements GameModule {
  readonly definition: GameDefinition;
  private readonly inner: DeclarativeGameModule;

  constructor(
    definition: GameDefinition,
    gamePackage: GamePackage,
    timerImpl?: TimerImpl,
  ) {
    this.definition = definition;
    this.inner = new DeclarativeGameModule(
      definition,
      gamePackage,
      timerImpl,
      createVOSHandler(),
    );
  }

  setup(players: Player[], ctx: GameContext): void {
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

  /**
   * Handle input with VOS-specific validation.
   *
   * night_action → validates player is alive + has night role + hasn't acted
   * vote         → validates player is alive + valid target
   * Other inputs → pass directly to inner module
   */
  handleInput(
    roomId: string,
    playerId: string,
    inputType: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (inputType === 'night_action') {
      return this.handleNightAction(roomId, playerId, payload);
    }
    if (inputType === 'vote') {
      return this.handleVote(roomId, playerId, payload);
    }
    return this.inner.handleInput(roomId, playerId, inputType, payload);
  }

  private handleNightAction(
    roomId: string,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const phaseType = this.inner.getPhaseState(roomId).phaseType;
    if (phaseType !== 'night') {
      return { accepted: false, reason: 'Not night phase' };
    }

    // Check per-player private state
    const privateState = this.inner.getPrivateState(roomId, playerId);
    const playerFields = this.getPlayerFields(privateState, playerId);

    if (!playerFields['is_alive']) {
      return { accepted: false, reason: 'Dead players cannot act' };
    }

    const role = playerFields['role'] as string | null;
    if (!role || !roleHasNightAction(role as import('./role-system.js').VOSRole)) {
      return { accepted: false, reason: 'Villagers have no night action' };
    }

    if (playerFields['has_acted']) {
      return { accepted: false, reason: 'Already acted this night' };
    }

    const targetPlayerId = String(
      payload['targetPlayerId'] ?? payload['value'] ?? '',
    );
    if (!targetPlayerId) {
      return { accepted: false, reason: 'No target specified' };
    }

    // Validate target is alive via public state
    const targetAlive = this.getPlayerAliveStatus(roomId, targetPlayerId);
    if (!targetAlive) {
      return { accepted: false, reason: 'Target is not alive' };
    }

    // Delegate to inner module — records per_player.night_target
    return this.inner.handleInput(roomId, playerId, 'vote', {
      value: targetPlayerId,
    });
  }

  private handleVote(
    roomId: string,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const phaseType = this.inner.getPhaseState(roomId).phaseType;
    if (phaseType !== 'vote') {
      return { accepted: false, reason: 'Not vote phase' };
    }

    // Check per-player private state
    const privateState = this.inner.getPrivateState(roomId, playerId);
    const playerFields = this.getPlayerFields(privateState, playerId);

    if (!playerFields['is_alive']) {
      return { accepted: false, reason: 'Dead players cannot vote' };
    }

    if (playerFields['has_voted']) {
      return { accepted: false, reason: 'Already voted' };
    }

    const targetPlayerId = String(
      payload['targetPlayerId'] ?? payload['value'] ?? payload['answerId'] ?? '',
    );
    if (!targetPlayerId) {
      return { accepted: false, reason: 'No target specified' };
    }
    if (targetPlayerId === playerId) {
      return { accepted: false, reason: 'Cannot vote for yourself' };
    }

    const targetAlive = this.getPlayerAliveStatus(roomId, targetPlayerId);
    if (!targetAlive) {
      return { accepted: false, reason: 'Target is not alive' };
    }

    // Delegate to inner module — records per_player.vote_target
    return this.inner.handleInput(roomId, playerId, 'vote', {
      value: targetPlayerId,
    });
  }

  teardown(roomId: string): void {
    this.inner.teardown(roomId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Get a player's per-player fields from a private state projection.
   * DeclarativeGameModule's buildPrivateState returns:
   *   { globals: {...}, players: {...}, phase: '...', input: {...} }
   * Per-player fields are under players[playerId].
   */
  private getPlayerFields(
    privateState: Record<string, unknown>,
    playerId: string,
  ): Record<string, unknown> {
    const players = privateState['players'] as Record<string, Record<string, unknown>> | undefined;
    return players?.[playerId] ?? {};
  }

  /**
   * Check if a player is alive via public state.
   * Uses is_alive from the players map in public state projection.
   */
  private getPlayerAliveStatus(roomId: string, playerId: string): boolean {
    const publicState = this.inner.getPublicState(roomId);
    const players = publicState['players'] as Record<string, Record<string, unknown>> | undefined;
    if (!players) return false;
    const playerFields = players[playerId];
    return Boolean(playerFields?.['is_alive']);
  }
}

// ---------------------------------------------------------------------------
// Factory function — called by auto-discover.ts
// ---------------------------------------------------------------------------

/**
 * Create a Village of Shadows V2 game module.
 * Factory function matches the pattern auto-discover.ts looks for:
 *   create*Module
 */
export function createVOSModule(
  definition: GameDefinition,
  gamePackage: GamePackage,
  _gameDir: string,
  timerImpl?: TimerImpl,
): GameModule {
  return new VOSGameModule(definition, gamePackage, timerImpl);
}
