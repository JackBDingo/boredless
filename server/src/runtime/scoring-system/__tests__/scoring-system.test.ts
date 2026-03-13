/**
 * scoring-system.test.ts — Comprehensive tests for the Scoring & Victory subsystem.
 *
 * Covers:
 * - ScoreManager basic operations
 * - Leaderboard
 * - Scoring rules (all formula types, targeting, conditions)
 * - History / audit trail
 * - Victory evaluator (all condition types)
 * - Tiebreak logic
 * - Formula evaluator
 * - Schema validation (Zod)
 * - Integration: Quiz game scenario
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScoreManager } from '../score-manager.js';
import { evaluateFormula } from '../formula-evaluator.js';
import { evaluateVictory } from '../victory-evaluator.js';
import {
  ScoringConfigSchema,
  ScoreTrackSchema,
  ScoringRuleSchema,
  VictoryConditionSchema,
  TiebreakRuleSchema,
} from '../schema-integration.js';
import type {
  ScoringConfig,
  PlayerScores,
  ScoringRuleContext,
} from '../types.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<ScoringConfig> = {}): ScoringConfig {
  return {
    tracks: [
      { id: 'points', name: 'Points', initial: 0, direction: 'higher-better' },
      { id: 'lives', name: 'Lives', initial: 3, min: 0, max: 5, direction: 'lower-better' },
    ],
    rules: [
      {
        id: 'gain_points',
        track: 'points',
        trigger: 'manual',
        targets: 'active-player',
        formula: { type: 'fixed', amount: 10 },
      },
      {
        id: 'lose_life',
        track: 'lives',
        trigger: 'manual',
        targets: 'specific',
        formula: { type: 'fixed', amount: -1 },
      },
      {
        id: 'score_all',
        track: 'points',
        trigger: 'manual',
        targets: 'all-players',
        formula: { type: 'fixed', amount: 5 },
      },
    ],
    victory: { type: 'highest_score', track: 'points' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ScoreManager — basic operations
// ---------------------------------------------------------------------------

describe('ScoreManager — basic operations', () => {
  let manager: ScoreManager;

  beforeEach(() => {
    manager = new ScoreManager(makeConfig(), ['p1', 'p2', 'p3']);
  });

  it('initializes with correct starting scores', () => {
    expect(manager.getScore('p1', 'points')).toBe(0);
    expect(manager.getScore('p1', 'lives')).toBe(3);
    expect(manager.getScore('p2', 'points')).toBe(0);
    expect(manager.getScore('p3', 'lives')).toBe(3);
  });

  it('getScore returns initial value', () => {
    expect(manager.getScore('p1', 'points')).toBe(0);
  });

  it('getAllScores returns all tracks for a player', () => {
    const scores = manager.getAllScores('p1');
    expect(scores).toEqual({ points: 0, lives: 3 });
  });

  it('applyScore adds to score', () => {
    manager.applyScore('p1', 'points', 50, 'test');
    expect(manager.getScore('p1', 'points')).toBe(50);
  });

  it('applyScore subtracts from score', () => {
    manager.applyScore('p1', 'lives', -1, 'test');
    expect(manager.getScore('p1', 'lives')).toBe(2);
  });

  it('applyScore respects min bound (does not go below)', () => {
    manager.applyScore('p1', 'lives', -100, 'test');
    expect(manager.getScore('p1', 'lives')).toBe(0); // min is 0
  });

  it('applyScore respects max bound (does not exceed)', () => {
    manager.applyScore('p1', 'lives', 100, 'test');
    expect(manager.getScore('p1', 'lives')).toBe(5); // max is 5
  });

  it('getTrackScores returns all players for a track', () => {
    manager.applyScore('p1', 'points', 10, 'test');
    manager.applyScore('p2', 'points', 20, 'test');
    const trackScores = manager.getTrackScores('points');
    expect(trackScores).toEqual({ p1: 10, p2: 20, p3: 0 });
  });

  it('addPlayer initializes with defaults', () => {
    manager.addPlayer('p4');
    expect(manager.getScore('p4', 'points')).toBe(0);
    expect(manager.getScore('p4', 'lives')).toBe(3);
    const all = manager.getTrackScores('points');
    expect(all['p4']).toBe(0);
  });

  it('removePlayer removes scores', () => {
    manager.removePlayer('p1');
    const trackScores = manager.getTrackScores('points');
    expect(trackScores['p1']).toBeUndefined();
  });

  it('reset restores initial values', () => {
    manager.applyScore('p1', 'points', 100, 'test');
    manager.applyScore('p2', 'lives', -2, 'test');
    manager.reset();
    expect(manager.getScore('p1', 'points')).toBe(0);
    expect(manager.getScore('p2', 'lives')).toBe(3);
  });

  it('getSnapshot returns a deep copy', () => {
    manager.applyScore('p1', 'points', 10, 'test');
    const snapshot = manager.getSnapshot();
    // Mutating snapshot should not affect manager
    snapshot['p1'].scores['points'] = 999;
    expect(manager.getScore('p1', 'points')).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// ScoreManager — leaderboard
// ---------------------------------------------------------------------------

describe('ScoreManager — leaderboard', () => {
  it('getLeaderboard sorts by score descending (higher-better)', () => {
    const manager = new ScoreManager(makeConfig(), ['p1', 'p2', 'p3']);
    manager.applyScore('p1', 'points', 30, 'test');
    manager.applyScore('p2', 'points', 10, 'test');
    manager.applyScore('p3', 'points', 20, 'test');
    const lb = manager.getLeaderboard('points');
    expect(lb[0].playerId).toBe('p1');
    expect(lb[0].score).toBe(30);
    expect(lb[0].rank).toBe(1);
    expect(lb[1].playerId).toBe('p3');
    expect(lb[1].rank).toBe(2);
    expect(lb[2].playerId).toBe('p2');
    expect(lb[2].rank).toBe(3);
  });

  it('getLeaderboard sorts ascending for lower-better tracks', () => {
    // lives track is lower-better — fewer lives lost = better rank
    const manager = new ScoreManager(makeConfig(), ['p1', 'p2', 'p3']);
    manager.applyScore('p1', 'lives', -2, 'test'); // 1 life left
    manager.applyScore('p2', 'lives', -1, 'test'); // 2 lives left
    // p3 has 3 lives (initial)
    const lb = manager.getLeaderboard('lives');
    // lower-better: fewer lives remaining = better rank? Actually lower-better means
    // LOWER value is better — so p1 with 1 life remaining ranks FIRST
    expect(lb[0].playerId).toBe('p1');
    expect(lb[0].score).toBe(1);
    expect(lb[0].rank).toBe(1);
  });

  it('tied players get same rank', () => {
    const manager = new ScoreManager(makeConfig(), ['p1', 'p2', 'p3']);
    manager.applyScore('p1', 'points', 20, 'test');
    manager.applyScore('p2', 'points', 20, 'test');
    manager.applyScore('p3', 'points', 10, 'test');
    const lb = manager.getLeaderboard('points');
    expect(lb[0].rank).toBe(1);
    expect(lb[1].rank).toBe(1);
    expect(lb[2].rank).toBe(3);
  });

  it('empty leaderboard returns empty array', () => {
    const manager = new ScoreManager(makeConfig(), []);
    expect(manager.getLeaderboard('points')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ScoreManager — scoring rules
// ---------------------------------------------------------------------------

describe('ScoreManager — scoring rules', () => {
  it('fixed formula applies correctly', () => {
    const manager = new ScoreManager(makeConfig(), ['p1']);
    const ctx: ScoringRuleContext = { playerId: 'p1', state: {} };
    manager.applyScoringRule('gain_points', ctx);
    expect(manager.getScore('p1', 'points')).toBe(10);
  });

  it('expression formula evaluates correctly', () => {
    const config = makeConfig({
      rules: [
        {
          id: 'expr_score',
          track: 'points',
          trigger: 'manual',
          targets: 'active-player',
          formula: { type: 'expression', expr: 'round * 10' },
        },
      ],
    });
    const manager = new ScoreManager(config, ['p1']);
    const ctx: ScoringRuleContext = { playerId: 'p1', state: {}, round: 3 };
    manager.applyScoringRule('expr_score', ctx);
    expect(manager.getScore('p1', 'points')).toBe(30);
  });

  it('multiplier formula applies correctly', () => {
    const config = makeConfig({
      rules: [
        {
          id: 'speed_bonus',
          track: 'points',
          trigger: 'manual',
          targets: 'active-player',
          formula: { type: 'multiplier', base: 5, multiplier: 'timeRemaining' },
        },
      ],
    });
    const manager = new ScoreManager(config, ['p1']);
    const ctx: ScoringRuleContext = { playerId: 'p1', state: { timeRemaining: 4 } };
    manager.applyScoringRule('speed_bonus', ctx);
    expect(manager.getScore('p1', 'points')).toBe(20); // 5 * 4
  });

  it('lookup formula maps correctly', () => {
    const config = makeConfig({
      rules: [
        {
          id: 'difficulty_score',
          track: 'points',
          trigger: 'manual',
          targets: 'active-player',
          formula: {
            type: 'lookup',
            key: 'difficulty',
            table: { easy: 10, medium: 20, hard: 30 },
          },
        },
      ],
    });
    const manager = new ScoreManager(config, ['p1']);
    const ctx: ScoringRuleContext = { playerId: 'p1', state: { difficulty: 'hard' } };
    manager.applyScoringRule('difficulty_score', ctx);
    expect(manager.getScore('p1', 'points')).toBe(30);
  });

  it('lookup formula returns 0 for unknown key', () => {
    const config = makeConfig({
      rules: [
        {
          id: 'difficulty_score',
          track: 'points',
          trigger: 'manual',
          targets: 'active-player',
          formula: {
            type: 'lookup',
            key: 'difficulty',
            table: { easy: 10 },
          },
        },
      ],
    });
    const manager = new ScoreManager(config, ['p1']);
    const ctx: ScoringRuleContext = { playerId: 'p1', state: { difficulty: 'unknown' } };
    manager.applyScoringRule('difficulty_score', ctx);
    expect(manager.getScore('p1', 'points')).toBe(0);
  });

  it('scoring rule with conditions only applies when conditions are met', () => {
    const config = makeConfig({
      rules: [
        {
          id: 'conditional_score',
          track: 'points',
          trigger: 'manual',
          targets: 'active-player',
          formula: { type: 'fixed', amount: 50 },
          conditions: [{ field: 'globals.round', operator: '>=', value: 3 }],
        },
      ],
    });
    const manager = new ScoreManager(config, ['p1']);

    // Round 2 — condition not met
    const ctx2: ScoringRuleContext = { playerId: 'p1', state: { globals: { round: 2 } } };
    manager.applyScoringRule('conditional_score', ctx2);
    expect(manager.getScore('p1', 'points')).toBe(0);

    // Round 3 — condition met
    const ctx3: ScoringRuleContext = { playerId: 'p1', state: { globals: { round: 3 } } };
    manager.applyScoringRule('conditional_score', ctx3);
    expect(manager.getScore('p1', 'points')).toBe(50);
  });

  it("rule targeting 'all-players' scores everyone", () => {
    const manager = new ScoreManager(makeConfig(), ['p1', 'p2', 'p3']);
    const ctx: ScoringRuleContext = { state: {} };
    manager.applyScoringRule('score_all', ctx);
    expect(manager.getScore('p1', 'points')).toBe(5);
    expect(manager.getScore('p2', 'points')).toBe(5);
    expect(manager.getScore('p3', 'points')).toBe(5);
  });

  it("rule targeting 'active-player' scores only the current player", () => {
    const manager = new ScoreManager(makeConfig(), ['p1', 'p2']);
    const ctx: ScoringRuleContext = { playerId: 'p1', state: {} };
    manager.applyScoringRule('gain_points', ctx);
    expect(manager.getScore('p1', 'points')).toBe(10);
    expect(manager.getScore('p2', 'points')).toBe(0);
  });

  it("rule targeting 'specific' scores the given player", () => {
    const config = makeConfig({
      rules: [
        {
          id: 'specific_score',
          track: 'points',
          trigger: 'manual',
          targets: 'specific',
          targetPlayerId: 'p2',
          formula: { type: 'fixed', amount: 99 },
        },
      ],
    });
    const manager = new ScoreManager(config, ['p1', 'p2']);
    const ctx: ScoringRuleContext = { state: {} };
    manager.applyScoringRule('specific_score', ctx);
    expect(manager.getScore('p1', 'points')).toBe(0);
    expect(manager.getScore('p2', 'points')).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// ScoreManager — history
// ---------------------------------------------------------------------------

describe('ScoreManager — history', () => {
  it('score changes are recorded in history', () => {
    const manager = new ScoreManager(makeConfig(), ['p1']);
    manager.applyScore('p1', 'points', 10, 'rule1');
    const history = manager.getHistory('p1');
    expect(history).toHaveLength(1);
    expect(history[0].trackId).toBe('points');
    expect(history[0].ruleId).toBe('rule1');
    expect(history[0].amount).toBe(10);
  });

  it('history includes previous and new values', () => {
    const manager = new ScoreManager(makeConfig(), ['p1']);
    manager.applyScore('p1', 'points', 10, 'r1');
    manager.applyScore('p1', 'points', 5, 'r2');
    const history = manager.getHistory('p1');
    expect(history[0].previousValue).toBe(0);
    expect(history[0].newValue).toBe(10);
    expect(history[1].previousValue).toBe(10);
    expect(history[1].newValue).toBe(15);
  });

  it('getHistory filters by player', () => {
    const manager = new ScoreManager(makeConfig(), ['p1', 'p2']);
    manager.applyScore('p1', 'points', 10, 'r1');
    manager.applyScore('p2', 'points', 20, 'r2');
    const p1History = manager.getHistory('p1');
    expect(p1History).toHaveLength(1);
    expect(p1History[0].ruleId).toBe('r1');
  });

  it('getHistory without filter returns all changes', () => {
    const manager = new ScoreManager(makeConfig(), ['p1', 'p2']);
    manager.applyScore('p1', 'points', 10, 'r1');
    manager.applyScore('p2', 'points', 20, 'r2');
    const allHistory = manager.getHistory();
    expect(allHistory).toHaveLength(2);
  });

  it('history tracks ruleId', () => {
    const manager = new ScoreManager(makeConfig(), ['p1']);
    manager.applyScoringRule('gain_points', { playerId: 'p1', state: {} });
    const history = manager.getHistory('p1');
    expect(history[0].ruleId).toBe('gain_points');
  });
});

// ---------------------------------------------------------------------------
// Victory evaluator
// ---------------------------------------------------------------------------

describe('Victory evaluator', () => {
  function makeScores(data: Record<string, Record<string, number>>): Map<string, PlayerScores> {
    const map = new Map<string, PlayerScores>();
    for (const [playerId, scores] of Object.entries(data)) {
      map.set(playerId, { playerId, scores, history: [] });
    }
    return map;
  }

  describe('highest_score', () => {
    it('player with most points wins', () => {
      const scores = makeScores({ p1: { points: 100 }, p2: { points: 50 } });
      const result = evaluateVictory({ type: 'highest_score', track: 'points' }, scores);
      expect(result.gameOver).toBe(true);
      expect(result.winners).toEqual(['p1']);
    });

    it('multiple players tied returns all', () => {
      const scores = makeScores({ p1: { points: 100 }, p2: { points: 100 } });
      const result = evaluateVictory({ type: 'highest_score', track: 'points' }, scores);
      expect(result.gameOver).toBe(true);
      expect(result.winners).toContain('p1');
      expect(result.winners).toContain('p2');
      expect(result.winners).toHaveLength(2);
    });
  });

  describe('target_score', () => {
    it('first to reach target wins', () => {
      const scores = makeScores({ p1: { points: 100 }, p2: { points: 50 } });
      const result = evaluateVictory(
        { type: 'target_score', track: 'points', target: 100 },
        scores,
      );
      expect(result.gameOver).toBe(true);
      expect(result.winners).toEqual(['p1']);
    });

    it('no one reached target → gameOver=false', () => {
      const scores = makeScores({ p1: { points: 40 }, p2: { points: 50 } });
      const result = evaluateVictory(
        { type: 'target_score', track: 'points', target: 100 },
        scores,
      );
      expect(result.gameOver).toBe(false);
      expect(result.winners).toHaveLength(0);
    });
  });

  describe('last_standing', () => {
    it('one player left → they win', () => {
      const scores = makeScores({
        p1: { lives: 0 },
        p2: { lives: 0 },
        p3: { lives: 2 },
      });
      const result = evaluateVictory(
        { type: 'last_standing', eliminationTrack: 'lives' },
        scores,
      );
      expect(result.gameOver).toBe(true);
      expect(result.winners).toEqual(['p3']);
    });

    it('multiple players → gameOver=false', () => {
      const scores = makeScores({
        p1: { lives: 1 },
        p2: { lives: 2 },
      });
      const result = evaluateVictory(
        { type: 'last_standing', eliminationTrack: 'lives' },
        scores,
      );
      expect(result.gameOver).toBe(false);
    });
  });

  describe('round_limit', () => {
    it('round >= max → evaluate by score', () => {
      const scores = makeScores({ p1: { points: 80 }, p2: { points: 60 } });
      const result = evaluateVictory(
        { type: 'round_limit', maxRounds: 5, thenBy: 'highest_score', track: 'points' },
        scores,
        undefined,
        { round: 5 },
      );
      expect(result.gameOver).toBe(true);
      expect(result.winners).toEqual(['p1']);
    });

    it('round < max → gameOver=false', () => {
      const scores = makeScores({ p1: { points: 80 }, p2: { points: 60 } });
      const result = evaluateVictory(
        { type: 'round_limit', maxRounds: 5, thenBy: 'highest_score', track: 'points' },
        scores,
        undefined,
        { round: 3 },
      );
      expect(result.gameOver).toBe(false);
    });
  });

  describe('rankings', () => {
    it('rankings are ordered correctly', () => {
      const scores = makeScores({ p1: { points: 10 }, p2: { points: 30 }, p3: { points: 20 } });
      const result = evaluateVictory({ type: 'highest_score', track: 'points' }, scores);
      expect(result.rankings[0].playerId).toBe('p2');
      expect(result.rankings[0].rank).toBe(1);
      expect(result.rankings[1].rank).toBe(2);
      expect(result.rankings[2].rank).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Tiebreak
// ---------------------------------------------------------------------------

describe('Tiebreak', () => {
  function makeScores(
    data: Record<string, Record<string, number>>,
    history: Record<string, { trackId: string; amount: number; timestamp: number }[]> = {},
  ): Map<string, PlayerScores> {
    const map = new Map<string, PlayerScores>();
    for (const [playerId, scores] of Object.entries(data)) {
      const h = (history[playerId] ?? []).map((e) => ({
        trackId: e.trackId,
        ruleId: 'test',
        amount: e.amount,
        previousValue: 0,
        newValue: e.amount,
        timestamp: e.timestamp,
      }));
      map.set(playerId, { playerId, scores, history: h });
    }
    return map;
  }

  it('none: ties allowed, multiple winners', () => {
    const scores = makeScores({ p1: { points: 100 }, p2: { points: 100 } });
    const result = evaluateVictory(
      { type: 'highest_score', track: 'points' },
      scores,
      { method: 'none' },
    );
    expect(result.winners).toHaveLength(2);
    expect(result.tiebroken).toBe(false);
  });

  it('secondary_track: breaks tie using another track', () => {
    // p1 and p2 tied on points; p1 has more secondary
    const scores = makeScores({
      p1: { points: 100, secondary: 50 },
      p2: { points: 100, secondary: 30 },
    });
    const result = evaluateVictory(
      { type: 'highest_score', track: 'points' },
      scores,
      { method: 'secondary_track', track: 'secondary' },
    );
    expect(result.winners).toEqual(['p1']);
    expect(result.tiebroken).toBe(true);
  });

  it('most_recent_gain: player with most recent score change wins', () => {
    const scores = makeScores(
      { p1: { points: 100 }, p2: { points: 100 } },
      {
        p1: [{ trackId: 'points', amount: 100, timestamp: 1000 }],
        p2: [{ trackId: 'points', amount: 100, timestamp: 2000 }],
      },
    );
    const result = evaluateVictory(
      { type: 'highest_score', track: 'points' },
      scores,
      { method: 'most_recent_gain' },
    );
    expect(result.winners).toEqual(['p2']);
    expect(result.tiebroken).toBe(true);
  });

  it('random: one winner selected from tied players', () => {
    const scores = makeScores({ p1: { points: 100 }, p2: { points: 100 }, p3: { points: 100 } });
    const result = evaluateVictory(
      { type: 'highest_score', track: 'points' },
      scores,
      { method: 'random' },
    );
    expect(result.winners).toHaveLength(1);
    expect(['p1', 'p2', 'p3']).toContain(result.winners[0]);
    expect(result.tiebroken).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Formula evaluator
// ---------------------------------------------------------------------------

describe('Formula evaluator', () => {
  it('fixed returns amount', () => {
    expect(evaluateFormula({ type: 'fixed', amount: 42 }, {})).toBe(42);
    expect(evaluateFormula({ type: 'fixed', amount: -5 }, {})).toBe(-5);
  });

  it('expression with addition: "a + b"', () => {
    expect(evaluateFormula({ type: 'expression', expr: 'a + b' }, { a: 3, b: 7 })).toBe(10);
  });

  it('expression with multiplication: "a * 10"', () => {
    expect(evaluateFormula({ type: 'expression', expr: 'a * 10' }, { a: 5 })).toBe(50);
  });

  it('expression with nested field: "player.bonus + 5"', () => {
    const result = evaluateFormula(
      { type: 'expression', expr: 'player.bonus + 5' },
      { player: { bonus: 15 } },
    );
    expect(result).toBe(20);
  });

  it('multiplier: base * resolved value', () => {
    const result = evaluateFormula(
      { type: 'multiplier', base: 10, multiplier: 'factor' },
      { factor: 3 },
    );
    expect(result).toBe(30);
  });

  it('does NOT use eval() — verify no eval in source', async () => {
    // Strip comments from source, then check for eval usage
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      __dirname,
      '../formula-evaluator.ts',
    );
    const src = fs.readFileSync(filePath, 'utf-8');
    // Remove single-line and block comments before checking
    const noComments = src
      .replace(/\/\/[^\n]*/g, '') // single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
    // Should not contain actual eval() or new Function() calls in code
    expect(noComments).not.toMatch(/[^a-zA-Z]eval\s*\(/);
    expect(noComments).not.toContain('new Function(');
  });

  it('expression with parentheses: "(a + b) * c"', () => {
    expect(
      evaluateFormula({ type: 'expression', expr: '(a + b) * c' }, { a: 2, b: 3, c: 4 }),
    ).toBe(20);
  });

  it('expression with subtraction: "a - b"', () => {
    expect(evaluateFormula({ type: 'expression', expr: 'a - b' }, { a: 10, b: 3 })).toBe(7);
  });

  it('expression with division: "a / b"', () => {
    expect(evaluateFormula({ type: 'expression', expr: 'a / b' }, { a: 10, b: 2 })).toBe(5);
  });

  it('lookup formula maps correctly', () => {
    const result = evaluateFormula(
      { type: 'lookup', key: 'tier', table: { bronze: 10, silver: 20, gold: 50 } },
      { tier: 'gold' },
    );
    expect(result).toBe(50);
  });

  it('lookup formula returns 0 for unknown key', () => {
    const result = evaluateFormula(
      { type: 'lookup', key: 'tier', table: { bronze: 10 } },
      { tier: 'platinum' },
    );
    expect(result).toBe(0);
  });

  it('expression: missing field treated as 0', () => {
    expect(evaluateFormula({ type: 'expression', expr: 'missing + 5' }, {})).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('Schema validation', () => {
  it('valid scoring config parses', () => {
    const config = {
      tracks: [{ id: 'points', name: 'Points', initial: 0, direction: 'higher-better' }],
      rules: [],
      victory: { type: 'highest_score', track: 'points' },
    };
    expect(() => ScoringConfigSchema.parse(config)).not.toThrow();
  });

  it('track with all fields parses', () => {
    const track = {
      id: 'points',
      name: 'Points',
      initial: 0,
      min: 0,
      max: 1000,
      direction: 'higher-better',
      display: { format: 'number', suffix: ' pts', icon: '⭐' },
    };
    expect(() => ScoreTrackSchema.parse(track)).not.toThrow();
  });

  it('track with minimal fields parses', () => {
    const track = { id: 'pts', name: 'Points', initial: 0, direction: 'lower-better' };
    expect(() => ScoreTrackSchema.parse(track)).not.toThrow();
  });

  it('invalid direction is rejected', () => {
    const track = { id: 'pts', name: 'Points', initial: 0, direction: 'sideways' };
    expect(() => ScoreTrackSchema.parse(track)).toThrow();
  });

  it('valid victory condition parses', () => {
    expect(() =>
      VictoryConditionSchema.parse({
        type: 'round_limit',
        maxRounds: 10,
        thenBy: 'highest_score',
        track: 'points',
      }),
    ).not.toThrow();
  });

  it('invalid victory type is rejected', () => {
    expect(() =>
      VictoryConditionSchema.parse({ type: 'first_blood', track: 'points' }),
    ).toThrow();
  });

  it('valid tiebreak parses', () => {
    expect(() =>
      TiebreakRuleSchema.parse({ method: 'secondary_track', track: 'lives' }),
    ).not.toThrow();
    expect(() => TiebreakRuleSchema.parse({ method: 'random' })).not.toThrow();
  });

  it('scoring rule with formula parses', () => {
    const rule = {
      id: 'correct_answer',
      track: 'points',
      trigger: 'manual',
      targets: 'specific',
      formula: { type: 'expression', expr: '10 * round' },
    };
    expect(() => ScoringRuleSchema.parse(rule)).not.toThrow();
  });

  it('invalid tiebreak method is rejected', () => {
    expect(() => TiebreakRuleSchema.parse({ method: 'coin_flip' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration test — Quiz game scoring
// ---------------------------------------------------------------------------

describe('Integration — Quiz game scoring', () => {
  it('simulates 5 rounds with tiebreak by lives', () => {
    /**
     * Setup:
     * - points track (0 initial), lives track (3 initial, min 0)
     * - Victory: round_limit (5 rounds), highest_score on points
     * - Tiebreak: secondary_track on lives (higher lives wins — lives is lower-better but
     *   more lives remaining is better when using as tiebreaker)
     *
     * Simulation:
     * - Player A gets 3 correct (30 pts each round from expr: 10 * round), lives: 3
     * - Player B gets 3 correct (30 pts each round), but loses 1 life
     * - Expected: tied on points (90 pts each... actually this depends on rounds)
     *
     * Simplified: player A and B both score 30 pts total, player B loses 1 life
     * Tiebreak: secondary on lives — player A wins (3 > 2)
     */
    const config: ScoringConfig = {
      tracks: [
        { id: 'points', name: 'Points', initial: 0, direction: 'higher-better' },
        { id: 'lives', name: 'Lives', initial: 3, min: 0, direction: 'lower-better' },
      ],
      rules: [
        {
          id: 'correct_answer',
          track: 'points',
          trigger: 'manual',
          targets: 'specific',
          formula: { type: 'fixed', amount: 10 },
        },
        {
          id: 'wrong_answer',
          track: 'lives',
          trigger: 'manual',
          targets: 'specific',
          formula: { type: 'fixed', amount: -1 },
        },
      ],
      victory: {
        type: 'round_limit',
        maxRounds: 5,
        thenBy: 'highest_score',
        track: 'points',
      },
      tiebreak: {
        method: 'secondary_track',
        track: 'lives',
      },
    };

    const manager = new ScoreManager(config, ['playerA', 'playerB']);

    // Simulate 5 rounds
    // Player A: 3 correct answers (rounds 1, 2, 3) = 30 pts, 0 wrong
    // Player B: 3 correct answers (rounds 1, 2, 3) = 30 pts, 1 wrong answer (round 4)
    for (let round = 1; round <= 3; round++) {
      manager.applyScoringRule('correct_answer', {
        playerId: 'playerA',
        state: {},
        round,
      });
      manager.applyScoringRule('correct_answer', {
        playerId: 'playerB',
        state: {},
        round,
      });
    }

    // Player B gets a wrong answer in round 4
    manager.applyScoringRule('wrong_answer', {
      playerId: 'playerB',
      state: {},
      round: 4,
    });

    // Check scores
    expect(manager.getScore('playerA', 'points')).toBe(30);
    expect(manager.getScore('playerB', 'points')).toBe(30);
    expect(manager.getScore('playerA', 'lives')).toBe(3);
    expect(manager.getScore('playerB', 'lives')).toBe(2);

    // Check victory after round 5
    const result = manager.checkVictory({ round: 5 });

    expect(result.gameOver).toBe(true);
    expect(result.tiebroken).toBe(true);

    // Tiebreak: secondary_track = lives (higher value wins as secondary)
    // Player A has 3 lives, Player B has 2 lives → Player A wins
    expect(result.winners).toEqual(['playerA']);

    // Rankings
    expect(result.rankings[0].playerId).toBe('playerA');
    expect(result.rankings[0].rank).toBe(1);
  });

  it('before round limit, victory is not triggered', () => {
    const config: ScoringConfig = {
      tracks: [{ id: 'points', name: 'Points', initial: 0, direction: 'higher-better' }],
      rules: [],
      victory: { type: 'round_limit', maxRounds: 5, thenBy: 'highest_score', track: 'points' },
    };

    const manager = new ScoreManager(config, ['p1', 'p2']);
    manager.applyScore('p1', 'points', 100, 'test');

    const result = manager.checkVictory({ round: 3 });
    expect(result.gameOver).toBe(false);
  });
});
