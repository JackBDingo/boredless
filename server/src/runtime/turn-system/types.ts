/**
 * types.ts — Type definitions for the Turn & Initiative subsystem.
 *
 * Defines the declarative turn model types that map to game schema declarations.
 * TurnManager uses these to manage who acts when, in what order.
 *
 * Turn models:
 * - simultaneous: all non-eliminated players act at once (e.g. Bluffalo, quiz games)
 * - round_robin: one player acts at a time, cycling in order (e.g. card games)
 * - free_form: anyone can act anytime, no ordering enforced (e.g. open lobbies)
 * - priority_queue: players act in a declared priority order, first in queue goes first
 * - elimination: all remaining players active; players removed as they lose
 */

// ---------------------------------------------------------------------------
// Turn model declaration (goes in game.yaml as turn_model)
// ---------------------------------------------------------------------------

export type TurnModelType =
  | 'simultaneous'
  | 'round_robin'
  | 'free_form'
  | 'priority_queue'
  | 'elimination';

export interface TurnModel {
  /** The turn structure for this game/phase. */
  type: TurnModelType;
  /** Per-turn timeout in milliseconds. Caller is responsible for actual timer management. */
  timeoutMs?: number;
  /** If true, a player is skipped when their turn timer expires (default: true). */
  skipOnTimeout?: boolean;
  /** If true, direction reversal is allowed (e.g. UNO reverse card). */
  reverseAllowed?: boolean;
}

// ---------------------------------------------------------------------------
// Runtime turn state
// ---------------------------------------------------------------------------

export interface TurnState {
  /** The active turn model type. */
  model: TurnModelType;
  /** Player IDs who can currently act. Size 1 for round_robin, all for simultaneous. */
  activePlayerIds: string[];
  /** Ordered list of all player IDs in turn order. Eliminated players remain here for index tracking. */
  turnOrder: string[];
  /** Current position in turnOrder (round_robin/priority_queue). */
  currentIndex: number;
  /** Which round we're on (increments when we wrap through all players). */
  round: number;
  /** Turn direction: 1 = forward, -1 = reversed. */
  direction: 1 | -1;
  /** Player IDs that have been permanently eliminated from the game. */
  eliminated: Set<string>;
  /** Player IDs skipped during the current round (cleared on resetRound). */
  skipped: Set<string>;
}

// ---------------------------------------------------------------------------
// Turn events
// ---------------------------------------------------------------------------

export type TurnEventType =
  | 'turn_start'
  | 'turn_end'
  | 'turn_skip'
  | 'turn_timeout'
  | 'round_complete'
  | 'direction_reverse'
  | 'player_eliminated';

export interface TurnEvent {
  type: TurnEventType;
  /** The player ID this event applies to (not set for round_complete, direction_reverse). */
  playerId?: string;
  /** The round number at time of event. */
  round?: number;
}

// ---------------------------------------------------------------------------
// TurnManager options
// ---------------------------------------------------------------------------

export interface TurnManagerOptions {
  /** Called whenever a turn event occurs. */
  onTurnEvent?: (event: TurnEvent) => void;
  /** If true, randomize the initial turn order. Default: false. */
  shuffle?: boolean;
}
