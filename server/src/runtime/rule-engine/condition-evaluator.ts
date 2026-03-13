/**
 * condition-evaluator.ts — Evaluate RuleCondition trees.
 *
 * Dispatches condition evaluation to the appropriate handler based on
 * the condition's `type` discriminant. Supports nested logical conditions
 * (AND/OR/NOT) for complex rule composition.
 */

import type {
  RuleCondition,
  ComparisonCondition,
  LogicalCondition,
  ExpressionCondition,
  BuiltInCondition,
  RuleContext,
} from './types.js';
import { evaluateExpression, resolveValue } from './expression-evaluator.js';
import { getBuiltIn } from './builtin-rules.js';

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Evaluate a RuleCondition and return a boolean result.
 *
 * @param condition - The condition to evaluate
 * @param context - Runtime context (state, event, players, phase, round)
 * @returns true if the condition is satisfied, false otherwise
 * @throws Error if condition type is unknown or expression is malformed
 */
export function evaluateCondition(condition: RuleCondition, context: RuleContext): boolean {
  switch (condition.type) {
    case 'comparison':
      return evaluateComparison(condition, context);
    case 'and':
    case 'or':
    case 'not':
      return evaluateLogical(condition, context);
    case 'expression':
      return evaluateExpressionCondition(condition, context);
    case 'builtin':
      return evaluateBuiltIn(condition, context);
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = condition;
      throw new Error(`[rule-engine/condition-evaluator] Unknown condition type: ${(_exhaustive as RuleCondition & { type: string }).type}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Comparison condition
// ---------------------------------------------------------------------------

function evaluateComparison(condition: ComparisonCondition, context: RuleContext): boolean {
  const left = resolveOperand(condition.left, context);
  const right = resolveOperand(condition.right, context);

  switch (condition.operator) {
    case '==':
      // eslint-disable-next-line eqeqeq
      return left == right;
    case '!=':
      // eslint-disable-next-line eqeqeq
      return left != right;
    case '>':
      return (left as number) > (right as number);
    case '<':
      return (left as number) < (right as number);
    case '>=':
      return (left as number) >= (right as number);
    case '<=':
      return (left as number) <= (right as number);
    case 'contains':
      // String contains string, or array contains value
      if (typeof left === 'string' && typeof right === 'string') {
        return left.includes(right);
      }
      if (Array.isArray(left)) {
        return left.includes(right);
      }
      return false;
    case 'in':
      // Value is in an array (right side)
      if (Array.isArray(right)) {
        return right.includes(left);
      }
      // Value is in a string (substring check)
      if (typeof right === 'string' && typeof left === 'string') {
        return right.includes(left);
      }
      return false;
    default: {
      const _exhaustive: never = condition.operator;
      throw new Error(`[rule-engine/condition-evaluator] Unknown operator: ${_exhaustive}`);
    }
  }
}

/**
 * Resolve an operand value — either a field path string or a literal.
 * Numbers and arrays are treated as literals directly.
 */
function resolveOperand(
  operand: string | number | boolean | string[] | number[],
  context: RuleContext,
): unknown {
  if (typeof operand === 'number' || typeof operand === 'boolean' || Array.isArray(operand)) {
    return operand;
  }
  // String: could be a field path or a literal
  // Heuristic: if it looks like a path (contains '.' or starts with '$'), resolve it
  if (operand.includes('.') || operand.startsWith('$') || isKnownPrefix(operand)) {
    return resolveValue(operand, context);
  }
  // Otherwise treat as string literal
  return operand;
}

/**
 * Check if the operand starts with a known state path prefix.
 */
function isKnownPrefix(str: string): boolean {
  return (
    str === 'phase' ||
    str === 'round' ||
    str.startsWith('globals') ||
    str.startsWith('per_player') ||
    str.startsWith('per_team') ||
    str.startsWith('$players')
  );
}

// ---------------------------------------------------------------------------
// Logical conditions
// ---------------------------------------------------------------------------

function evaluateLogical(condition: LogicalCondition, context: RuleContext): boolean {
  switch (condition.type) {
    case 'and':
      return condition.conditions.every((c) => evaluateCondition(c, context));
    case 'or':
      return condition.conditions.some((c) => evaluateCondition(c, context));
    case 'not':
      if (condition.conditions.length === 0) {
        throw new Error('[rule-engine/condition-evaluator] NOT condition requires at least one sub-condition');
      }
      return !evaluateCondition(condition.conditions[0], context);
    default: {
      const _exhaustive: never = condition.type;
      throw new Error(`[rule-engine/condition-evaluator] Unknown logical type: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Expression condition
// ---------------------------------------------------------------------------

function evaluateExpressionCondition(condition: ExpressionCondition, context: RuleContext): boolean {
  const result = evaluateExpression(condition.expr, context);
  return Boolean(result);
}

// ---------------------------------------------------------------------------
// Built-in condition
// ---------------------------------------------------------------------------

function evaluateBuiltIn(condition: BuiltInCondition, context: RuleContext): boolean {
  const builtin = getBuiltIn(condition.rule);
  if (!builtin) {
    throw new Error(
      `[rule-engine/condition-evaluator] Unknown built-in rule: '${condition.rule}'. ` +
        `Available: ${['all_players_submitted', 'timer_expired', 'min_players', 'max_players', 'score_reached', 'all_equal', 'majority_vote', 'last_standing', 'round_limit', 'items_remaining'].join(', ')}`,
    );
  }
  return builtin.evaluate(context, condition.params);
}
