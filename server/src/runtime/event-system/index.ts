/**
 * index.ts — Public API for the Event System subsystem.
 *
 * IMPORT RULE: Only import from this file when using the Event System
 * from other subsystems. Never import directly from event-engine.ts, types.ts,
 * or schema-integration.ts.
 *
 * Subsystem: event-system
 * Phase: 2.2
 */

// Core engine
export { EventEngine } from './event-engine.js';

// Schema integration (Zod schemas + parser)
export {
  EventRuleSchema,
  EventTriggerSchema,
  EventEffectSchema,
  EventRulesArraySchema,
  parseEventRules,
  safeParseEventRules,
} from './schema-integration.js';

// Types
export type {
  EventTrigger,
  EventEffect,
  EventRule,
  FiredEvent,
  EffectContext,
  EventEngineOptions,
} from './types.js';
