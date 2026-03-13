/**
 * schema-integration.ts — Zod schema helpers for turn model declarations.
 *
 * Defines TurnModelSchema for validating turn declarations in game YAML.
 * The turn_model field in a game package is validated against this schema
 * at load time by the Schema Engine.
 *
 * Example YAML:
 * ```yaml
 * turn_model:
 *   type: round_robin
 *   timeout: 30
 *   skip_on_timeout: true
 *   reverse_allowed: false
 * ```
 *
 * NOTE: The existing schema-engine/schema.ts has a basic TurnModelSchema stub.
 * This file provides the full, extended version used by the turn-system subsystem.
 * It is compatible with the existing schema — the extended fields are optional.
 */

import { z } from 'zod';
import type { TurnModel } from './types.js';

// ---------------------------------------------------------------------------
// Turn model type enum
// ---------------------------------------------------------------------------

export const TurnModelTypeSchema = z.enum([
  'simultaneous',
  'round_robin',
  'free_form',
  'priority_queue',
  'elimination',
]);

// ---------------------------------------------------------------------------
// Full turn model schema
// ---------------------------------------------------------------------------

/**
 * Full Zod schema for the turn_model field in a game package.
 * Used by the Schema Engine to validate YAML turn declarations.
 *
 * Field mapping (YAML → TypeScript):
 * - type           → TurnModelType (required)
 * - timeout        → timeoutMs (seconds → ms conversion happens at runtime)
 * - skip_on_timeout → skipOnTimeout (default: true)
 * - reverse_allowed → reverseAllowed (default: false)
 */
export const FullTurnModelSchema = z.object({
  /** The turn model type. Required. */
  type: TurnModelTypeSchema,
  /**
   * Per-turn timeout in seconds (stored as seconds in YAML for human readability).
   * TurnManager receives timeoutMs (milliseconds).
   * Conversion: timeoutMs = timeout * 1000
   */
  timeout: z.number().positive().optional(),
  /** If true, skip the active player when their turn timer expires. Default: true. */
  skip_on_timeout: z.boolean().optional(),
  /** If true, direction reversal is permitted (e.g. UNO reverse). Default: false. */
  reverse_allowed: z.boolean().optional(),
});

export type FullTurnModelInput = z.infer<typeof FullTurnModelSchema>;

// ---------------------------------------------------------------------------
// Helper: convert YAML turn model to TurnManager-compatible TurnModel
// ---------------------------------------------------------------------------

/**
 * Converts a validated YAML turn model declaration to the TurnModel interface
 * expected by TurnManager.
 *
 * Handles unit conversion (seconds → ms) and default values.
 *
 * @param yamlModel - The validated YAML input from FullTurnModelSchema
 * @returns TurnModel ready to pass to TurnManager constructor
 */
export function turnModelFromYaml(yamlModel: FullTurnModelInput): TurnModel {
  return {
    type: yamlModel.type,
    timeoutMs: yamlModel.timeout !== undefined ? yamlModel.timeout * 1000 : undefined,
    skipOnTimeout: yamlModel.skip_on_timeout ?? true,
    reverseAllowed: yamlModel.reverse_allowed ?? false,
  };
}

// ---------------------------------------------------------------------------
// Re-export for consumers
// ---------------------------------------------------------------------------

export type { TurnModel };
