/**
 * index.ts — Public API for the Rule Engine subsystem.
 *
 * IMPORT RULE: Only import from this file when using the Rule Engine
 * from other subsystems. Never import directly from internal modules.
 *
 * Subsystem: rule-engine
 * Phase: 4.1
 */

// Core engine
export { RuleEngine } from './rule-engine.js';
export type { CustomActionHandler } from './rule-engine.js';

// Expression evaluator
export { evaluateExpression, resolveValue } from './expression-evaluator.js';

// Condition evaluator
export { evaluateCondition } from './condition-evaluator.js';

// Built-in rules
export {
  registerBuiltIn,
  getBuiltIn,
  listBuiltIns,
} from './builtin-rules.js';

// Schema integration
export {
  RuleConditionSchema,
  RuleActionSchema,
  RuleDeclarationSchema,
  RulesArraySchema,
  parseRules,
  safeParseRules,
} from './schema-integration.js';

// Types
export type {
  RuleDeclaration,
  RuleCondition,
  ComparisonCondition,
  LogicalCondition,
  ExpressionCondition,
  BuiltInCondition,
  RuleAction,
  SetStateAction,
  EmitEventAction,
  TransitionAction,
  IncrementAction,
  CustomAction,
  RuleContext,
  RuleResult,
  BuiltInRuleFn,
  BuiltInRule,
} from './types.js';
