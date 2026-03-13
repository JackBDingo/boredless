/**
 * index.ts — Public API for the Phase Machine subsystem.
 *
 * IMPORT RULE: Only import from this file when using the Phase Machine
 * from other subsystems. Never import directly from phase-machine.ts,
 * expression-eval.ts, or types.ts.
 */

// Core class
export { PhaseMachine } from './phase-machine.js';
export type { TimerImpl } from './phase-machine.js';

// Expression evaluator
export { evaluateCondition } from './expression-eval.js';

// Types
export type { PhaseMachineOptions, ExpressionContext } from './types.js';
