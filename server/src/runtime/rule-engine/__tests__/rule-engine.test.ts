/**
 * rule-engine.test.ts — Comprehensive tests for the Rule Engine subsystem.
 *
 * Tests cover:
 * 1. Expression evaluator (field access, comparisons, boolean ops, arithmetic, ternary)
 * 2. Condition evaluator (comparison, logical, expression, builtin)
 * 3. Built-in rules (all_players_submitted, min_players, score_reached, etc.)
 * 4. RuleEngine class (evaluate, priority, enable/disable, add/remove)
 * 5. Schema validation (valid/invalid rule declarations)
 * 6. Integration test — Trivia game simulation
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { evaluateExpression, resolveValue } from '../expression-evaluator.js';
import { evaluateCondition } from '../condition-evaluator.js';
import {
  registerBuiltIn,
  getBuiltIn,
  listBuiltIns,
} from '../builtin-rules.js';
import { RuleEngine } from '../rule-engine.js';
import {
  RuleActionSchema,
  parseRules,
  safeParseRules,
} from '../schema-integration.js';
import type {
  RuleContext,
  RuleDeclaration,
  RuleCondition,
} from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    state: {
      globals: {
        score: 0,
        round: 1,
        gameOver: false,
        a: 3,
        b: 4,
        players: {
          p1: { health: 100 },
        },
      },
      per_player: {},
    },
    players: ['p1', 'p2', 'p3'],
    phase: 'play',
    round: 1,
    event: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Expression Evaluator
// ---------------------------------------------------------------------------

describe('Expression Evaluator', () => {
  describe('Field access', () => {
    it('resolves globals.score', () => {
      const ctx = makeContext({ state: { globals: { score: 42 } } });
      expect(evaluateExpression('globals.score', ctx)).toBe(42);
    });

    it('resolves nested field globals.players.p1.health', () => {
      const ctx = makeContext({
        state: { globals: { players: { p1: { health: 75 } } } },
      });
      expect(evaluateExpression('globals.players.p1.health', ctx)).toBe(75);
    });

    it('resolves phase.name to context.phase', () => {
      const ctx = makeContext({ phase: 'voting' });
      expect(evaluateExpression('phase.name', ctx)).toBe('voting');
    });

    it('resolves $event.type', () => {
      const ctx = makeContext({ event: { type: 'timer_expired', data: {} } });
      expect(evaluateExpression('$event.type', ctx)).toBe('timer_expired');
    });

    it('resolves $players.count to player array length', () => {
      const ctx = makeContext({ players: ['p1', 'p2', 'p3', 'p4'] });
      expect(evaluateExpression('$players.count', ctx)).toBe(4);
    });

    it('returns undefined for missing path', () => {
      const ctx = makeContext({ state: {} });
      expect(evaluateExpression('globals.nonexistent', ctx)).toBeUndefined();
    });
  });

  describe('Comparisons', () => {
    it('evaluates globals.score > 10 as false when score is 5', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateExpression('globals.score > 10', ctx)).toBe(false);
    });

    it('evaluates globals.score > 10 as true when score is 15', () => {
      const ctx = makeContext({ state: { globals: { score: 15 } } });
      expect(evaluateExpression('globals.score > 10', ctx)).toBe(true);
    });

    it('evaluates globals.score == 5', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateExpression('globals.score == 5', ctx)).toBe(true);
    });

    it('evaluates globals.score != 5', () => {
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      expect(evaluateExpression('globals.score != 5', ctx)).toBe(true);
    });

    it('evaluates globals.score <= 10', () => {
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      expect(evaluateExpression('globals.score <= 10', ctx)).toBe(true);
    });

    it('evaluates globals.score >= 10', () => {
      const ctx = makeContext({ state: { globals: { score: 9 } } });
      expect(evaluateExpression('globals.score >= 10', ctx)).toBe(false);
    });

    it('evaluates string comparison: phase.name == "play"', () => {
      const ctx = makeContext({ phase: 'play' });
      expect(evaluateExpression('phase.name == "play"', ctx)).toBe(true);
    });

    it('evaluates string comparison with single quotes', () => {
      const ctx = makeContext({ phase: 'voting' });
      expect(evaluateExpression("phase.name == 'voting'", ctx)).toBe(true);
    });
  });

  describe('Boolean operators', () => {
    it('evaluates AND: globals.a > 1 && globals.b < 5', () => {
      const ctx = makeContext({ state: { globals: { a: 3, b: 4 } } });
      expect(evaluateExpression('globals.a > 1 && globals.b < 5', ctx)).toBe(true);
    });

    it('evaluates AND: false when one side is false', () => {
      const ctx = makeContext({ state: { globals: { a: 0, b: 4 } } });
      expect(evaluateExpression('globals.a > 1 && globals.b < 5', ctx)).toBe(false);
    });

    it('evaluates OR: globals.a > 1 || globals.b < 5', () => {
      const ctx = makeContext({ state: { globals: { a: 0, b: 4 } } });
      expect(evaluateExpression('globals.a > 1 || globals.b < 5', ctx)).toBe(true);
    });

    it('evaluates OR: false when both sides are false', () => {
      const ctx = makeContext({ state: { globals: { a: 0, b: 10 } } });
      expect(evaluateExpression('globals.a > 1 || globals.b < 5', ctx)).toBe(false);
    });

    it('evaluates NOT: !globals.gameOver', () => {
      const ctx = makeContext({ state: { globals: { gameOver: false } } });
      expect(evaluateExpression('!globals.gameOver', ctx)).toBe(true);
    });

    it('evaluates NOT: !true gives false', () => {
      const ctx = makeContext({ state: { globals: { gameOver: true } } });
      expect(evaluateExpression('!globals.gameOver', ctx)).toBe(false);
    });
  });

  describe('Arithmetic', () => {
    it('evaluates globals.score + 10', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateExpression('globals.score + 10', ctx)).toBe(15);
    });

    it('evaluates globals.score - 3', () => {
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      expect(evaluateExpression('globals.score - 3', ctx)).toBe(7);
    });

    it('evaluates globals.score * 2', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateExpression('globals.score * 2', ctx)).toBe(10);
    });

    it('evaluates globals.score / 2', () => {
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      expect(evaluateExpression('globals.score / 2', ctx)).toBe(5);
    });

    it('evaluates globals.score % 3', () => {
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      expect(evaluateExpression('globals.score % 3', ctx)).toBe(1);
    });

    it('evaluates arithmetic comparison: globals.score + 10 > 12', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateExpression('globals.score + 10 > 12', ctx)).toBe(true);
    });
  });

  describe('Parentheses', () => {
    it('evaluates (globals.a + globals.b) * 2', () => {
      const ctx = makeContext({ state: { globals: { a: 3, b: 4 } } });
      expect(evaluateExpression('(globals.a + globals.b) * 2', ctx)).toBe(14);
    });

    it('respects precedence with parentheses', () => {
      const ctx = makeContext({ state: { globals: { a: 2, b: 3 } } });
      // Without parens: 2 + 3 * 2 = 8, with parens: (2 + 3) * 2 = 10
      expect(evaluateExpression('(globals.a + globals.b) * 2', ctx)).toBe(10);
      expect(evaluateExpression('globals.a + globals.b * 2', ctx)).toBe(8);
    });
  });

  describe('Ternary', () => {
    it('evaluates ternary: globals.score > 10 ? "high" : "low"', () => {
      const ctx = makeContext({ state: { globals: { score: 15 } } });
      expect(evaluateExpression('globals.score > 10 ? "high" : "low"', ctx)).toBe('high');
    });

    it('evaluates ternary: false branch when condition is false', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateExpression('globals.score > 10 ? "high" : "low"', ctx)).toBe('low');
    });
  });

  describe('String/Array methods', () => {
    it('evaluates .length on string', () => {
      const ctx = makeContext({ state: { globals: { name: 'hello' } } });
      // Access via resolveValue
      expect(resolveValue('globals.name', ctx)).toBe('hello');
    });
  });

  describe('Literals', () => {
    it('evaluates number literals', () => {
      const ctx = makeContext({});
      expect(evaluateExpression('42', ctx)).toBe(42);
    });

    it('evaluates string literals', () => {
      const ctx = makeContext({});
      expect(evaluateExpression('"hello"', ctx)).toBe('hello');
    });

    it('evaluates boolean true/false', () => {
      const ctx = makeContext({});
      expect(evaluateExpression('true', ctx)).toBe(true);
      expect(evaluateExpression('false', ctx)).toBe(false);
    });

    it('evaluates null', () => {
      const ctx = makeContext({});
      expect(evaluateExpression('null', ctx)).toBe(null);
    });
  });

  describe('Security: No eval/Function usage', () => {
    it('expression-evaluator.ts does not contain eval()', () => {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const src = readFileSync(resolve(__dirname, '../expression-evaluator.ts'), 'utf-8');
      // Strip all comments and string literals before checking for eval usage
      const srcNoComments = src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/\/\/.*$/gm, '')            // line comments
        .replace(/'[^']*'/g, '""')           // single-quoted strings
        .replace(/"[^"]*"/g, '""')           // double-quoted strings
        .replace(/`[^`]*`/g, '""');          // template literals
      // Match standalone eval( - not part of identifiers like evaluateExpression
      const hasEval = /(?<![a-zA-Z_])eval\s*\(/.test(srcNoComments);
      const hasNewFunction = /new\s+Function\s*\(/.test(srcNoComments);
      expect(hasEval).toBe(false);
      expect(hasNewFunction).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Condition Evaluator
// ---------------------------------------------------------------------------

describe('Condition Evaluator', () => {
  describe('Comparison conditions', () => {
    it('== works with equal numbers', () => {
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.score', operator: '==', right: 10 }, ctx)).toBe(true);
    });

    it('== works with unequal numbers', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.score', operator: '==', right: 10 }, ctx)).toBe(false);
    });

    it('!= works', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.score', operator: '!=', right: 10 }, ctx)).toBe(true);
    });

    it('> works: 10 > 5 = true', () => {
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.score', operator: '>', right: 5 }, ctx)).toBe(true);
    });

    it('< works: 5 < 10 = true', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.score', operator: '<', right: 10 }, ctx)).toBe(true);
    });

    it('>= works: equal case', () => {
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.score', operator: '>=', right: 10 }, ctx)).toBe(true);
    });

    it('<= works: equal case', () => {
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.score', operator: '<=', right: 10 }, ctx)).toBe(true);
    });

    it("'contains' works with strings", () => {
      const ctx = makeContext({ state: { globals: { name: 'hello world' } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.name', operator: 'contains', right: 'world' }, ctx)).toBe(true);
    });

    it("'contains' returns false when string does not contain", () => {
      const ctx = makeContext({ state: { globals: { name: 'hello' } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.name', operator: 'contains', right: 'world' }, ctx)).toBe(false);
    });

    it("'in' works with arrays", () => {
      const ctx = makeContext({ state: { globals: { status: 'active' } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.status', operator: 'in', right: ['active', 'pending'] }, ctx)).toBe(true);
    });

    it("'in' returns false when value not in array", () => {
      const ctx = makeContext({ state: { globals: { status: 'done' } } });
      expect(evaluateCondition({ type: 'comparison', left: 'globals.status', operator: 'in', right: ['active', 'pending'] }, ctx)).toBe(false);
    });
  });

  describe('Logical conditions', () => {
    const ctx = makeContext({ state: { globals: { a: 5, b: 10 } } });

    const trueCondition: RuleCondition = { type: 'comparison', left: 'globals.a', operator: '<', right: 10 };
    const falseCondition: RuleCondition = { type: 'comparison', left: 'globals.a', operator: '>', right: 10 };

    it('AND: all true → true', () => {
      expect(evaluateCondition({ type: 'and', conditions: [trueCondition, trueCondition] }, ctx)).toBe(true);
    });

    it('AND: one false → false', () => {
      expect(evaluateCondition({ type: 'and', conditions: [trueCondition, falseCondition] }, ctx)).toBe(false);
    });

    it('OR: one true → true', () => {
      expect(evaluateCondition({ type: 'or', conditions: [falseCondition, trueCondition] }, ctx)).toBe(true);
    });

    it('OR: all false → false', () => {
      expect(evaluateCondition({ type: 'or', conditions: [falseCondition, falseCondition] }, ctx)).toBe(false);
    });

    it('NOT: inverts true to false', () => {
      expect(evaluateCondition({ type: 'not', conditions: [trueCondition] }, ctx)).toBe(false);
    });

    it('NOT: inverts false to true', () => {
      expect(evaluateCondition({ type: 'not', conditions: [falseCondition] }, ctx)).toBe(true);
    });

    it('Nested: AND containing OR', () => {
      const orCondition: RuleCondition = { type: 'or', conditions: [falseCondition, trueCondition] };
      expect(evaluateCondition({ type: 'and', conditions: [trueCondition, orCondition] }, ctx)).toBe(true);
    });
  });

  describe('Expression conditions', () => {
    it('evaluates expression string as truthy', () => {
      const ctx = makeContext({ state: { globals: { score: 15 } } });
      expect(evaluateCondition({ type: 'expression', expr: 'globals.score > 10' }, ctx)).toBe(true);
    });

    it('evaluates expression string as falsy', () => {
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      expect(evaluateCondition({ type: 'expression', expr: 'globals.score > 10' }, ctx)).toBe(false);
    });

    it('evaluates complex expression with &&', () => {
      const ctx = makeContext({ state: { globals: { score: 15 } }, phase: 'play' });
      expect(evaluateCondition({ type: 'expression', expr: "globals.score > 10 && phase.name == 'play'" }, ctx)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Built-in Rules
// ---------------------------------------------------------------------------

describe('Built-in Rules', () => {
  describe('all_players_submitted', () => {
    it('returns true when all active players have submitted', () => {
      const ctx = makeContext({
        players: ['p1', 'p2'],
        state: {
          per_player: {
            p1: { submitted: true },
            p2: { submitted: true },
          },
        },
      });
      expect(evaluateCondition({ type: 'builtin', rule: 'all_players_submitted' }, ctx)).toBe(true);
    });

    it('returns false when a player has not submitted', () => {
      const ctx = makeContext({
        players: ['p1', 'p2'],
        state: {
          per_player: {
            p1: { submitted: true },
            p2: { submitted: false },
          },
        },
      });
      expect(evaluateCondition({ type: 'builtin', rule: 'all_players_submitted' }, ctx)).toBe(false);
    });

    it('returns false when no players', () => {
      const ctx = makeContext({ players: [], state: { per_player: {} } });
      expect(evaluateCondition({ type: 'builtin', rule: 'all_players_submitted' }, ctx)).toBe(false);
    });
  });

  describe('min_players', () => {
    it('returns true when player count meets minimum', () => {
      const ctx = makeContext({ players: ['p1', 'p2', 'p3'] });
      expect(evaluateCondition({ type: 'builtin', rule: 'min_players', params: { min: 3 } }, ctx)).toBe(true);
    });

    it('returns false when player count is below minimum', () => {
      const ctx = makeContext({ players: ['p1'] });
      expect(evaluateCondition({ type: 'builtin', rule: 'min_players', params: { min: 3 } }, ctx)).toBe(false);
    });
  });

  describe('max_players', () => {
    it('returns true when player count is within max', () => {
      const ctx = makeContext({ players: ['p1', 'p2', 'p3'] });
      expect(evaluateCondition({ type: 'builtin', rule: 'max_players', params: { max: 8 } }, ctx)).toBe(true);
    });

    it('returns false when player count exceeds max', () => {
      const ctx = makeContext({ players: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9'] });
      expect(evaluateCondition({ type: 'builtin', rule: 'max_players', params: { max: 8 } }, ctx)).toBe(false);
    });
  });

  describe('score_reached', () => {
    it('returns true when any player score hits target', () => {
      const ctx = makeContext({
        state: {
          globals: {
            players: {
              p1: { score: 5 },
              p2: { score: 10 },
            },
          },
        },
      });
      expect(evaluateCondition({
        type: 'builtin',
        rule: 'score_reached',
        params: { target: 10, path: 'globals.players.*.score' },
      }, ctx)).toBe(true);
    });

    it('returns false when no player reaches target', () => {
      const ctx = makeContext({
        state: {
          globals: {
            players: {
              p1: { score: 5 },
              p2: { score: 8 },
            },
          },
        },
      });
      expect(evaluateCondition({
        type: 'builtin',
        rule: 'score_reached',
        params: { target: 10, path: 'globals.players.*.score' },
      }, ctx)).toBe(false);
    });
  });

  describe('last_standing', () => {
    it('returns true when only one player is not eliminated', () => {
      const ctx = makeContext({
        players: ['p1', 'p2', 'p3'],
        state: {
          per_player: {
            p1: { eliminated: false },
            p2: { eliminated: true },
            p3: { eliminated: true },
          },
        },
      });
      expect(evaluateCondition({ type: 'builtin', rule: 'last_standing' }, ctx)).toBe(true);
    });

    it('returns false when multiple players are still alive', () => {
      const ctx = makeContext({
        players: ['p1', 'p2', 'p3'],
        state: {
          per_player: {
            p1: { eliminated: false },
            p2: { eliminated: false },
            p3: { eliminated: true },
          },
        },
      });
      expect(evaluateCondition({ type: 'builtin', rule: 'last_standing' }, ctx)).toBe(false);
    });
  });

  describe('round_limit', () => {
    it('returns true when round meets max', () => {
      const ctx = makeContext({ round: 5 });
      expect(evaluateCondition({ type: 'builtin', rule: 'round_limit', params: { max: 5 } }, ctx)).toBe(true);
    });

    it('returns false when round is below max', () => {
      const ctx = makeContext({ round: 3 });
      expect(evaluateCondition({ type: 'builtin', rule: 'round_limit', params: { max: 5 } }, ctx)).toBe(false);
    });

    it('returns true when round exceeds max', () => {
      const ctx = makeContext({ round: 6 });
      expect(evaluateCondition({ type: 'builtin', rule: 'round_limit', params: { max: 5 } }, ctx)).toBe(true);
    });
  });

  describe('majority_vote', () => {
    it('returns true when majority voted for same option', () => {
      const ctx = makeContext({
        state: {
          per_player: {
            p1: { vote: 'A' },
            p2: { vote: 'A' },
            p3: { vote: 'B' },
          },
        },
      });
      expect(evaluateCondition({
        type: 'builtin',
        rule: 'majority_vote',
        params: { path: 'per_player.*.vote' },
      }, ctx)).toBe(true);
    });

    it('returns false when no majority', () => {
      const ctx = makeContext({
        state: {
          per_player: {
            p1: { vote: 'A' },
            p2: { vote: 'B' },
            p3: { vote: 'C' },
            p4: { vote: 'D' },
          },
        },
      });
      expect(evaluateCondition({
        type: 'builtin',
        rule: 'majority_vote',
        params: { path: 'per_player.*.vote' },
      }, ctx)).toBe(false);
    });
  });

  describe('Custom built-in registration', () => {
    it('can register and use a custom built-in rule', () => {
      registerBuiltIn('test_custom', (context, params) => {
        return context.players.length === (params?.['expected'] as number ?? 0);
      });

      const ctx = makeContext({ players: ['p1', 'p2', 'p3'] });
      expect(evaluateCondition({
        type: 'builtin',
        rule: 'test_custom',
        params: { expected: 3 },
      }, ctx)).toBe(true);

      expect(evaluateCondition({
        type: 'builtin',
        rule: 'test_custom',
        params: { expected: 5 },
      }, ctx)).toBe(false);
    });

    it('listBuiltIns includes registered built-ins', () => {
      const builtins = listBuiltIns();
      expect(builtins).toContain('all_players_submitted');
      expect(builtins).toContain('timer_expired');
      expect(builtins).toContain('min_players');
      expect(builtins).toContain('score_reached');
    });

    it('getBuiltIn returns the rule when found', () => {
      const rule = getBuiltIn('all_players_submitted');
      expect(rule).toBeDefined();
      expect(rule?.name).toBe('all_players_submitted');
    });

    it('getBuiltIn returns undefined for unknown rule', () => {
      expect(getBuiltIn('this_does_not_exist')).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// 4. RuleEngine
// ---------------------------------------------------------------------------

describe('RuleEngine', () => {
  const makeRule = (
    id: string,
    overrides: Partial<RuleDeclaration> = {},
  ): RuleDeclaration => ({
    id,
    when: { type: 'comparison', left: 'globals.score', operator: '>', right: 0 },
    then: [{ type: 'emit', event: `${id}_fired` }],
    priority: 0,
    enabled: true,
    ...overrides,
  });

  describe('evaluate', () => {
    it('evaluates all enabled rules and returns results', () => {
      const engine = new RuleEngine([
        makeRule('r1'),
        makeRule('r2'),
      ]);
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const results = engine.evaluate(ctx);
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.ruleId)).toContain('r1');
      expect(results.map((r) => r.ruleId)).toContain('r2');
    });

    it('returns matched=true for matching conditions', () => {
      const engine = new RuleEngine([makeRule('r1')]);
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const [result] = engine.evaluate(ctx);
      expect(result.matched).toBe(true);
    });

    it('returns matched=false for non-matching conditions', () => {
      const engine = new RuleEngine([makeRule('r1')]);
      const ctx = makeContext({ state: { globals: { score: 0 } } });
      const [result] = engine.evaluate(ctx);
      expect(result.matched).toBe(false);
    });

    it('returns then actions when condition is true', () => {
      const engine = new RuleEngine([
        makeRule('r1', {
          when: { type: 'comparison', left: 'globals.score', operator: '>', right: 0 },
          then: [{ type: 'emit', event: 'winner' }],
        }),
      ]);
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const [result] = engine.evaluate(ctx);
      expect(result.matched).toBe(true);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toEqual({ type: 'emit', event: 'winner' });
    });

    it('returns else actions when condition is false and else is defined', () => {
      const engine = new RuleEngine([
        makeRule('r1', {
          when: { type: 'comparison', left: 'globals.score', operator: '>', right: 100 },
          then: [{ type: 'emit', event: 'high_score' }],
          else: [{ type: 'emit', event: 'low_score' }],
        }),
      ]);
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      const [result] = engine.evaluate(ctx);
      expect(result.matched).toBe(false);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]).toEqual({ type: 'emit', event: 'low_score' });
    });

    it('returns empty actions when condition is false and no else', () => {
      const engine = new RuleEngine([
        makeRule('r1', {
          when: { type: 'comparison', left: 'globals.score', operator: '>', right: 100 },
          then: [{ type: 'emit', event: 'high_score' }],
        }),
      ]);
      const ctx = makeContext({ state: { globals: { score: 5 } } });
      const [result] = engine.evaluate(ctx);
      expect(result.matched).toBe(false);
      expect(result.actions).toHaveLength(0);
    });
  });

  describe('Priority ordering', () => {
    it('evaluates higher priority rules first', () => {
      const engine = new RuleEngine([
        makeRule('low', { priority: 1 }),
        makeRule('high', { priority: 10 }),
        makeRule('mid', { priority: 5 }),
      ]);
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const results = engine.evaluate(ctx);
      const ids = results.map((r) => r.ruleId);
      expect(ids[0]).toBe('high');
      expect(ids[1]).toBe('mid');
      expect(ids[2]).toBe('low');
    });

    it('preserves insertion order for same-priority rules', () => {
      const engine = new RuleEngine([
        makeRule('first', { priority: 0 }),
        makeRule('second', { priority: 0 }),
        makeRule('third', { priority: 0 }),
      ]);
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const results = engine.evaluate(ctx);
      const ids = results.map((r) => r.ruleId);
      expect(ids).toEqual(['first', 'second', 'third']);
    });
  });

  describe('Enable/disable', () => {
    it('disabled rules are skipped', () => {
      const engine = new RuleEngine([
        makeRule('r1', { enabled: false }),
        makeRule('r2', { enabled: true }),
      ]);
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const results = engine.evaluate(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].ruleId).toBe('r2');
    });

    it('enable() re-enables a disabled rule', () => {
      const engine = new RuleEngine([makeRule('r1', { enabled: false })]);
      engine.enable('r1');
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const results = engine.evaluate(ctx);
      expect(results).toHaveLength(1);
    });

    it('disable() disables an enabled rule', () => {
      const engine = new RuleEngine([makeRule('r1', { enabled: true })]);
      engine.disable('r1');
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const results = engine.evaluate(ctx);
      expect(results).toHaveLength(0);
    });

    it('enable() throws on unknown rule', () => {
      const engine = new RuleEngine([]);
      expect(() => engine.enable('nonexistent')).toThrow();
    });

    it('disable() throws on unknown rule', () => {
      const engine = new RuleEngine([]);
      expect(() => engine.disable('nonexistent')).toThrow();
    });
  });

  describe('evaluateRule', () => {
    it('evaluates a single rule by ID', () => {
      const engine = new RuleEngine([makeRule('r1'), makeRule('r2')]);
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const result = engine.evaluateRule('r1', ctx);
      expect(result.ruleId).toBe('r1');
      expect(result.matched).toBe(true);
    });

    it('throws when rule ID not found', () => {
      const engine = new RuleEngine([]);
      const ctx = makeContext({});
      expect(() => engine.evaluateRule('nonexistent', ctx)).toThrow();
    });
  });

  describe('addRule / removeRule', () => {
    it('addRule adds a rule that participates in evaluation', () => {
      const engine = new RuleEngine([]);
      engine.addRule(makeRule('dynamic'));
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const results = engine.evaluate(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].ruleId).toBe('dynamic');
    });

    it('removeRule removes a rule from evaluation', () => {
      const engine = new RuleEngine([makeRule('r1'), makeRule('r2')]);
      engine.removeRule('r1');
      const ctx = makeContext({ state: { globals: { score: 10 } } });
      const results = engine.evaluate(ctx);
      expect(results).toHaveLength(1);
      expect(results[0].ruleId).toBe('r2');
    });

    it('removeRule is a no-op for nonexistent rule', () => {
      const engine = new RuleEngine([makeRule('r1')]);
      expect(() => engine.removeRule('nonexistent')).not.toThrow();
    });

    it('addRule replaces existing rule with same ID', () => {
      const engine = new RuleEngine([makeRule('r1', { priority: 0 })]);
      engine.addRule(makeRule('r1', { priority: 99 }));
      const rules = engine.getRules();
      expect(rules).toHaveLength(1);
      expect(rules[0].priority).toBe(99);
    });
  });

  describe('getRules', () => {
    it('returns all rules in priority order', () => {
      const engine = new RuleEngine([
        makeRule('low', { priority: 1 }),
        makeRule('high', { priority: 10 }),
      ]);
      const rules = engine.getRules();
      expect(rules[0].id).toBe('high');
      expect(rules[1].id).toBe('low');
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Schema Validation
// ---------------------------------------------------------------------------

describe('Schema Validation', () => {
  describe('Valid rules', () => {
    it('parses a rule with comparison condition', () => {
      const raw = [{
        id: 'check_score',
        when: { type: 'comparison', left: 'globals.score', operator: '>=', right: 10 },
        then: [{ type: 'transition', to: 'results' }],
      }];
      const parsed = parseRules(raw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('check_score');
    });

    it('parses a rule with logical condition', () => {
      const raw = [{
        id: 'check_and',
        when: {
          type: 'and',
          conditions: [
            { type: 'comparison', left: 'globals.round', operator: '<', right: 10 },
            { type: 'builtin', rule: 'all_players_submitted' },
          ],
        },
        then: [{ type: 'increment', path: 'globals.round' }],
      }];
      const parsed = parseRules(raw);
      expect(parsed[0].when.type).toBe('and');
    });

    it('parses a rule with expression condition', () => {
      const raw = [{
        id: 'expr_rule',
        when: { type: 'expression', expr: "globals.score > 0 && phase.name == 'play'" },
        then: [{ type: 'emit', event: 'score_positive' }],
      }];
      const parsed = parseRules(raw);
      expect(parsed[0].when.type).toBe('expression');
    });

    it('parses a rule with builtin condition', () => {
      const raw = [{
        id: 'builtin_rule',
        when: { type: 'builtin', rule: 'all_players_submitted' },
        then: [{ type: 'transition', to: 'reveal' }],
      }];
      const parsed = parseRules(raw);
      expect(parsed[0].when.type).toBe('builtin');
    });

    it('parses set action', () => {
      const result = RuleActionSchema.parse({ type: 'set', path: 'globals.winner', value: 'p1' });
      expect(result.type).toBe('set');
    });

    it('parses emit action', () => {
      const result = RuleActionSchema.parse({ type: 'emit', event: 'game_over', data: { reason: 'win' } });
      expect(result.type).toBe('emit');
    });

    it('parses transition action', () => {
      const result = RuleActionSchema.parse({ type: 'transition', to: 'results' });
      expect(result.type).toBe('transition');
    });

    it('parses increment action', () => {
      const result = RuleActionSchema.parse({ type: 'increment', path: 'globals.round', amount: 1 });
      expect(result.type).toBe('increment');
    });
  });

  describe('Invalid rules', () => {
    it('rejects invalid comparison operator', () => {
      const raw = [{
        id: 'bad_op',
        when: { type: 'comparison', left: 'globals.score', operator: '??', right: 10 },
        then: [{ type: 'emit', event: 'test' }],
      }];
      const result = safeParseRules(raw);
      expect(result.success).toBe(false);
    });

    it('rejects rule missing "when" field', () => {
      const raw = [{ id: 'no_when', then: [{ type: 'emit', event: 'test' }] }];
      const result = safeParseRules(raw);
      expect(result.success).toBe(false);
    });

    it('rejects rule missing "then" field', () => {
      const raw = [{ id: 'no_then', when: { type: 'expression', expr: 'true' } }];
      const result = safeParseRules(raw);
      expect(result.success).toBe(false);
    });

    it('rejects rule with empty "then" array', () => {
      const raw = [{
        id: 'empty_then',
        when: { type: 'expression', expr: 'true' },
        then: [],
      }];
      const result = safeParseRules(raw);
      expect(result.success).toBe(false);
    });

    it('rejects rule with unknown action type', () => {
      const raw = [{
        id: 'bad_action',
        when: { type: 'expression', expr: 'true' },
        then: [{ type: 'teleport', destination: 'moon' }],
      }];
      const result = safeParseRules(raw);
      expect(result.success).toBe(false);
    });

    it('rejects rule with empty id', () => {
      const raw = [{
        id: '',
        when: { type: 'expression', expr: 'true' },
        then: [{ type: 'emit', event: 'test' }],
      }];
      const result = safeParseRules(raw);
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Integration Test — Trivia Game Simulation
// ---------------------------------------------------------------------------

describe('Integration: Trivia Game', () => {
  /**
   * Simulates a 3-player trivia game with the following rules:
   * - check_all_answered: when all players have submitted, proceed
   * - check_winner: when any player reaches score 3, transition to results
   * - next_round: when all answered and no winner, increment round
   */

  const triviaRules: RuleDeclaration[] = [
    {
      id: 'check_winner',
      name: 'Check for Winner',
      priority: 10, // highest — check winner first
      when: {
        type: 'builtin',
        rule: 'score_reached',
        params: { target: 3, path: 'globals.players.*.score' },
      },
      then: [
        { type: 'set', path: 'globals.gameOver', value: true },
        { type: 'transition', to: 'results' },
      ],
    },
    {
      id: 'check_all_answered',
      name: 'All Players Answered',
      priority: 5,
      when: {
        type: 'builtin',
        rule: 'all_players_submitted',
      },
      then: [
        { type: 'emit', event: 'round_complete' },
      ],
    },
    {
      id: 'next_round',
      name: 'Advance to Next Round',
      priority: 0,
      when: {
        type: 'and',
        conditions: [
          { type: 'builtin', rule: 'all_players_submitted' },
          {
            type: 'comparison',
            left: 'globals.round',
            operator: '<',
            right: 5,
          },
        ],
      },
      then: [
        { type: 'increment', path: 'globals.round' },
        { type: 'transition', to: 'question' },
      ],
    },
  ];

  const makeGameState = (
    scores: Record<string, number>,
    submitted: Record<string, boolean>,
    round: number,
  ): RuleContext => ({
    state: {
      globals: {
        round,
        players: Object.fromEntries(
          Object.entries(scores).map(([id, score]) => [id, { score }]),
        ),
      },
      per_player: Object.fromEntries(
        Object.keys(scores).map((id) => [id, { submitted: submitted[id] }]),
      ),
    },
    players: Object.keys(scores),
    phase: 'answer',
    round,
  });

  it('check_all_answered does not fire when players have not submitted', () => {
    const engine = new RuleEngine(triviaRules);
    const ctx = makeGameState(
      { p1: 0, p2: 0, p3: 0 },
      { p1: false, p2: false, p3: false },
      1,
    );
    const results = engine.evaluate(ctx);
    const allAnswered = results.find((r) => r.ruleId === 'check_all_answered');
    expect(allAnswered?.matched).toBe(false);
  });

  it('check_all_answered fires when all players submit', () => {
    const engine = new RuleEngine(triviaRules);
    const ctx = makeGameState(
      { p1: 1, p2: 0, p3: 1 },
      { p1: true, p2: true, p3: true },
      1,
    );
    const results = engine.evaluate(ctx);
    const allAnswered = results.find((r) => r.ruleId === 'check_all_answered');
    expect(allAnswered?.matched).toBe(true);
    expect(allAnswered?.actions[0]).toEqual({ type: 'emit', event: 'round_complete' });
  });

  it('check_winner does not fire when no player has reached target score', () => {
    const engine = new RuleEngine(triviaRules);
    const ctx = makeGameState(
      { p1: 1, p2: 2, p3: 1 },
      { p1: true, p2: true, p3: true },
      2,
    );
    const results = engine.evaluate(ctx);
    const winner = results.find((r) => r.ruleId === 'check_winner');
    expect(winner?.matched).toBe(false);
  });

  it('check_winner fires when a player reaches score 3', () => {
    const engine = new RuleEngine(triviaRules);
    const ctx = makeGameState(
      { p1: 1, p2: 3, p3: 2 },
      { p1: true, p2: true, p3: true },
      3,
    );
    const results = engine.evaluate(ctx);
    const winner = results.find((r) => r.ruleId === 'check_winner');
    expect(winner?.matched).toBe(true);
    expect(winner?.actions).toContainEqual({ type: 'transition', to: 'results' });
    expect(winner?.actions).toContainEqual({ type: 'set', path: 'globals.gameOver', value: true });
  });

  it('results are sorted by priority: check_winner evaluated before next_round', () => {
    const engine = new RuleEngine(triviaRules);
    const ctx = makeGameState(
      { p1: 1, p2: 1, p3: 1 },
      { p1: true, p2: true, p3: true },
      2,
    );
    const results = engine.evaluate(ctx);
    const ids = results.map((r) => r.ruleId);
    expect(ids.indexOf('check_winner')).toBeLessThan(ids.indexOf('next_round'));
  });

  it('next_round fires when all submitted and round < 5', () => {
    const engine = new RuleEngine(triviaRules);
    const ctx = makeGameState(
      { p1: 1, p2: 1, p3: 1 },
      { p1: true, p2: true, p3: true },
      3,
    );
    const results = engine.evaluate(ctx);
    const nextRound = results.find((r) => r.ruleId === 'next_round');
    expect(nextRound?.matched).toBe(true);
    expect(nextRound?.actions).toContainEqual({ type: 'increment', path: 'globals.round' });
    expect(nextRound?.actions).toContainEqual({ type: 'transition', to: 'question' });
  });

  it('next_round does not fire at round limit (round >= 5)', () => {
    const engine = new RuleEngine(triviaRules);
    const ctx = makeGameState(
      { p1: 2, p2: 2, p3: 2 },
      { p1: true, p2: true, p3: true },
      5,
    );
    const results = engine.evaluate(ctx);
    const nextRound = results.find((r) => r.ruleId === 'next_round');
    expect(nextRound?.matched).toBe(false);
  });

  it('full game simulation: round progression until winner', () => {
    const engine = new RuleEngine(triviaRules);

    // Round 1: all submit, no winner yet (scores: p1=1, p2=1, p3=0)
    let ctx = makeGameState(
      { p1: 1, p2: 1, p3: 0 },
      { p1: true, p2: true, p3: true },
      1,
    );
    let results = engine.evaluate(ctx);
    expect(results.find((r) => r.ruleId === 'check_winner')?.matched).toBe(false);
    expect(results.find((r) => r.ruleId === 'next_round')?.matched).toBe(true);

    // Round 2: scores progress
    ctx = makeGameState(
      { p1: 2, p2: 1, p3: 1 },
      { p1: true, p2: true, p3: true },
      2,
    );
    results = engine.evaluate(ctx);
    expect(results.find((r) => r.ruleId === 'check_winner')?.matched).toBe(false);

    // Round 3: p1 wins!
    ctx = makeGameState(
      { p1: 3, p2: 2, p3: 1 },
      { p1: true, p2: true, p3: true },
      3,
    );
    results = engine.evaluate(ctx);
    const winner = results.find((r) => r.ruleId === 'check_winner');
    expect(winner?.matched).toBe(true);
    expect(winner?.actions).toContainEqual({ type: 'transition', to: 'results' });
  });
});
