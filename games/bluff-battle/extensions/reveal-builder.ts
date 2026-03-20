/**
 * reveal-builder.ts — Bluffalo extension: build reveal data.
 *
 * Called via the bluffalo_build_reveal action on phase_enter for the
 * reveal phase (after bluffalo_score_round). Assembles the reveal data
 * structure that shows players who voted for what, who was fooled, and
 * round scores.
 *
 * The reveal data is serialized as JSON and stored in globals.reveal_json
 * for the display and phone clients to render.
 *
 * Part of the bluffalo-core extension package.
 */

import type { BluffaloAnswer } from './answer-builder.js';
import type { BluffaloScoringResult } from './scoring.js';

/** A revealed answer with full metadata (shown after voting). */
export interface BluffaloRevealAnswer {
  answerId: string;
  text: string;
  isCorrect: boolean;
  submittedByPlayerId: string | null;
  submittedByPlayerName: string | null;
  voterPlayerIds: string[];
  voterPlayerNames: string[];
}

/** Per-player round score summary for the reveal screen. */
export interface BluffaloRoundScore {
  playerId: string;
  playerName: string;
  fooledCount: number;
  foundCorrect: boolean;
  roundPoints: number;
  totalPoints: number;
}

/** The full reveal data structure stored in globals.reveal_json. */
export interface BluffaloRevealData {
  correctAnswerId: string;
  answers: BluffaloRevealAnswer[];
  roundScores: BluffaloRoundScore[];
}

/** Player info for building names. */
export interface PlayerInfo {
  id: string;
  name: string;
}

/** Context for building reveal data. */
export interface BuildRevealContext {
  answers: BluffaloAnswer[];
  scoringResult: BluffaloScoringResult;
  players: PlayerInfo[];
  /** Function to get a player's current total score. */
  getTotalScore: (playerId: string) => number;
}

/**
 * Build the reveal data structure from answers and scoring result.
 *
 * @param ctx - Context with answers, scoring, and player info
 * @returns BluffaloRevealData to be serialized into globals.reveal_json
 */
export function buildReveal(ctx: BuildRevealContext): BluffaloRevealData {
  const { answers, scoringResult, players, getTotalScore } = ctx;

  const correctAnswer = answers.find(a => a.isCorrect);
  if (!correctAnswer) {
    throw new Error('[bluffalo reveal-builder] No correct answer found in answers list');
  }

  const playerMap = new Map(players.map(p => [p.id, p]));

  const revealAnswers: BluffaloRevealAnswer[] = answers.map(answer => {
    const answerResult = scoringResult.answerResults.find(r => r.answerId === answer.answerId);
    const voterIds = answerResult?.voterIds ?? [];

    const submitterPlayer = answer.submittedByPlayerId
      ? playerMap.get(answer.submittedByPlayerId)
      : null;

    return {
      answerId: answer.answerId,
      text: answer.text,
      isCorrect: answer.isCorrect,
      submittedByPlayerId: answer.submittedByPlayerId,
      submittedByPlayerName: submitterPlayer?.name ?? null,
      voterPlayerIds: voterIds,
      voterPlayerNames: voterIds.map(id => playerMap.get(id)?.name ?? 'Unknown'),
    };
  });

  const roundScores: BluffaloRoundScore[] = players.map(player => {
    const roundPoints = scoringResult.roundPoints.get(player.id) ?? 0;

    // Count how many players voted for this player's fake
    const fooledCount = scoringResult.answerResults
      .filter(r => r.submittedByPlayerId === player.id)
      .reduce((sum, r) => sum + r.voterIds.length, 0);

    // Did this player find the correct answer?
    const correctAnswerResult = scoringResult.answerResults.find(r => r.isCorrect);
    const foundCorrect = correctAnswerResult?.voterIds.includes(player.id) ?? false;

    return {
      playerId: player.id,
      playerName: player.name,
      fooledCount,
      foundCorrect,
      roundPoints,
      totalPoints: getTotalScore(player.id),
    };
  });

  return {
    correctAnswerId: correctAnswer.answerId,
    answers: revealAnswers,
    roundScores,
  };
}
