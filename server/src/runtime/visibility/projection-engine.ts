/**
 * projection-engine.ts — ProjectionEngine: audience-aware state projection.
 *
 * Given a full StateSnapshot and an Audience, returns only the fields that
 * the audience is permitted to see, with redaction applied as declared.
 *
 * DESIGN CONTRACT:
 * - No game-specific logic. Behavior is driven entirely by field declarations.
 * - Reads StateModel to build a visibility map at construction time.
 * - The 'project' method is pure: same inputs → same output, no side effects.
 * - Does not mutate the input snapshot.
 * - host audience sees EVERYTHING, always.
 */

import type { StateModel } from '../schema-engine/index.js';
import type { StateSnapshot } from '../state-manager/index.js';
import type { Audience, FieldVisibility, ProjectedState, RedactionStrategy } from './types.js';

// ---------------------------------------------------------------------------
// Internal visibility map (built once in constructor)
// ---------------------------------------------------------------------------

/**
 * Compiled visibility record for a single field:
 * the resolved FieldVisibility plus an explicit field name for error messages.
 */
interface CompiledFieldVisibility extends FieldVisibility {
  fieldName: string;
}

// ---------------------------------------------------------------------------
// Visibility resolution helpers
// ---------------------------------------------------------------------------

/**
 * Determine if the given audience can see a field with the given scope.
 *
 * Visibility hierarchy:
 *   host        → sees everything
 *   player      → sees public, spectator, team (own team only), private (own fields)
 *   spectator   → sees public, spectator
 *   eliminated  → sees public only
 *
 * Note: 'team' visibility for per_player fields works differently —
 * team membership is checked by the caller (projectPlayerFields).
 */
function canSeeScope(
  scope: FieldVisibility['scope'],
  audience: Audience,
  isOwnField: boolean,
  isTeammate: boolean,
): boolean {
  // Host sees everything
  if (audience.type === 'host') return true;

  switch (scope) {
    case 'public':
      return true;

    case 'spectator':
      // Spectators and above can see spectator-scoped fields
      return audience.type === 'spectator' || audience.type === 'player';

    case 'team':
      // Only teammates (and host) — checked by isTeammate flag
      return isTeammate;

    case 'private':
      // Only the owner (and host)
      return isOwnField;

    case 'host':
      // Host only — already handled above
      return false;

    default:
      return false;
  }
}

/**
 * Apply redaction strategy to a field value.
 * Returns the redacted value (or undefined to signal 'omit').
 */
function applyRedaction(
  value: unknown,
  strategy: RedactionStrategy,
  placeholder: unknown,
): unknown | undefined {
  switch (strategy) {
    case 'omit':
      return undefined; // sentinel: don't include this field

    case 'null':
      return null;

    case 'placeholder':
      return placeholder ?? '?';

    case 'count':
      if (Array.isArray(value)) {
        return { count: value.length };
      }
      // Non-array: fall back to null for count
      return null;

    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// ProjectionEngine
// ---------------------------------------------------------------------------

export class ProjectionEngine {
  /** Visibility map for global fields (fieldName → compiled visibility). */
  private readonly globalVisibility: Map<string, CompiledFieldVisibility>;
  /** Visibility map for per_player fields. */
  private readonly playerVisibility: Map<string, CompiledFieldVisibility>;
  /** Visibility map for per_team fields. */
  private readonly teamVisibility: Map<string, CompiledFieldVisibility>;

  /**
   * Build the projection engine from a validated StateModel.
   *
   * Reads all field definitions and pre-compiles the visibility map so
   * the project() method doesn't need to traverse the schema every call.
   */
  constructor(stateModel: StateModel) {
    this.globalVisibility = ProjectionEngine.compileVisibilityMap(
      stateModel.globals ?? {},
    );
    this.playerVisibility = ProjectionEngine.compileVisibilityMap(
      stateModel.per_player ?? {},
    );
    this.teamVisibility = ProjectionEngine.compileVisibilityMap(
      stateModel.per_team ?? {},
    );
  }

  /**
   * Project the full game state to only what the audience can see.
   *
   * @param state    - Full authoritative state snapshot (from StateManager.snapshot())
   * @param audience - Who is requesting the view
   * @returns        - Filtered + redacted state suitable for sending to the audience
   */
  project(state: StateSnapshot, audience: Audience): ProjectedState {
    const redactedFields: string[] = [];

    // --- Globals ---
    const globals = this.projectGlobals(state.globals, audience, redactedFields);

    // --- Per-player ---
    const players = this.projectAllPlayers(state.players, audience, redactedFields);

    // --- Per-team ---
    const teams = this.projectTeams(state.teams, audience, redactedFields);

    // --- Phase (extracted from globals.phase if present) ---
    const phase =
      typeof state.globals['phase'] === 'string' ? state.globals['phase'] : null;

    return {
      globals,
      players,
      teams,
      meta: {
        audience,
        phase,
        redactedFields,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private projection helpers
  // ---------------------------------------------------------------------------

  /** Project all global fields for the given audience. */
  private projectGlobals(
    globals: Record<string, unknown>,
    audience: Audience,
    redactedFields: string[],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [fieldName, value] of Object.entries(globals)) {
      const vis = this.globalVisibility.get(fieldName);

      if (!vis) {
        // No visibility declaration → default to public (accessible to all)
        result[fieldName] = value;
        continue;
      }

      const canSee = canSeeScope(vis.scope, audience, false, false);

      if (canSee) {
        result[fieldName] = value;
      } else {
        const redacted = this.applyFieldRedaction(
          `globals.${fieldName}`,
          value,
          vis,
          redactedFields,
        );
        if (redacted !== undefined) {
          result[fieldName] = redacted;
        }
      }
    }

    return result;
  }

  /** Project per-player state for all players. */
  private projectAllPlayers(
    players: Record<string, Record<string, unknown>>,
    audience: Audience,
    redactedFields: string[],
  ): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};

    for (const [playerId, playerState] of Object.entries(players)) {
      // Only active players see their own private fields.
      // Eliminated players see public fields only (same as spectator, but less).
      const isOwnPlayer =
        audience.type === 'player' &&
        audience.playerId === playerId;

      result[playerId] = this.projectPlayerFields(
        playerId,
        playerState,
        audience,
        isOwnPlayer,
        redactedFields,
      );
    }

    return result;
  }

  /** Project a single player's fields for the given audience. */
  private projectPlayerFields(
    playerId: string,
    playerState: Record<string, unknown>,
    audience: Audience,
    isOwnPlayer: boolean,
    redactedFields: string[],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [fieldName, value] of Object.entries(playerState)) {
      const vis = this.playerVisibility.get(fieldName);

      if (!vis) {
        // No declaration → default to public
        result[fieldName] = value;
        continue;
      }

      // Team visibility: a player is a "teammate" if they share a teamId
      // Phase 2.4 will provide real team membership; for now we use the
      // audience.teamId as a stub — same teamId = teammate.
      const isTeammate =
        audience.type === 'player' &&
        audience.teamId != null &&
        // The audience's team membership is declared on the audience object;
        // per-player teamId would need to come from a team registry (Phase 2.4).
        // For now: team visibility degrades to private (own player sees it).
        isOwnPlayer;

      const canSee = canSeeScope(vis.scope, audience, isOwnPlayer, isTeammate);

      if (canSee) {
        result[fieldName] = value;
      } else {
        const redacted = this.applyFieldRedaction(
          `players.${playerId}.${fieldName}`,
          value,
          vis,
          redactedFields,
        );
        if (redacted !== undefined) {
          result[fieldName] = redacted;
        }
      }
    }

    return result;
  }

  /** Project per-team state for the given audience. */
  private projectTeams(
    teams: Record<string, Record<string, unknown>>,
    audience: Audience,
    redactedFields: string[],
  ): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};

    for (const [teamId, teamState] of Object.entries(teams)) {
      const isOwnTeam =
        audience.type === 'player' && audience.teamId === teamId;

      const projectedTeam: Record<string, unknown> = {};

      for (const [fieldName, value] of Object.entries(teamState)) {
        const vis = this.teamVisibility.get(fieldName);

        if (!vis) {
          // No declaration → default to public
          projectedTeam[fieldName] = value;
          continue;
        }

        const canSee = canSeeScope(vis.scope, audience, isOwnTeam, isOwnTeam);

        if (canSee) {
          projectedTeam[fieldName] = value;
        } else {
          const redacted = this.applyFieldRedaction(
            `teams.${teamId}.${fieldName}`,
            value,
            vis,
            redactedFields,
          );
          if (redacted !== undefined) {
            projectedTeam[fieldName] = redacted;
          }
        }
      }

      result[teamId] = projectedTeam;
    }

    return result;
  }

  /**
   * Apply the field's redaction strategy. Returns the redacted value, or
   * undefined if the field should be omitted entirely.
   * Pushes to redactedFields for debugging.
   */
  private applyFieldRedaction(
    path: string,
    value: unknown,
    vis: CompiledFieldVisibility,
    redactedFields: string[],
  ): unknown | undefined {
    redactedFields.push(path);
    const strategy: RedactionStrategy = vis.redaction ?? 'omit';
    return applyRedaction(value, strategy, vis.placeholder);
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a visibility map from a record of StateField definitions.
   * Handles fields that may or may not have a visibility declaration.
   */
  private static compileVisibilityMap(
    fields: Record<string, { visibility?: string; redaction?: string; placeholder?: unknown }>,
  ): Map<string, CompiledFieldVisibility> {
    const map = new Map<string, CompiledFieldVisibility>();

    for (const [fieldName, field] of Object.entries(fields)) {
      if (!field.visibility) continue; // no declaration → handled as public by default

      map.set(fieldName, {
        fieldName,
        scope: field.visibility as FieldVisibility['scope'],
        redaction: (field.redaction as RedactionStrategy | undefined) ?? 'omit',
        placeholder: field.placeholder,
      });
    }

    return map;
  }
}
