/**
 * state-manager.ts — StateManager class for Boredless V2.
 *
 * Replaces the per-game `this.states = new Map<string, GameState>()` pattern.
 * Authoritative game state storage with:
 * - Schema-driven initialization from declared defaults
 * - Typed get/set for globals, per-player, per-team
 * - Change events (observable, synchronous)
 * - Transient state reset (phase transitions)
 * - Visibility-aware projection (public vs private)
 * - Snapshot for debugging/replay
 *
 * DESIGN CONTRACT:
 * - No game-specific logic. StateManager doesn't know what fields mean.
 * - All mutations go through set methods (enables change tracking).
 * - State stored in plain Maps/objects (not class instances).
 * - Thread safety not required (single-threaded Node.js).
 */

import type { StateModel, StateField } from '../schema-engine/index.js';
import type {
  StateChangeEvent,
  StateChangeListener,
  StateSnapshot,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a default-value record from a map of StateField definitions.
 * Returns a plain object with each field set to its declared default.
 */
function buildDefaults(fields: Record<string, StateField>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    // null is a valid default — preserve it explicitly
    result[name] = field.default ?? null;
  }
  return result;
}

/**
 * Deep clone a plain value. Handles primitives, null, arrays, and plain objects.
 * Not meant for class instances, functions, or circular references.
 */
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = deepClone(v);
  }
  return result as T;
}

// ---------------------------------------------------------------------------
// StateManager
// ---------------------------------------------------------------------------

export class StateManager {
  // --- Schema (held for reset/projection) ---
  private readonly stateModel: StateModel;

  // --- Live state storage ---
  private globals: Record<string, unknown>;
  private readonly playerStates: Map<string, Record<string, unknown>>;
  private readonly teamStates: Map<string, Record<string, unknown>>;
  private readonly playerIds: string[];

  // --- Change listeners ---
  private readonly listeners: Set<StateChangeListener>;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /**
   * Initialize a StateManager from a validated StateModel and a list of player IDs.
   *
   * @param stateModel - The state_model section from a GamePackage (already validated by Schema Engine)
   * @param playerIds  - Active player IDs for this game session
   */
  constructor(stateModel: StateModel, playerIds: string[]) {
    this.stateModel = stateModel;
    this.listeners = new Set();
    this.playerIds = [...playerIds];

    // Initialize globals
    this.globals = stateModel.globals ? buildDefaults(stateModel.globals) : {};

    // Initialize per-player state
    this.playerStates = new Map();
    const perPlayerDefaults = stateModel.per_player
      ? buildDefaults(stateModel.per_player)
      : {};
    for (const playerId of playerIds) {
      this.playerStates.set(playerId, deepClone(perPlayerDefaults));
    }

    // Initialize per-team state (empty by default; populated by setTeam)
    this.teamStates = new Map();
  }

  // ---------------------------------------------------------------------------
  // Change event subscription
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to state change events.
   * Listeners fire synchronously after each mutation.
   *
   * @returns Unsubscribe function — call it to stop receiving events.
   */
  onChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Emit a change event to all subscribers. */
  private emit(event: StateChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // ---------------------------------------------------------------------------
  // Globals
  // ---------------------------------------------------------------------------

  /** Get the value of a global field. Returns undefined if field doesn't exist. */
  getGlobal(field: string): unknown {
    return this.globals[field];
  }

  /** Set a global field value. Emits a change event. */
  setGlobal(field: string, value: unknown): void {
    const oldValue = this.globals[field];
    this.globals[field] = value;
    this.emit({ scope: 'global', field, oldValue, newValue: value });
  }

  /** Return all global fields as a plain object (shallow copy). */
  getGlobals(): Record<string, unknown> {
    return { ...this.globals };
  }

  // ---------------------------------------------------------------------------
  // Per-player
  // ---------------------------------------------------------------------------

  /**
   * Get the value of a per-player field for a given player.
   * Returns undefined if the player or field doesn't exist.
   */
  getPlayer(playerId: string, field: string): unknown {
    return this.playerStates.get(playerId)?.[field];
  }

  /** Set a per-player field value. Emits a change event. */
  setPlayer(playerId: string, field: string, value: unknown): void {
    let state = this.playerStates.get(playerId);
    if (!state) {
      // Auto-register unknown players (graceful handling)
      state = {};
      this.playerStates.set(playerId, state);
    }
    const oldValue = state[field];
    state[field] = value;
    this.emit({ scope: 'player', field, playerId, oldValue, newValue: value });
  }

  /** Return all fields for a single player as a plain object (shallow copy). */
  getPlayerState(playerId: string): Record<string, unknown> {
    const state = this.playerStates.get(playerId);
    return state ? { ...state } : {};
  }

  /** Return all players' states as a Map<playerId, fields>. Each value is a shallow copy. */
  getAllPlayerStates(): Map<string, Record<string, unknown>> {
    const result = new Map<string, Record<string, unknown>>();
    for (const [id, state] of this.playerStates) {
      result.set(id, { ...state });
    }
    return result;
  }

  /** Return the list of player IDs this manager was initialized with. */
  getPlayerIds(): string[] {
    return [...this.playerIds];
  }

  // ---------------------------------------------------------------------------
  // Per-team (stub — full team support is Phase 2)
  // ---------------------------------------------------------------------------

  /**
   * Get the value of a per-team field.
   * Returns undefined if the team or field doesn't exist.
   */
  getTeam(teamId: string, field: string): unknown {
    return this.teamStates.get(teamId)?.[field];
  }

  /** Set a per-team field value. Emits a change event. */
  setTeam(teamId: string, field: string, value: unknown): void {
    let state = this.teamStates.get(teamId);
    if (!state) {
      state = {};
      this.teamStates.set(teamId, state);
    }
    const oldValue = state[field];
    state[field] = value;
    this.emit({ scope: 'team', field, teamId, oldValue, newValue: value });
  }

  // ---------------------------------------------------------------------------
  // Bulk operations
  // ---------------------------------------------------------------------------

  /**
   * Set the same field to the same value for ALL players.
   * Useful for resetting per-round state (e.g. clearing submissions before a new round).
   * Emits one change event per player.
   */
  setPlayerAll(field: string, value: unknown): void {
    for (const playerId of this.playerStates.keys()) {
      this.setPlayer(playerId, field, value);
    }
  }

  /**
   * Reset ALL state (globals + per-player + per-team) back to schema defaults.
   * For phase transitions or round resets.
   * Emits change events for every field that changes value.
   */
  resetTransientState(): void {
    // Reset globals to declared defaults
    if (this.stateModel.globals) {
      const defaults = buildDefaults(this.stateModel.globals);
      for (const [field, value] of Object.entries(defaults)) {
        this.setGlobal(field, value);
      }
    }

    // Reset per-player to declared defaults
    if (this.stateModel.per_player) {
      const defaults = buildDefaults(this.stateModel.per_player);
      for (const playerId of this.playerStates.keys()) {
        for (const [field, value] of Object.entries(defaults)) {
          this.setPlayer(playerId, field, deepClone(value));
        }
      }
    }

    // Reset per-team to declared defaults (stubs — no schema for teams yet)
    if (this.stateModel.per_team) {
      const defaults = buildDefaults(this.stateModel.per_team);
      for (const teamId of this.teamStates.keys()) {
        for (const [field, value] of Object.entries(defaults)) {
          this.setTeam(teamId, field, deepClone(value));
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  /**
   * Return a deep copy of the entire state.
   * Mutations to the snapshot will NOT affect live state.
   * Use for debugging, logging, and replay.
   */
  snapshot(): StateSnapshot {
    const players: Record<string, Record<string, unknown>> = {};
    for (const [id, state] of this.playerStates) {
      players[id] = deepClone(state);
    }

    const teams: Record<string, Record<string, unknown>> = {};
    for (const [id, state] of this.teamStates) {
      teams[id] = deepClone(state);
    }

    return {
      globals: deepClone(this.globals),
      players,
      teams,
    };
  }

  // ---------------------------------------------------------------------------
  // Visibility-aware projection
  // (Basic implementation — full projection system is Phase 2)
  // ---------------------------------------------------------------------------

  /**
   * Return the public view of game state:
   * - All global fields where visibility is 'public' (or no visibility declared)
   * - Per-player fields where visibility is 'public', keyed by playerId
   *
   * This is suitable for display screens and spectators.
   */
  getPublicState(): Record<string, unknown> {
    // Public globals
    const globals: Record<string, unknown> = {};
    const globalDefs = this.stateModel.globals ?? {};
    for (const [field, def] of Object.entries(globalDefs)) {
      if (!def.visibility || def.visibility === 'public') {
        globals[field] = this.globals[field];
      }
    }
    // For globals not in schema (e.g. dynamically set), include them as-is
    for (const field of Object.keys(this.globals)) {
      if (!(field in globalDefs)) {
        globals[field] = this.globals[field];
      }
    }

    // Public per-player fields
    const perPlayerDefs = this.stateModel.per_player ?? {};
    const publicPlayerFields = Object.entries(perPlayerDefs)
      .filter(([, def]) => !def.visibility || def.visibility === 'public')
      .map(([field]) => field);

    const players: Record<string, Record<string, unknown>> = {};
    for (const [playerId, state] of this.playerStates) {
      const playerPublic: Record<string, unknown> = {};
      for (const field of publicPlayerFields) {
        if (field in state) {
          playerPublic[field] = state[field];
        }
      }
      players[playerId] = playerPublic;
    }

    return { globals, players };
  }

  /**
   * Return the private view of state for a specific player:
   * - All global fields (same as public)
   * - ALL fields for this specific player (public + private)
   * - Only PUBLIC fields for all OTHER players
   *
   * This is suitable for sending to an individual player's phone.
   */
  getPrivateState(playerId: string): Record<string, unknown> {
    // All globals (player sees everything in globals)
    const globals: Record<string, unknown> = { ...this.globals };

    const perPlayerDefs = this.stateModel.per_player ?? {};
    const publicPlayerFields = new Set(
      Object.entries(perPlayerDefs)
        .filter(([, def]) => !def.visibility || def.visibility === 'public')
        .map(([field]) => field),
    );

    const players: Record<string, Record<string, unknown>> = {};
    for (const [pid, state] of this.playerStates) {
      if (pid === playerId) {
        // This player sees ALL their own fields
        players[pid] = { ...state };
      } else {
        // Other players — only public fields
        const otherPublic: Record<string, unknown> = {};
        for (const field of publicPlayerFields) {
          if (field in state) {
            otherPublic[field] = state[field];
          }
        }
        players[pid] = otherPublic;
      }
    }

    return { globals, players };
  }
}
