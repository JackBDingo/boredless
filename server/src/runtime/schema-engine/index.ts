/**
 * index.ts — Public API for the Schema Engine subsystem.
 *
 * Only import from this file when using the schema engine from other subsystems.
 * Never import directly from schema.ts or loader.ts.
 */

// Schema
export { GamePackageSchema, RedactionStrategySchema, VisibilityScopeSchema } from './schema.js';
export type { GamePackage } from './schema.js';

// Additional type exports for consumers that need them
export type {
  ManifestV2,
  StateModel,
  StateField,
  PhaseNode,
  PhaseAction,
  PhaseInput,
  PhaseScreens,
  Phases,
  TurnModel,
  Presentation,
  Scoring,
  Victory,
} from './schema.js';

// Loader
export { loadGamePackage, validateGamePackage } from './loader.js';
