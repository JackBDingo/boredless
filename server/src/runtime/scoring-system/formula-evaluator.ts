/**
 * formula-evaluator.ts — Safe score formula evaluation.
 *
 * IMPORTANT: NO eval() or new Function() used here.
 * All expression evaluation is done via a custom recursive-descent parser.
 *
 * Supported expressions:
 * - Numeric literals: 42, 3.14, -5
 * - Field access (dot notation): round, player.bonus, globals.multiplier
 * - Arithmetic operators: +, -, *, /
 * - Parentheses for grouping: (a + b) * c
 *
 * Design: stateless functions, no class needed.
 */

import type { ScoringFormula } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a scoring formula against a context of field values.
 *
 * @param formula - The formula to evaluate
 * @param context - Flat/nested record of available values (e.g. { round: 3, timeRemaining: 10 })
 * @returns The computed score change (positive = gain, negative = loss)
 */
export function evaluateFormula(
  formula: ScoringFormula,
  context: Record<string, unknown>,
): number {
  switch (formula.type) {
    case 'fixed':
      return formula.amount;

    case 'expression':
      return evaluateExpression(formula.expr, context);

    case 'multiplier': {
      const multiplierValue = resolveField(formula.multiplier, context);
      const numMultiplier = toNumber(multiplierValue, formula.multiplier);
      return formula.base * numMultiplier;
    }

    case 'lookup': {
      const keyValue = resolveField(formula.key, context);
      const keyStr = String(keyValue ?? '');
      return formula.table[keyStr] ?? 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Field resolution (dot-notation path traversal)
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-notation field path from a context object.
 * E.g. "player.bonus" → context.player.bonus
 */
export function resolveField(path: string, context: Record<string, unknown>): unknown {
  const parts = path.split('.');
  let current: unknown = context;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function toNumber(value: unknown, fieldName: string): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!isNaN(parsed)) return parsed;
  }
  throw new Error(
    `ScoringSystem: expected numeric value at field "${fieldName}", got ${JSON.stringify(value)}`,
  );
}

// ---------------------------------------------------------------------------
// Safe expression evaluator — recursive-descent parser
// ---------------------------------------------------------------------------

/**
 * Evaluate an arithmetic expression string against a context.
 * Grammar:
 *   expr      := additive
 *   additive  := multiplicative (('+' | '-') multiplicative)*
 *   multiplicative := unary (('*' | '/') unary)*
 *   unary     := '-' primary | primary
 *   primary   := number | identifier | '(' expr ')'
 *   identifier := [a-zA-Z_][a-zA-Z0-9_.]*
 *   number    := [0-9]+ ('.' [0-9]+)?
 */
export function evaluateExpression(expr: string, context: Record<string, unknown>): number {
  const parser = new ExpressionParser(expr, context);
  const result = parser.parseExpression();
  parser.expectEnd();
  return result;
}

class ExpressionParser {
  private pos: number = 0;
  private readonly src: string;
  private readonly ctx: Record<string, unknown>;

  constructor(src: string, ctx: Record<string, unknown>) {
    this.src = src;
    this.ctx = ctx;
  }

  parseExpression(): number {
    return this.parseAdditive();
  }

  expectEnd(): void {
    this.skipWhitespace();
    if (this.pos < this.src.length) {
      throw new Error(
        `ScoringSystem: unexpected token "${this.src[this.pos]}" at position ${this.pos} in expression: "${this.src}"`,
      );
    }
  }

  private parseAdditive(): number {
    let left = this.parseMultiplicative();
    this.skipWhitespace();
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === '+') {
        this.pos++;
        left += this.parseMultiplicative();
      } else if (ch === '-') {
        this.pos++;
        left -= this.parseMultiplicative();
      } else {
        break;
      }
      this.skipWhitespace();
    }
    return left;
  }

  private parseMultiplicative(): number {
    let left = this.parseUnary();
    this.skipWhitespace();
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (ch === '*') {
        this.pos++;
        left *= this.parseUnary();
      } else if (ch === '/') {
        this.pos++;
        const divisor = this.parseUnary();
        if (divisor === 0) throw new Error('ScoringSystem: division by zero in expression');
        left /= divisor;
      } else {
        break;
      }
      this.skipWhitespace();
    }
    return left;
  }

  private parseUnary(): number {
    this.skipWhitespace();
    if (this.pos < this.src.length && this.src[this.pos] === '-') {
      this.pos++;
      return -this.parsePrimary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();
    if (this.pos >= this.src.length) {
      throw new Error(`ScoringSystem: unexpected end of expression: "${this.src}"`);
    }

    const ch = this.src[this.pos];

    // Parenthesised sub-expression
    if (ch === '(') {
      this.pos++; // consume '('
      const value = this.parseExpression();
      this.skipWhitespace();
      if (this.pos >= this.src.length || this.src[this.pos] !== ')') {
        throw new Error(`ScoringSystem: missing closing ')' in expression: "${this.src}"`);
      }
      this.pos++; // consume ')'
      return value;
    }

    // Numeric literal
    if (ch >= '0' && ch <= '9' || ch === '.') {
      return this.parseNumber();
    }

    // Identifier / field path
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      return this.parseIdentifier();
    }

    throw new Error(
      `ScoringSystem: unexpected character "${ch}" at position ${this.pos} in expression: "${this.src}"`,
    );
  }

  private parseNumber(): number {
    const start = this.pos;
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if ((c >= '0' && c <= '9') || c === '.') {
        this.pos++;
      } else {
        break;
      }
    }
    const numStr = this.src.slice(start, this.pos);
    const value = parseFloat(numStr);
    if (isNaN(value)) {
      throw new Error(`ScoringSystem: invalid number "${numStr}" in expression: "${this.src}"`);
    }
    return value;
  }

  private parseIdentifier(): number {
    const start = this.pos;
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (
        (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') ||
        c === '_' ||
        c === '.'
      ) {
        this.pos++;
      } else {
        break;
      }
    }
    const path = this.src.slice(start, this.pos);
    const value = resolveField(path, this.ctx);
    if (value === undefined || value === null) {
      // Treat missing/null fields as 0 (avoids crashes on optional fields)
      return 0;
    }
    return toNumber(value, path);
  }

  private skipWhitespace(): void {
    while (this.pos < this.src.length && this.src[this.pos] === ' ') {
      this.pos++;
    }
  }
}
