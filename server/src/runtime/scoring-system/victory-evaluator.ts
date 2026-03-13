/**
 * victory-evaluator.ts — Victory condition and tiebreak evaluation.
 *
 * Pure function: takes scores + condition config, returns VictoryResult.
 * Does NOT mutate any state — callers decide what to do with the result.
 *
 * Design: game-agnostic, no game-specific logic, no imports from other
 * V2 subsystems (content, event, rule-engine, etc.).
 */

import type {
  VictoryCondition,
  TiebreakRule,
  PlayerScores,
  VictoryResult,
} from './types.js';
import { evaluateExpression } from './formula-evaluator.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a victory condition against the current score state.
 *
 * @param condition - The victory condition declared in the game schema
 * @param scores    - Map of playerId → PlayerScores
 * @param tiebreak  - Optional tiebreak rule to apply when players are tied
 * @param context   - Optional additional context (e.g. { round: 5 }) for custom/round_limit conditions
 * @returns VictoryResult describing game over state and rankings
 */
export function evaluateVictory(
  condition: VictoryCondition,
  scores: Map<string, PlayerScores>,
  tiebreak?: TiebreakRule,
  context: Record<string, unknown> = {},
): VictoryResult {
  switch (condition.type) {
    case 'highest_score':
      return evaluateHighestScore(condition.track, scores, tiebreak);

    case 'target_score':
      return evaluateTargetScore(condition.track, condition.target, scores, tiebreak);

    case 'last_standing':
      return evaluateLastStanding(scores, condition.eliminationTrack, tiebreak);

    case 'round_limit':
      return evaluateRoundLimit(condition, scores, tiebreak, context);

    case 'custom':
      return evaluateCustom(condition.expression, scores, context);
  }
}

// ---------------------------------------------------------------------------
// Victory type implementations
// ---------------------------------------------------------------------------

/**
 * highest_score: the player(s) with the highest score win.
 * Game over is determined by the caller — this just ranks players.
 * Always returns gameOver: true (caller checks when to call this).
 */
function evaluateHighestScore(
  trackId: string,
  scores: Map<string, PlayerScores>,
  tiebreak?: TiebreakRule,
): VictoryResult {
  const players = [...scores.values()];
  if (players.length === 0) {
    return { gameOver: true, winners: [], rankings: [], tiebroken: false };
  }

  const sorted = sortByTrack(players, trackId, 'higher-better');
  return buildResult(sorted, trackId, tiebreak, scores, true);
}

/**
 * target_score: first player to reach or exceed the target wins.
 * gameOver: true if any player has reached the target.
 */
function evaluateTargetScore(
  trackId: string,
  target: number,
  scores: Map<string, PlayerScores>,
  tiebreak?: TiebreakRule,
): VictoryResult {
  const players = [...scores.values()];
  const atTarget = players.filter(p => (p.scores[trackId] ?? 0) >= target);

  if (atTarget.length === 0) {
    // No one has reached the target yet
    const sorted = sortByTrack(players, trackId, 'higher-better');
    return {
      gameOver: false,
      winners: [],
      rankings: buildRankings(sorted, trackId),
      tiebroken: false,
    };
  }

  const sorted = sortByTrack(atTarget, trackId, 'higher-better');
  return buildResult(sorted, trackId, tiebreak, scores, true);
}

/**
 * last_standing: game ends when only one player remains (not eliminated).
 * A player is "eliminated" if their eliminationTrack score <= min,
 * or if they've been removed from the scores map.
 */
function evaluateLastStanding(
  scores: Map<string, PlayerScores>,
  eliminationTrack: string | undefined,
  _tiebreak?: TiebreakRule,
): VictoryResult {
  const players = [...scores.values()];

  let active: PlayerScores[];
  if (eliminationTrack) {
    active = players.filter(p => (p.scores[eliminationTrack] ?? 0) > 0);
  } else {
    active = players;
  }

  if (active.length === 1) {
    const winner = active[0];
    return {
      gameOver: true,
      winners: [winner.playerId],
      rankings: [{ playerId: winner.playerId, rank: 1, scores: winner.scores }],
      tiebroken: false,
    };
  }

  if (active.length === 0) {
    // Everyone eliminated simultaneously — tie
    return {
      gameOver: true,
      winners: players.map(p => p.playerId),
      rankings: players.map(p => ({ playerId: p.playerId, rank: 1, scores: p.scores })),
      tiebroken: false,
    };
  }

  // More than one player still standing
  return {
    gameOver: false,
    winners: [],
    rankings: buildRankings(active, eliminationTrack ?? ''),
    tiebroken: false,
  };
}

/**
 * round_limit: game ends after maxRounds, then rank by score.
 */
function evaluateRoundLimit(
  condition: { maxRounds: number; thenBy: 'highest_score' | 'lowest_score'; track: string },
  scores: Map<string, PlayerScores>,
  tiebreak: TiebreakRule | undefined,
  context: Record<string, unknown>,
): VictoryResult {
  const currentRound = (context['round'] as number | undefined) ?? 0;

  if (currentRound < condition.maxRounds) {
    const players = [...scores.values()];
    const sorted = sortByTrack(players, condition.track, condition.thenBy === 'highest_score' ? 'higher-better' : 'lower-better');
    return {
      gameOver: false,
      winners: [],
      rankings: buildRankings(sorted, condition.track),
      tiebroken: false,
    };
  }

  // Round limit reached — determine winner by score
  const players = [...scores.values()];
  const direction = condition.thenBy === 'highest_score' ? 'higher-better' : 'lower-better';
  const sorted = sortByTrack(players, condition.track, direction);
  return buildResult(sorted, condition.track, tiebreak, scores, true);
}

/**
 * custom: evaluate a free-form expression that returns a playerId or null.
 */
function evaluateCustom(
  expression: string,
  scores: Map<string, PlayerScores>,
  context: Record<string, unknown>,
): VictoryResult {
  // Build a flat context for the expression evaluator
  const players = [...scores.values()];
  const flatContext: Record<string, unknown> = { ...context };

  // Inject scores into context: playerId_trackId style
  for (const ps of players) {
    for (const [trackId, score] of Object.entries(ps.scores)) {
      flatContext[`${ps.playerId}_${trackId}`] = score;
    }
  }

  try {
    const result = evaluateExpression(expression, flatContext);
    // Expression returned a number — treat as player index or 0=no winner
    if (result === 0) {
      return {
        gameOver: false,
        winners: [],
        rankings: players.map((p, i) => ({ playerId: p.playerId, rank: i + 1, scores: p.scores })),
        tiebroken: false,
      };
    }
  } catch {
    // Expression evaluation failed — no winner yet
  }

  return {
    gameOver: false,
    winners: [],
    rankings: players.map((p, i) => ({ playerId: p.playerId, rank: i + 1, scores: p.scores })),
    tiebroken: false,
  };
}

// ---------------------------------------------------------------------------
// Tiebreak logic
// ---------------------------------------------------------------------------

/**
 * Apply tiebreak rules to a sorted list of players where the top N are tied.
 * Returns the modified list with tiebreak applied, plus whether it was applied.
 */
function applyTiebreak(
  sortedPlayers: PlayerScores[],
  trackId: string,
  tiebreak: TiebreakRule | undefined,
  _allScores: Map<string, PlayerScores>,
): { players: PlayerScores[]; tiebroken: boolean } {
  if (!tiebreak || tiebreak.method === 'none' || sortedPlayers.length <= 1) {
    return { players: sortedPlayers, tiebroken: false };
  }

  if (sortedPlayers.length === 0) {
    return { players: sortedPlayers, tiebroken: false };
  }

  // Find the top score
  const topScore = sortedPlayers[0].scores[trackId] ?? 0;
  const tiedPlayers = sortedPlayers.filter(p => (p.scores[trackId] ?? 0) === topScore);

  if (tiedPlayers.length <= 1) {
    return { players: sortedPlayers, tiebroken: false };
  }

  switch (tiebreak.method) {
    case 'secondary_track': {
      if (!tiebreak.track) {
        return { players: sortedPlayers, tiebroken: false };
      }
      // Sort tied players by secondary track (higher is better for secondary)
      const tieTrackId = tiebreak.track;
      const sortedTied = [...tiedPlayers].sort((a, b) => {
        const aScore = a.scores[tieTrackId] ?? 0;
        const bScore = b.scores[tieTrackId] ?? 0;
        return bScore - aScore; // higher secondary score wins
      });

      // Check if the secondary track actually broke the tie
      const topSecondary = sortedTied[0].scores[tieTrackId] ?? 0;
      const stillTied = sortedTied.filter(p => (p.scores[tieTrackId] ?? 0) === topSecondary);
      const resolved = stillTied.length < tiedPlayers.length;

      // Rebuild the full sorted list with tie-broken players at front
      const nonTied = sortedPlayers.filter(p => (p.scores[trackId] ?? 0) !== topScore);
      return { players: [...sortedTied, ...nonTied], tiebroken: resolved };
    }

    case 'most_recent_gain': {
      // Find who had the most recent score change on the primary track
      const getLastGainTimestamp = (ps: PlayerScores): number => {
        const changes = ps.history.filter(h => h.trackId === trackId && h.amount > 0);
        if (changes.length === 0) return 0;
        return Math.max(...changes.map(c => c.timestamp));
      };

      const sortedTied = [...tiedPlayers].sort((a, b) => {
        return getLastGainTimestamp(b) - getLastGainTimestamp(a);
      });

      const nonTied = sortedPlayers.filter(p => (p.scores[trackId] ?? 0) !== topScore);

      // Check if timestamps actually differ
      const topTimestamp = getLastGainTimestamp(sortedTied[0]);
      const stillTied = sortedTied.filter(p => getLastGainTimestamp(p) === topTimestamp);
      const resolved = stillTied.length < tiedPlayers.length;

      return { players: [...sortedTied, ...nonTied], tiebroken: resolved };
    }

    case 'random': {
      // Randomly select one winner from the tied players
      const shuffled = [...tiedPlayers].sort(() => Math.random() - 0.5);
      const nonTied = sortedPlayers.filter(p => (p.scores[trackId] ?? 0) !== topScore);
      return { players: [shuffled[0], ...shuffled.slice(1), ...nonTied], tiebroken: true };
    }

    case 'sudden_death': {
      // Signal that the game should continue — no winner resolved
      return { players: sortedPlayers, tiebroken: false };
    }

    default:
      return { players: sortedPlayers, tiebroken: false };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Direction = 'higher-better' | 'lower-better';

function sortByTrack(players: PlayerScores[], trackId: string, direction: Direction): PlayerScores[] {
  return [...players].sort((a, b) => {
    const aScore = a.scores[trackId] ?? 0;
    const bScore = b.scores[trackId] ?? 0;
    return direction === 'higher-better' ? bScore - aScore : aScore - bScore;
  });
}

function buildRankings(
  sortedPlayers: PlayerScores[],
  trackId: string,
): VictoryResult['rankings'] {
  const rankings: VictoryResult['rankings'] = [];
  let currentRank = 1;

  for (let i = 0; i < sortedPlayers.length; i++) {
    const player = sortedPlayers[i];
    if (i > 0) {
      const prevScore = sortedPlayers[i - 1].scores[trackId] ?? 0;
      const currScore = player.scores[trackId] ?? 0;
      if (currScore !== prevScore) {
        currentRank = i + 1;
      }
    }
    rankings.push({
      playerId: player.playerId,
      rank: currentRank,
      scores: { ...player.scores },
    });
  }

  return rankings;
}

function buildResult(
  sortedPlayers: PlayerScores[],
  trackId: string,
  tiebreak: TiebreakRule | undefined,
  _allScores: Map<string, PlayerScores>,
  gameOver: boolean,
): VictoryResult {
  if (sortedPlayers.length === 0) {
    return { gameOver, winners: [], rankings: [], tiebroken: false };
  }

  const { players: finalSorted, tiebroken } = applyTiebreak(sortedPlayers, trackId, tiebreak, _allScores);

  const rankings = buildRankings(finalSorted, trackId);

  // Determine winners: all players at rank 1
  const topScore = finalSorted[0].scores[trackId] ?? 0;

  let winners: string[];
  if (tiebreak?.method === 'random' && tiebroken) {
    // Random tiebreak always produces exactly one winner
    winners = [finalSorted[0].playerId];
  } else if (tiebreak?.method === 'most_recent_gain' && tiebroken) {
    winners = [finalSorted[0].playerId];
  } else if (tiebreak?.method === 'secondary_track' && tiebroken) {
    // Find the new top after secondary sort
    const tieTrack = tiebreak.track!;
    const topSecondary = finalSorted[0].scores[tieTrack] ?? 0;
    winners = finalSorted
      .filter(p => (p.scores[trackId] ?? 0) === topScore && (p.scores[tieTrack] ?? 0) === topSecondary)
      .map(p => p.playerId);
  } else {
    // No tiebreak or tiebreak didn't resolve — all top-score players win
    winners = finalSorted.filter(p => (p.scores[trackId] ?? 0) === topScore).map(p => p.playerId);
  }

  return { gameOver, winners, rankings, tiebroken };
}

