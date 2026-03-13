/**
 * index.ts — Public API for the State Manager subsystem.
 *
 * IMPORT RULE: Only import from this file when using the State Manager
 * from other subsystems. Never import directly from state-manager.ts or types.ts.
 */

// Core class
export { StateManager } from './state-manager.js';

// Types
export type {
  StateChangeEvent,
  StateChangeListener,
  StateSnapshot,
} from './types.js';
