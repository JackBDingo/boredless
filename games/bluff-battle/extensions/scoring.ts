/**
 * scoring.ts — Bluffalo extension: round scoring logic.
 *
 * Called via the bluffalo_score_round action on phase_enter for the
 * reveal phase. Calculates per-player scores based on:
 *   - Voting for the correct answer: POINTS_CORRECT (1000)
 *   - Each player fooled by your fake: POINTS_FOOLED (500 per voter)
 *
 * This is the same scoring logic as the V1 server/scoring.ts, extracted
 * into a pure function with no runtime dependencies.
 *
 * Part of the bluffalo-core extension package.
 */

import type { BluffaloAnswer } from './answer-builder.js';

/** Points awarded for voting for the correct answer. */
export const POINTS_CORRECT_ANSWER = 1000;

/** Points awarded per player fooled by your fake answer. */
export const POINTS_FOOLED_PLAYER = 500;

/** A single player vote: voterId chose answerId. */
export interface BluffaloVote {
  voterId: string;
  answerId: string;
}

/** Scoring result for one round. */
export interface BluffaloScoringResult {
  /** Map of playerId → points earned this round. */
  roundPoints: Map<string, number>;
  /** Per-answer reveal metadata. */
  answerResults: {
    answerId: string;
    voterIds: string[];
    submittedByPlayerId: string | null;
    isCorrect: boolean;
  }[];
}

/**
 * Calculate round scores from answers and votes.
 *
 * Scoring rules:
 * - Vote for the CORRECT answer → POINTS_CORRECT_ANSWER
 * - Each player who voted for YOUR fake → POINTS_FOOLED_PLAYER
 *
 * @param answers - The shuffled answer list (fakes + correct)
 * @param votes   - All votes cast this round
 * @returns Scoring result with per-player points and per-answer metadata
 */
export function scoreRound(
  answers: BluffaloAnswer[],
  votes: BluffaloVote[],
): BluffaloScoringResult {
  const roundPoints = new Map<string, number>();

  // Build vote map: answerId → voterIds
  const voteMap = new Map<string, string[]>();
  for (const vote of votes) {
    const existing = voteMap.get(vote.answerId) ?? [];
    existing.push(vote.voterId);
    voteMap.set(vote.answerId, existing);
  }

  const answerResults: BluffaloScoringResult['answerResults'] = [];

  for (const answer of answers) {
    const voterIds = voteMap.get(answer.answerId) ?? [];

    answerResults.push({
      answerId: answer.answerId,
      voterIds,
      submittedByPlayerId: answer.submittedByPlayerId,
      isCorrect: answer.isCorrect,
    });

    if (answer.isCorrect) {
      // Award POINTS_CORRECT to players who voted for the correct answer
      for (const voterId of voterIds) {
        const current = roundPoints.get(voterId) ?? 0;
        roundPoints.set(voterId, current + POINTS_CORRECT_ANSWER);
      }
    } else if (answer.submittedByPlayerId) {
      // Award POINTS_FOOLED to the submitter for each voter they fooled
      const fooledCount = voterIds.length;
      if (fooledCount > 0) {
        const current = roundPoints.get(answer.submittedByPlayerId) ?? 0;
        roundPoints.set(
          answer.submittedByPlayerId,
          current + fooledCount * POINTS_FOOLED_PLAYER,
        );
      }
    }
  }

  return { roundPoints, answerResults };
}
