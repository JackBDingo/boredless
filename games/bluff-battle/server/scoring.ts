import { BB_POINTS_CORRECT_ANSWER, BB_POINTS_FOOLED_PLAYER } from '../constants.js';

export interface BBVote {
  voterId: string;
  answerId: string;
}

export interface BBAnswer {
  answerId: string;
  text: string;
  submittedByPlayerId: string | null; // null = correct answer
  isCorrect: boolean;
}

export interface BBScoringResult {
  /** playerId → points earned this round */
  roundPoints: Map<string, number>;
  /** Per-answer reveal data */
  answerResults: {
    answerId: string;
    voterIds: string[];
    submittedByPlayerId: string | null;
    isCorrect: boolean;
  }[];
}

/**
 * Calculate scores for a Bluff Battle round.
 *
 * Scoring rules:
 * - Voting for the CORRECT answer: BB_POINTS_CORRECT_ANSWER (1000 pts)
 * - Each player fooled by YOUR fake answer: BB_POINTS_FOOLED_PLAYER (500 pts)
 * - Players cannot vote for their own fake answer (filtered at input time)
 */
export function calculateBBScores(
  answers: BBAnswer[],
  votes: BBVote[],
): BBScoringResult {
  const roundPoints = new Map<string, number>();
  const answerResults: BBScoringResult['answerResults'] = [];

  // Build vote map: answerId → voterIds
  const voteMap = new Map<string, string[]>();
  for (const vote of votes) {
    if (!voteMap.has(vote.answerId)) {
      voteMap.set(vote.answerId, []);
    }
    voteMap.get(vote.answerId)!.push(vote.voterId);
  }

  for (const answer of answers) {
    const voterIds = voteMap.get(answer.answerId) ?? [];

    answerResults.push({
      answerId: answer.answerId,
      voterIds,
      submittedByPlayerId: answer.submittedByPlayerId,
      isCorrect: answer.isCorrect,
    });

    if (answer.isCorrect) {
      // Award points to voters who found the correct answer
      for (const voterId of voterIds) {
        const current = roundPoints.get(voterId) ?? 0;
        roundPoints.set(voterId, current + BB_POINTS_CORRECT_ANSWER);
      }
    } else if (answer.submittedByPlayerId) {
      // Award points to the player who submitted this fake answer
      // for each voter they fooled
      const fooledCount = voterIds.length;
      if (fooledCount > 0) {
        const current = roundPoints.get(answer.submittedByPlayerId) ?? 0;
        roundPoints.set(
          answer.submittedByPlayerId,
          current + fooledCount * BB_POINTS_FOOLED_PLAYER,
        );
      }
    }
  }

  return { roundPoints, answerResults };
}
