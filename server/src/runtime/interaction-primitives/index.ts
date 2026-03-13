/**
 * index.ts — Public API for the Interaction Primitives subsystem.
 *
 * IMPORT RULE: Only import from this file when using the Interaction Primitives
 * from other subsystems. Never import directly from types.ts, primitives.ts,
 * input-collector.ts, or registry.ts.
 */

// Types
export type {
  InteractionPrimitive,
  InputSubmission,
  InputCollector as InputCollectorInterface,
  PrimitiveFactory,
} from './types.js';

// InputCollector class (the concrete implementation)
export { InputCollector } from './input-collector.js';

// Primitive factories (for custom primitive creation by external code)
export {
  createChoicePrimitive,
  createTextSubmitPrimitive,
  createVotePrimitive,
  createConfirmPrimitive,
} from './primitives.js';

// Registry
export {
  registerPrimitive,
  createPrimitive,
  hasPrimitive,
  getRegisteredTypes,
} from './registry.js';
