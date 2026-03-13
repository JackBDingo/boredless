import type { PlacedShip } from '../types.js';
import { BS_POINTS_HIT, BS_POINTS_SHIP_SUNK, BS_POINTS_VICTORY_BONUS } from '../constants.js';

export interface ScoringInput {
  ships: PlacedShip[];       // Opponent's ships (to count sunk)
  shotsHit: number;          // How many hits this player landed
  isWinner: boolean;
}

export function calculateScore(input: ScoringInput): number {
  const sunkCount = input.ships.filter(s => s.sunk).length;
  let points = sunkCount * BS_POINTS_SHIP_SUNK;
  points += input.shotsHit * BS_POINTS_HIT;
  if (input.isWinner) points += BS_POINTS_VICTORY_BONUS;
  return points;
}
