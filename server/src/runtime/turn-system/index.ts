/**
 * index.ts — Public API for the Turn & Initiative subsystem.
 *
 * Only import from this file when using the turn system from other subsystems.
 * Never import directly from turn-manager.ts, types.ts, or schema-integration.ts.
 */

// Core class
export { TurnManager } from './turn-manager.js';

// Types
export type {
  TurnModelType,
  TurnModel,
  TurnState,
  TurnEvent,
  TurnEventType,
  TurnManagerOptions,
} from './types.js';

// Schema integration
export {
  TurnModelTypeSchema,
  FullTurnModelSchema,
  turnModelFromYaml,
} from './schema-integration.js';
export type { FullTurnModelInput } from './schema-integration.js';
