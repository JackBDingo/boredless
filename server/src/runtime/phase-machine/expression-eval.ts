/**
 * expression-eval.ts — Simple condition expression evaluator for Phase Machine.
 *
 * Design Philosophy:
 * - Keep it minimal for Phase 1. No nested parens, no arithmetic.
 * - Supports: state references, number literals, string literals, comparisons, AND/OR
 * - Complex logic belongs in extension evaluators (Phase 4)
 *
 * Supported syntax:
 *   globals.round < globals.total_rounds
 *   globals.score >= 100
 *   globals.round == 3
 *   globals.round != 0
 *   globals.round > 0 AND globals.round < 5
 *   globals.round == 0 OR globals.round == 5
 *   globals.status == "active"
 *
 * NOT supported (Phase 4+):
 *   Arithmetic: globals.score + 10 > globals.target
 *   Nested parens: (a AND b) OR c
 *   Negation: NOT globals.active
 *   per_player references without explicit playerId (use getPlayer in context)
 */

import type { ExpressionContext } from './types.js';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

type ComparisonOp = '<' | '>' | '<=' | '>=' | '==' | '!=';

// ---------------------------------------------------------------------------
// Value resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a value token from state or as a literal.
 *
 * Supports:
 * - globals.fieldname → context.getGlobal('fieldname')
 * - per_player.fieldname → context.getPlayer(undefined, 'fieldname') — not yet implemented
 * - Number literals: 42, 3.14
 * - String literals: "hello", 'world'
 * - Boolean literals: true, false
 */
function resolveValue(token: string, context: ExpressionContext): unknown {
  const trimmed = token.trim();

  // globals.fieldname
  if (trimmed.startsWith('globals.')) {
    const field = trimmed.slice('globals.'.length);
    return context.getGlobal(field);
  }

  // per_player.fieldname (Phase 1: no active player concept, skip for now)
  // If context has getPlayer, call it with empty playerId — callers can set up context appropriately
  if (trimmed.startsWith('per_player.')) {
    const field = trimmed.slice('per_player.'.length);
    if (context.getPlayer) {
      return context.getPlayer('', field);
    }
    return undefined;
  }

  // String literal: "value" or 'value'
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  // Boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  // Number literal
  const num = Number(trimmed);
  if (!isNaN(num)) return num;

  // Unknown — return as string (best-effort)
  return trimmed;
}

// ---------------------------------------------------------------------------
// Single comparison evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a single comparison clause: "lhs op rhs"
 * Returns null if the expression cannot be parsed.
 */
function evaluateComparison(clause: string, context: ExpressionContext): boolean | null {
  // Try to match each operator (order matters: longer first to avoid greedy </<= confusion)
  const ops: ComparisonOp[] = ['<=', '>=', '!=', '==', '<', '>'];

  for (const op of ops) {
    const idx = clause.indexOf(op);
    if (idx === -1) continue;

    const lhsToken = clause.slice(0, idx).trim();
    const rhsToken = clause.slice(idx + op.length).trim();

    if (!lhsToken || !rhsToken) continue;

    const lhs = resolveValue(lhsToken, context);
    const rhs = resolveValue(rhsToken, context);

    return compare(lhs, rhs, op);
  }

  return null; // Not a valid comparison
}

/**
 * Perform the actual comparison between two resolved values.
 */
function compare(lhs: unknown, rhs: unknown, op: ComparisonOp): boolean {
  switch (op) {
    case '==':
      // eslint-disable-next-line eqeqeq
      return lhs == rhs; // intentional loose equality for null/undefined handling
    case '!=':
      // eslint-disable-next-line eqeqeq
      return lhs != rhs;
    case '<':
      return (lhs as number) < (rhs as number);
    case '>':
      return (lhs as number) > (rhs as number);
    case '<=':
      return (lhs as number) <= (rhs as number);
    case '>=':
      return (lhs as number) >= (rhs as number);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a condition expression and return a boolean result.
 *
 * Supports AND/OR boolean composition of comparison clauses.
 * AND and OR are evaluated left-to-right (no precedence — keep expressions simple).
 *
 * @param expression - The condition string from the game schema
 * @param context - State accessor callbacks
 * @returns boolean result of the expression
 * @throws Error if expression is malformed and cannot be evaluated
 */
export function evaluateCondition(expression: string, context: ExpressionContext): boolean {
  const trimmed = expression.trim();

  // Handle AND (split on " AND " — case-sensitive, spaced)
  if (trimmed.includes(' AND ')) {
    const parts = trimmed.split(' AND ');
    return parts.every((part) => evaluateCondition(part.trim(), context));
  }

  // Handle OR (split on " OR " — case-sensitive, spaced)
  if (trimmed.includes(' OR ')) {
    const parts = trimmed.split(' OR ');
    return parts.some((part) => evaluateCondition(part.trim(), context));
  }

  // Single comparison
  const result = evaluateComparison(trimmed, context);
  if (result === null) {
    throw new Error(
      `[phase-machine/expression-eval] Cannot evaluate expression: "${expression}". ` +
        'Expected format: "globals.field <op> value" where op is <, >, <=, >=, ==, !=',
    );
  }

  return result;
}
