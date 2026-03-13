/**
 * screen-resolver.ts — Screen resolution and surface filtering.
 *
 * Responsibilities:
 * - resolveScreen: bind state values to component bindings, attach theme
 * - getScreensForSurface: filter screens by surface (display/phone/both)
 * - getScreenForPhase: find the screen matching a given phase id + surface
 */

import type {
  ScreenDeclaration,
  ResolvedScreen,
  GameTheme,
} from './types.js';

// ---------------------------------------------------------------------------
// State path resolver
// ---------------------------------------------------------------------------

/**
 * Resolves a dotted state path against a flat state snapshot.
 *
 * Supports paths like:
 * - "globals.round"
 * - "phase.timeRemaining"
 * - "players.player1.score"
 *
 * Returns undefined if any segment of the path is missing.
 * Never throws — missing paths are expected and handled gracefully.
 */
function resolvePath(state: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = state;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ---------------------------------------------------------------------------
// resolveScreen
// ---------------------------------------------------------------------------

/**
 * Resolves a screen declaration against live game state.
 *
 * - Collects all `binding` fields from components
 * - Looks up each binding path in `state`
 * - Attaches the resolved theme
 * - Returns a ResolvedScreen ready for the client to render
 *
 * Never throws on missing bindings — they resolve to `undefined`.
 */
export function resolveScreen(
  declaration: ScreenDeclaration,
  state: Record<string, unknown>,
  theme: GameTheme,
): ResolvedScreen {
  const bindings: Record<string, unknown> = {};

  // Collect bindings from all components
  if (declaration.components) {
    for (const component of declaration.components) {
      if (component.binding !== undefined) {
        bindings[component.binding] = resolvePath(state, component.binding);
      }
    }
  }

  return {
    declaration,
    theme,
    bindings,
  };
}

// ---------------------------------------------------------------------------
// getScreensForSurface
// ---------------------------------------------------------------------------

/**
 * Filters screen declarations by target surface.
 *
 * A screen with `surface: 'both'` is included for both 'display' and 'phone'.
 * A screen with `surface: 'display'` is only included when filtering for 'display'.
 */
export function getScreensForSurface(
  screens: ScreenDeclaration[],
  surface: 'display' | 'phone',
): ScreenDeclaration[] {
  return screens.filter(
    (s) => s.surface === surface || s.surface === 'both',
  );
}

// ---------------------------------------------------------------------------
// getScreenForPhase
// ---------------------------------------------------------------------------

/**
 * Finds the best matching screen for a given phase and surface.
 *
 * Matching precedence (most specific first):
 * 1. `screen.id === "${phaseId}_${surface}"` — explicit surface-specific screen
 * 2. `screen.id === phaseId` — exact phase match (surface-agnostic)
 * 3. `screen.id.startsWith(phaseId + '_')` — prefixed variant
 *
 * Returns `undefined` if no match is found.
 */
export function getScreenForPhase(
  screens: ScreenDeclaration[],
  phaseId: string,
  surface: 'display' | 'phone',
): ScreenDeclaration | undefined {
  const surfaceScreens = getScreensForSurface(screens, surface);

  // Priority 1: explicit surface-specific id (e.g. "play_display")
  const surfaceSpecific = surfaceScreens.find(
    (s) => s.id === `${phaseId}_${surface}`,
  );
  if (surfaceSpecific) return surfaceSpecific;

  // Priority 2: exact phase id match
  const exact = surfaceScreens.find((s) => s.id === phaseId);
  if (exact) return exact;

  // Priority 3: prefixed variant (e.g. "play_something")
  const prefixed = surfaceScreens.find((s) => s.id.startsWith(`${phaseId}_`));
  if (prefixed) return prefixed;

  return undefined;
}
