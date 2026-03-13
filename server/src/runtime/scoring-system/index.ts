/**
 * index.ts — Public API for the Scoring & Victory subsystem.
 *
 * External consumers should only import from this file, never from
 * the subsystem internals (score-manager.ts, formula-evaluator.ts, etc.).
 *
 * This subsystem is intentionally standalone:
 * - No imports from rule-engine, content-system, event-system, presentation-system, or asset-system
 * - No game-specific code
 * - Pure TypeScript / Zod, no external runtime dependencies
 */

// --- Types ---
export type {
  ScoreTrack,
  ScoringFormula,
  FixedFormula,
  ExpressionFormula,
  MultiplierFormula,
  LookupFormula,
  ScoringCondition,
  ScoringRule,
  VictoryCondition,
  HighestScoreVictory,
  TargetScoreVictory,
  LastStandingVictory,
  RoundLimitVictory,
  CustomVictory,
  TiebreakRule,
  ScoringConfig,
  PlayerScores,
  ScoreChange,
  VictoryResult,
  ScoringRuleContext,
} from './types.js';

// --- ScoreManager ---
export { ScoreManager } from './score-manager.js';

// --- Formula evaluator (exported for extension authors / tests) ---
export { evaluateFormula, resolveField } from './formula-evaluator.js';

// --- Victory evaluator (exported for direct use) ---
export { evaluateVictory } from './victory-evaluator.js';

// --- Schema validation (Zod schemas) ---
export {
  ScoringConfigSchema,
  ScoringFormulaSchema,
  ScoreTrackSchema,
  ScoringRuleSchema,
  VictoryConditionSchema,
  TiebreakRuleSchema,
  FixedFormulaSchema,
  ExpressionFormulaSchema,
  MultiplierFormulaSchema,
  LookupFormulaSchema,
} from './schema-integration.js';

export type { ScoringConfigInput, ScoringConfigOutput } from './schema-integration.js';
