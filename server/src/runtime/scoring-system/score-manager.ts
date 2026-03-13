/**
 * score-manager.ts — ScoreManager class.
 *
 * Manages score state for all players across all score tracks.
 * Evaluates scoring rules and checks victory conditions.
 *
 * Design: no game-specific logic; all behavior driven by ScoringConfig.
 * Returns score changes — callers apply mutations if needed (or ScoreManager
 * applies them directly here since this is the authoritative store).
 */

import type {
  ScoringConfig,
  ScoreTrack,
  ScoringRule,
  ScoringCondition,
  ScoringRuleContext,
  PlayerScores,
  ScoreChange,
  VictoryResult,
} from './types.js';
import { evaluateFormula, resolveField } from './formula-evaluator.js';
import { evaluateVictory } from './victory-evaluator.js';

// ---------------------------------------------------------------------------
// ScoreManager
// ---------------------------------------------------------------------------

export class ScoreManager {
  private readonly config: ScoringConfig;
  private readonly trackMap: Map<string, ScoreTrack>;
  private readonly ruleMap: Map<string, ScoringRule>;
  private readonly playerScores: Map<string, PlayerScores>;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /**
   * Create a ScoreManager with the given config and initialize all score tracks
   * for each player.
   */
  constructor(config: ScoringConfig, playerIds: string[]) {
    this.config = config;

    // Build lookup maps for fast access
    this.trackMap = new Map(config.tracks.map(t => [t.id, t]));
    this.ruleMap = new Map(config.rules.map(r => [r.id, r]));

    // Initialize player scores
    this.playerScores = new Map();
    for (const playerId of playerIds) {
      this.playerScores.set(playerId, this.createPlayerScores(playerId));
    }
  }

  private createPlayerScores(playerId: string): PlayerScores {
    const scores: Record<string, number> = {};
    for (const track of this.config.tracks) {
      scores[track.id] = track.initial;
    }
    return { playerId, scores, history: [] };
  }

  // ---------------------------------------------------------------------------
  // Score accessors
  // ---------------------------------------------------------------------------

  /**
   * Get a player's current score on a specific track.
   * Returns 0 if the player or track doesn't exist.
   */
  getScore(playerId: string, trackId: string): number {
    return this.playerScores.get(playerId)?.scores[trackId] ?? 0;
  }

  /**
   * Get all track scores for a player.
   * Returns empty object if player doesn't exist.
   */
  getAllScores(playerId: string): Record<string, number> {
    const ps = this.playerScores.get(playerId);
    return ps ? { ...ps.scores } : {};
  }

  /**
   * Get all players' scores for a single track.
   * Returns { playerId: score } map.
   */
  getTrackScores(trackId: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [playerId, ps] of this.playerScores) {
      result[playerId] = ps.scores[trackId] ?? 0;
    }
    return result;
  }

  /**
   * Get a sorted leaderboard for a specific track.
   * Sorting direction is determined by the track's direction config.
   * Tied players get the same rank.
   */
  getLeaderboard(trackId: string): Array<{ playerId: string; score: number; rank: number }> {
    const track = this.trackMap.get(trackId);
    const direction = track?.direction ?? 'higher-better';

    const entries = [...this.playerScores.values()].map(ps => ({
      playerId: ps.playerId,
      score: ps.scores[trackId] ?? 0,
    }));

    entries.sort((a, b) =>
      direction === 'higher-better' ? b.score - a.score : a.score - b.score,
    );

    const result: Array<{ playerId: string; score: number; rank: number }> = [];
    let currentRank = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].score !== entries[i - 1].score) {
        currentRank = i + 1;
      }
      result.push({ ...entries[i], rank: currentRank });
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Score mutation
  // ---------------------------------------------------------------------------

  /**
   * Apply a raw score change to a player's track.
   * Respects min/max bounds defined in the track config.
   * Records the change in the player's history.
   *
   * @returns The ScoreChange record describing what happened.
   */
  applyScore(
    playerId: string,
    trackId: string,
    amount: number,
    ruleId: string,
  ): ScoreChange {
    let ps = this.playerScores.get(playerId);
    if (!ps) {
      // Auto-register unknown player with defaults
      ps = this.createPlayerScores(playerId);
      this.playerScores.set(playerId, ps);
    }

    const track = this.trackMap.get(trackId);
    const previousValue = ps.scores[trackId] ?? (track?.initial ?? 0);
    let newValue = previousValue + amount;

    // Apply bounds
    if (track?.min !== undefined) newValue = Math.max(track.min, newValue);
    if (track?.max !== undefined) newValue = Math.min(track.max, newValue);

    const actualAmount = newValue - previousValue;
    ps.scores[trackId] = newValue;

    const change: ScoreChange = {
      trackId,
      ruleId,
      amount: actualAmount,
      previousValue,
      newValue,
      timestamp: Date.now(),
    };

    ps.history.push(change);
    return change;
  }

  /**
   * Evaluate and apply a scoring rule by its ID.
   * Evaluates the rule's conditions and formula, then applies the result
   * to the target player(s).
   *
   * @returns Array of ScoreChange records (one per affected player).
   */
  applyScoringRule(ruleId: string, context: ScoringRuleContext): ScoreChange[] {
    const rule = this.ruleMap.get(ruleId);
    if (!rule) {
      throw new Error(`ScoringSystem: unknown scoring rule "${ruleId}"`);
    }

    // Check conditions
    if (rule.conditions && rule.conditions.length > 0) {
      const allPass = rule.conditions.every(c => evaluateCondition(c, context.state));
      if (!allPass) return [];
    }

    // Build formula context
    const formulaContext: Record<string, unknown> = {
      ...context.state,
      round: context.round ?? 0,
      ...(context.event?.data ?? {}),
    };

    const amount = evaluateFormula(rule.formula, formulaContext);

    // Determine targets
    const targetIds = this.resolveTargets(rule, context);
    if (targetIds.length === 0) return [];

    const changes: ScoreChange[] = [];
    for (const targetId of targetIds) {
      const change = this.applyScore(targetId, rule.track, amount, ruleId);
      changes.push(change);
    }

    return changes;
  }

  /**
   * Evaluate the configured victory condition against current scores.
   * Pass the current round number in context when using round_limit victory.
   */
  checkVictory(context: Record<string, unknown> = {}): VictoryResult {
    return evaluateVictory(
      this.config.victory,
      this.playerScores,
      this.config.tiebreak,
      context,
    );
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  /**
   * Get the score change history.
   * If playerId is provided, returns only that player's history.
   * Otherwise returns all changes across all players (chronological order).
   */
  getHistory(playerId?: string): ScoreChange[] {
    if (playerId) {
      return [...(this.playerScores.get(playerId)?.history ?? [])];
    }
    // Merge all player histories sorted by timestamp
    const all: ScoreChange[] = [];
    for (const ps of this.playerScores.values()) {
      all.push(...ps.history);
    }
    all.sort((a, b) => a.timestamp - b.timestamp);
    return all;
  }

  // ---------------------------------------------------------------------------
  // State management
  // ---------------------------------------------------------------------------

  /**
   * Reset all players' scores to their initial values and clear history.
   */
  reset(): void {
    for (const playerId of this.playerScores.keys()) {
      this.playerScores.set(playerId, this.createPlayerScores(playerId));
    }
  }

  /**
   * Return a deep snapshot of all player scores (no references shared).
   */
  getSnapshot(): Record<string, PlayerScores> {
    const snapshot: Record<string, PlayerScores> = {};
    for (const [playerId, ps] of this.playerScores) {
      snapshot[playerId] = {
        playerId: ps.playerId,
        scores: { ...ps.scores },
        history: ps.history.map(h => ({ ...h })),
      };
    }
    return snapshot;
  }

  /**
   * Add a new player mid-game (initialized with track defaults).
   */
  addPlayer(playerId: string): void {
    if (!this.playerScores.has(playerId)) {
      this.playerScores.set(playerId, this.createPlayerScores(playerId));
    }
  }

  /**
   * Remove a player from score tracking.
   */
  removePlayer(playerId: string): void {
    this.playerScores.delete(playerId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private resolveTargets(rule: ScoringRule, context: ScoringRuleContext): string[] {
    switch (rule.targets) {
      case 'all-players':
        return [...this.playerScores.keys()];

      case 'active-player': {
        const pid = context.playerId;
        if (!pid) return [];
        if (!this.playerScores.has(pid)) return [];
        return [pid];
      }

      case 'specific': {
        const pid = rule.targetPlayerId ?? context.playerId;
        if (!pid) return [];
        if (!this.playerScores.has(pid)) return [];
        return [pid];
      }

      default:
        return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function evaluateCondition(condition: ScoringCondition, state: Record<string, unknown>): boolean {
  const rawValue = resolveField(condition.field, state);
  const left = rawValue;
  const right = condition.value;

  switch (condition.operator) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
      return typeof left === 'number' && typeof right === 'number' && left > right;
    case '<':
      return typeof left === 'number' && typeof right === 'number' && left < right;
    case '>=':
      return typeof left === 'number' && typeof right === 'number' && left >= right;
    case '<=':
      return typeof left === 'number' && typeof right === 'number' && left <= right;
    default:
      return false;
  }
}
