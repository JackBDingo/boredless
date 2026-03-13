import { CAH_POINTS_AWESOME } from '../constants.js';

export interface CAHScoringResult {
  /** playerId → points earned this round (only winner gets points) */
  roundPoints: Map<string, number>;
}

/**
 * Calculate scores for a CAH round.
 * Simple: the player whose submission was selected by the Czar gets
 * CAH_POINTS_AWESOME (1000 = 1 Awesome Point).
 */
export function calculateCAHScores(winnerPlayerId: string): CAHScoringResult {
  const roundPoints = new Map<string, number>();
  roundPoints.set(winnerPlayerId, CAH_POINTS_AWESOME);
  return { roundPoints };
}
