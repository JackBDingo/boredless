/**
 * schema-integration.ts — Zod schema and parsing utilities for the Event System.
 *
 * This module defines the Zod schema for event rule declarations in game packages,
 * and provides parseEventRules() to validate and parse raw event data from YAML.
 *
 * The EventRuleSchema is intentionally permissive on optional fields,
 * mirroring the runtime defaults in EventEngine.
 */

import { z } from 'zod';
import type { EventRule } from './types.js';

// ---------------------------------------------------------------------------
// EventTriggerSchema
// ---------------------------------------------------------------------------

export const EventTriggerSchema = z.object({
  type: z.enum([
    'phase_enter',
    'phase_exit',
    'state_change',
    'input_received',
    'timer_expire',
    'game_start',
    'game_end',
  ]),
  phase: z.string().optional(),
  field: z.string().optional(),
  condition: z.string().optional(),
});

export type EventTriggerInput = z.input<typeof EventTriggerSchema>;

// ---------------------------------------------------------------------------
// EventEffectSchema
// ---------------------------------------------------------------------------

export const EventEffectSchema = z.object({
  type: z.enum([
    'set_state',
    'increment',
    'decrement',
    'add_points',
    'broadcast',
    'play_sound',
    'announce',
    'advance_phase',
    'custom',
  ]),
  target: z.string().optional(),
  value: z.unknown().optional(),
  amount: z.number().optional(),
  message: z.string().optional(),
  sound: z.string().optional(),
  custom: z.string().optional(),
  data: z.record(z.unknown()).optional(),
});

export type EventEffectInput = z.input<typeof EventEffectSchema>;

// ---------------------------------------------------------------------------
// EventRuleSchema
// ---------------------------------------------------------------------------

export const EventRuleSchema = z.object({
  id: z.string().min(1, 'Rule id must not be empty'),
  name: z.string().optional(),
  triggers: z.array(EventTriggerSchema).min(1, 'At least one trigger is required'),
  effects: z.array(EventEffectSchema).min(1, 'At least one effect is required'),
  priority: z.number().int().optional(),
  once: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export type EventRuleInput = z.input<typeof EventRuleSchema>;

// ---------------------------------------------------------------------------
// EventRulesArraySchema
// ---------------------------------------------------------------------------

export const EventRulesArraySchema = z.array(EventRuleSchema);

// ---------------------------------------------------------------------------
// parseEventRules()
// ---------------------------------------------------------------------------

/**
 * Validate and parse raw event rule data (from game YAML/JSON).
 *
 * @param rawEvents - Unvalidated array from the 'events' section of a game package
 * @returns Parsed, typed EventRule[] ready for use with EventEngine
 * @throws ZodError if any rule fails validation
 *
 * @example
 * const rules = parseEventRules(gamePackage.events ?? []);
 * const engine = new EventEngine(rules, options);
 */
export function parseEventRules(rawEvents: unknown[]): EventRule[] {
  // parseEventRules validates the full array — throws ZodError on failure
  return EventRulesArraySchema.parse(rawEvents) as EventRule[];
}

/**
 * Safely validate event rules without throwing.
 * Returns { success: true, data } or { success: false, error }.
 *
 * Use this when you want to report validation errors gracefully
 * (e.g. in the schema engine's error collection).
 *
 * @param rawEvents - Unvalidated array from the 'events' section of a game package
 */
export function safeParseEventRules(
  rawEvents: unknown[],
): { success: true; data: EventRule[] } | { success: false; error: z.ZodError } {
  const result = EventRulesArraySchema.safeParse(rawEvents);
  if (result.success) {
    return { success: true, data: result.data as EventRule[] };
  }
  return { success: false, error: result.error };
}
