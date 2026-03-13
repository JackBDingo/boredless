/**
 * types.ts — Type definitions for the Phase Machine subsystem.
 *
 * These types are part of the public API — exported via index.ts.
 * No game-specific logic here; only structural contracts.
 */

import type { PhaseAction, PhaseNode } from '../schema-engine/index.js';

/**
 * Options required to construct a PhaseMachine.
 */
export interface PhaseMachineOptions {
  /**
   * Room identifier — used for timer engine integration.
   * Each room has one timer running at a time.
   */
  roomId: string;

  /**
   * Callback returning the current list of active session IDs for this room.
   * Called dynamically at timer start (players may reconnect/disconnect).
   */
  sessionIds: () => string[];

  /**
   * Called whenever the Phase Machine transitions to a new phase.
   * Fires after on_enter actions are executed.
   */
  onPhaseChange: (phaseId: string, phaseNode: PhaseNode) => void;

  /**
   * Called when the game ends — i.e. no advance target is found and no more
   * phases exist. The caller should tear down the game session.
   */
  onGameEnd: () => void;

  /**
   * Called for actions the Phase Machine does not handle natively.
   * The interpreter layer is responsible for handling these.
   *
   * Natively handled actions: advance, conditional, increment, set, reset_players
   * Delegated actions: score_round, content_draw, shuffle_and_merge, etc.
   */
  onAction: (action: PhaseAction) => void;
}

/**
 * Context object for expression evaluation.
 * Provides read access to game state fields without exposing StateManager internals.
 */
export interface ExpressionContext {
  /**
   * Get the value of a global state field by name.
   * Returns undefined if the field doesn't exist.
   */
  getGlobal: (field: string) => unknown;

  /**
   * Get the value of a per-player state field.
   * Optional — only required for expressions referencing per_player state.
   */
  getPlayer?: (playerId: string, field: string) => unknown;
}
