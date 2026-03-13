/**
 * types.ts — Type definitions for the State Manager subsystem.
 *
 * These types are part of the public API — exported via index.ts.
 * No game-specific logic here; only structural contracts.
 */

/**
 * Event emitted synchronously after every state mutation.
 *
 * - scope: which category of state changed
 * - field: the field name within that scope
 * - playerId: present when scope === 'player'
 * - teamId: present when scope === 'team'
 * - oldValue: value before mutation
 * - newValue: value after mutation
 */
export interface StateChangeEvent {
  scope: 'global' | 'player' | 'team';
  field: string;
  playerId?: string;
  teamId?: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Callback invoked after a state mutation.
 * Fires synchronously — do not perform async operations inside listeners.
 */
export type StateChangeListener = (event: StateChangeEvent) => void;

/**
 * Deep snapshot of all state at a point in time.
 * Used for debugging, replay, and testing.
 * Mutations to the snapshot do not affect live state.
 */
export interface StateSnapshot {
  globals: Record<string, unknown>;
  players: Record<string, Record<string, unknown>>;
  teams: Record<string, Record<string, unknown>>;
}
