/**
 * validator.ts — Deep game package validation for the Authoring System.
 *
 * This goes beyond Zod schema validation (structural) to check semantic
 * correctness: reachability, referential integrity, and game playability.
 *
 * Design:
 * - Pure functions — no side effects
 * - No imports from runtime subsystems
 * - Collects all errors/warnings before returning (never throws)
 *
 * Subsystem: authoring-system
 * Phase: 4.4
 */

import type { ValidationResult, ValidationError, ValidationWarning } from './types.js';

// ---------------------------------------------------------------------------
// Built-in extension types (from the architecture plan)
// ---------------------------------------------------------------------------

const BUILT_IN_EXTENSION_TYPES = new Set([
  'renderers',
  'rules',
  'interactions',
  'scoring',
  'lifecycle',
]);

// ---------------------------------------------------------------------------
// Main validation entry point
// ---------------------------------------------------------------------------

/**
 * Perform deep semantic validation of a game package.
 *
 * Checks performed:
 * 1. Phase transitions reference existing phases
 * 2. Content sources referenced in phases exist
 * 3. Score tracks referenced in rules exist
 * 4. No orphaned phases (unreachable from initial phase)
 * 5. At least one phase has player interaction
 * 6. Victory condition references valid score track
 * 7. Extension types are either built-in or declared
 *
 * Returns a ValidationResult (never throws).
 */
export function validateGamePackage(pkg: Record<string, unknown>): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const phases = (pkg.phases ?? {}) as Record<string, unknown>;
  const phaseIds = new Set(Object.keys(phases));

  // --- 1. Phase transitions reference existing phases ---
  validatePhaseTransitions(phases, phaseIds, errors);

  // --- 2. Determine initial phase (first key in phases) ---
  const phaseKeyList = Object.keys(phases);
  const initialPhaseId = phaseKeyList[0];

  if (!initialPhaseId) {
    errors.push({
      path: 'phases',
      message: 'Game package must define at least one phase.',
      severity: 'error',
    });
  } else {
    // --- 3. Orphaned phases (unreachable from initial) ---
    validateReachability(phases, initialPhaseId, phaseIds, warnings);
  }

  // --- 4. At least one phase has player interaction ---
  validateHasInteraction(phases, warnings);

  // --- 5. Content pools referenced in phases exist ---
  validateContentReferences(pkg, phases, errors);

  // --- 6. Score tracks referenced in rules ---
  validateScoreTrackReferences(pkg, errors);

  // --- 7. Victory condition references valid score track ---
  validateVictoryCondition(pkg, errors);

  // --- 8. Extension types ---
  validateExtensionTypes(pkg, errors);

  const valid = errors.length === 0;
  return { valid, errors, warnings };
}

// ---------------------------------------------------------------------------
// Phase transition validation
// ---------------------------------------------------------------------------

function validatePhaseTransitions(
  phases: Record<string, unknown>,
  phaseIds: Set<string>,
  errors: ValidationError[],
): void {
  for (const [phaseId, node] of Object.entries(phases)) {
    const phase = (node ?? {}) as Record<string, unknown>;

    for (const hookKey of ['on_exit', 'on_complete', 'on_enter']) {
      const actions = phase[hookKey];
      if (!Array.isArray(actions)) continue;

      actions.forEach((action: unknown, i: number) => {
        const a = (action ?? {}) as Record<string, unknown>;
        const path = `phases.${phaseId}.${hookKey}[${i}]`;

        // Direct 'to' transitions
        if (typeof a.to === 'string' && !phaseIds.has(a.to)) {
          errors.push({
            path,
            message: `Transition target '${a.to}' does not exist in phases.`,
            severity: 'error',
          });
        }

        // Conditional then/else transitions
        const then_ = a.then as Record<string, unknown> | undefined;
        const else_ = a.else as Record<string, unknown> | undefined;

        if (then_ && typeof then_.advance_to === 'string' && !phaseIds.has(then_.advance_to)) {
          errors.push({
            path: `${path}.then`,
            message: `Transition target '${then_.advance_to}' does not exist in phases.`,
            severity: 'error',
          });
        }
        if (else_ && typeof else_.advance_to === 'string' && !phaseIds.has(else_.advance_to)) {
          errors.push({
            path: `${path}.else`,
            message: `Transition target '${else_.advance_to}' does not exist in phases.`,
            severity: 'error',
          });
        }
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Reachability (orphan detection)
// ---------------------------------------------------------------------------

function validateReachability(
  phases: Record<string, unknown>,
  initialId: string,
  allPhaseIds: Set<string>,
  warnings: ValidationWarning[],
): void {
  const reachable = new Set<string>();
  const queue = [initialId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);

    const phase = (phases[current] ?? {}) as Record<string, unknown>;
    for (const hookKey of ['on_exit', 'on_complete', 'on_enter']) {
      const actions = phase[hookKey];
      if (!Array.isArray(actions)) continue;

      for (const action of actions) {
        const a = (action ?? {}) as Record<string, unknown>;
        if (typeof a.to === 'string' && allPhaseIds.has(a.to)) queue.push(a.to);

        const then_ = a.then as Record<string, unknown> | undefined;
        const else_ = a.else as Record<string, unknown> | undefined;
        if (then_ && typeof then_.advance_to === 'string' && allPhaseIds.has(then_.advance_to)) {
          queue.push(then_.advance_to);
        }
        if (else_ && typeof else_.advance_to === 'string' && allPhaseIds.has(else_.advance_to)) {
          queue.push(else_.advance_to);
        }
      }
    }
  }

  for (const phaseId of allPhaseIds) {
    if (!reachable.has(phaseId)) {
      warnings.push({
        path: `phases.${phaseId}`,
        message: `Phase '${phaseId}' is unreachable from the initial phase '${initialId}'.`,
        severity: 'warning',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Interaction presence
// ---------------------------------------------------------------------------

function validateHasInteraction(
  phases: Record<string, unknown>,
  warnings: ValidationWarning[],
): void {
  const hasInteraction = Object.values(phases).some((node) => {
    const phase = (node ?? {}) as Record<string, unknown>;
    return phase.input != null;
  });

  if (!hasInteraction) {
    warnings.push({
      path: 'phases',
      message:
        'No phase defines player interaction (input). Consider adding an input_gate phase.',
      severity: 'warning',
    });
  }
}

// ---------------------------------------------------------------------------
// Content reference validation
// ---------------------------------------------------------------------------

function validateContentReferences(
  pkg: Record<string, unknown>,
  phases: Record<string, unknown>,
  errors: ValidationError[],
): void {
  const content = pkg.content as Record<string, unknown> | undefined;
  if (!content) return;

  // Collect declared content pool IDs
  const poolIds = new Set<string>();

  if (Array.isArray(content.pools)) {
    for (const pool of content.pools) {
      const p = (pool ?? {}) as Record<string, unknown>;
      if (typeof p.id === 'string') poolIds.add(p.id);
    }
  }

  // Check actions that reference content pools
  for (const [phaseId, node] of Object.entries(phases)) {
    const phase = (node ?? {}) as Record<string, unknown>;
    for (const hookKey of ['on_enter', 'on_exit', 'on_complete']) {
      const actions = phase[hookKey];
      if (!Array.isArray(actions)) continue;

      actions.forEach((action: unknown, i: number) => {
        const a = (action ?? {}) as Record<string, unknown>;
        if (a.action === 'content_draw' && typeof a.pool === 'string') {
          if (!poolIds.has(a.pool)) {
            errors.push({
              path: `phases.${phaseId}.${hookKey}[${i}]`,
              message: `Content pool '${a.pool}' is not declared in the content section.`,
              severity: 'error',
            });
          }
        }
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Score track reference validation
// ---------------------------------------------------------------------------

function validateScoreTrackReferences(
  pkg: Record<string, unknown>,
  errors: ValidationError[],
): void {
  const scoring = pkg.scoring as Record<string, unknown> | undefined;
  if (!scoring) return;

  // Only validate track references in V2 declarative scoring
  if (!Array.isArray(scoring.tracks)) return;

  const trackIds = new Set<string>(
    scoring.tracks.map((t: unknown) => {
      const track = (t ?? {}) as Record<string, unknown>;
      return typeof track.id === 'string' ? track.id : '';
    }),
  );

  // Check scoring rules reference valid tracks
  if (Array.isArray(scoring.rules)) {
    scoring.rules.forEach((rule: unknown, i: number) => {
      const r = (rule ?? {}) as Record<string, unknown>;
      if (typeof r.track === 'string' && !trackIds.has(r.track)) {
        errors.push({
          path: `scoring.rules[${i}]`,
          message: `Scoring rule references unknown track '${r.track}'.`,
          severity: 'error',
        });
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Victory condition validation
// ---------------------------------------------------------------------------

function validateVictoryCondition(
  pkg: Record<string, unknown>,
  errors: ValidationError[],
): void {
  const victory = pkg.victory as Record<string, unknown> | undefined;
  if (!victory) return;

  const scoring = pkg.scoring as Record<string, unknown> | undefined;
  if (!scoring) return;

  // If victory references a specific track, verify it exists
  if (typeof victory.track === 'string' && Array.isArray(scoring.tracks)) {
    const trackIds = new Set<string>(
      scoring.tracks.map((t: unknown) => {
        const track = (t ?? {}) as Record<string, unknown>;
        return typeof track.id === 'string' ? track.id : '';
      }),
    );

    if (!trackIds.has(victory.track)) {
      errors.push({
        path: 'victory.track',
        message: `Victory condition references unknown score track '${victory.track}'.`,
        severity: 'error',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Extension type validation
// ---------------------------------------------------------------------------

function validateExtensionTypes(
  pkg: Record<string, unknown>,
  errors: ValidationError[],
): void {
  const extensions = pkg.extensions as Record<string, unknown> | undefined;
  if (!extensions) return;

  for (const extType of Object.keys(extensions)) {
    if (!BUILT_IN_EXTENSION_TYPES.has(extType)) {
      errors.push({
        path: `extensions.${extType}`,
        message: `Unknown extension type '${extType}'. Built-in types: ${[...BUILT_IN_EXTENSION_TYPES].join(', ')}.`,
        severity: 'error',
      });
    }
  }
}
