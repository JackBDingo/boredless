/**
 * index.ts — Public API for the Visibility & Projection subsystem.
 *
 * IMPORT RULE: Only import from this file when using the Visibility subsystem
 * from other subsystems. Never import directly from projection-engine.ts or types.ts.
 */

// Core class
export { ProjectionEngine } from './projection-engine.js';

// Types
export type {
  Audience,
  RedactionStrategy,
  FieldVisibility,
  ProjectedState,
} from './types.js';
