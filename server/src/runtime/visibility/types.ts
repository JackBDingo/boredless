/**
 * types.ts — Type definitions for the Visibility & Projection subsystem.
 *
 * These types define who is asking for state, how redaction works,
 * and what the projected output looks like.
 *
 * No game-specific logic here; only structural contracts.
 */

// ---------------------------------------------------------------------------
// Audience — who is requesting the state view
// ---------------------------------------------------------------------------

/**
 * Describes who is requesting a state projection.
 *
 * - 'player'     — an active participant; playerId MUST be set
 * - 'host'       — the game host; sees everything
 * - 'spectator'  — an observer; sees public + spectator-scoped fields
 * - 'eliminated' — a player who has been knocked out; sees public only
 */
export interface Audience {
  type: 'player' | 'host' | 'spectator' | 'eliminated';
  /** Required when type === 'player' or type === 'eliminated'. */
  playerId?: string;
  /** Optional — for team-scoped visibility (Phase 2.4 will populate this). */
  teamId?: string;
}

// ---------------------------------------------------------------------------
// RedactionStrategy — how an invisible field appears in output
// ---------------------------------------------------------------------------

/**
 * Controls how a field looks when the requesting audience doesn't have
 * permission to see its real value.
 *
 * - 'omit'        — field is absent from the output (default)
 * - 'null'        — field is present but its value is null
 * - 'placeholder' — field is present with the declared placeholder value
 * - 'count'       — for arrays, output is { count: N } instead of contents
 */
export type RedactionStrategy = 'omit' | 'null' | 'placeholder' | 'count';

// ---------------------------------------------------------------------------
// FieldVisibility — full visibility declaration for a single field
// ---------------------------------------------------------------------------

/**
 * Declares who can see a field and how it should appear when redacted.
 *
 * Scopes (in ascending privilege order):
 * - 'public'    — visible to everyone
 * - 'spectator' — visible to spectators, players, and host
 * - 'team'      — visible to teammates and host (team membership tracked externally)
 * - 'private'   — visible only to the owning player and host
 * - 'host'      — visible only to the host
 */
export interface FieldVisibility {
  scope: 'public' | 'private' | 'team' | 'host' | 'spectator';
  /** What to show when the field is redacted. Default: 'omit'. */
  redaction?: RedactionStrategy;
  /** The value to use when redaction === 'placeholder'. */
  placeholder?: unknown;
}

// ---------------------------------------------------------------------------
// ProjectedState — the output of a projection
// ---------------------------------------------------------------------------

/**
 * The audience-filtered view of game state.
 *
 * Mirrors the shape of StateSnapshot but may have fields redacted or omitted.
 */
export interface ProjectedState {
  globals: Record<string, unknown>;
  players: Record<string, Record<string, unknown>>;
  teams: Record<string, Record<string, unknown>>;
  meta: {
    audience: Audience;
    /** The current phase name, or null if not available in state. */
    phase: string | null;
    /** Fields that were redacted (for debugging). Format: "players.p1.hand" or "globals.secret". */
    redactedFields: string[];
  };
}
