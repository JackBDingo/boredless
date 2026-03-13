// ============================================================
// CRIBBAGE — Game-specific types
// ============================================================

import type { Suit, Rank } from './constants.js';

/** A single playing card */
export interface Card {
  suit: Suit;
  rank: Rank;
  id: string; // unique identifier e.g. "A-hearts"
}

/** A scoring combination found in a hand */
export interface ScoreItem {
  type: 'fifteen' | 'pair' | 'run' | 'flush' | 'nobs' | 'his_heels' | 'go' | 'thirty_one' | 'last_card';
  points: number;
  label: string;
  cards?: Card[];
}

/** Result of scoring a hand */
export interface HandScore {
  items: ScoreItem[];
  total: number;
  playerId: string;
  playerName: string;
}

/** A card played during pegging, with who played it */
export interface PlayedCard {
  card: Card;
  playerId: string;
  playerName: string;
}

/** Public state visible on TV display */
export interface CRPublicState {
  gameId: 'cribbage';
  round: number;
  dealerIndex: number;
  dealerName: string;
  starterCard: Card | null;
  playedCards: PlayedCard[];       // Cards played this pegging round (current 31-count series)
  allPlayedCards: PlayedCard[];    // All played cards across all series this hand
  pegCount: number;                // Current running count toward 31
  activePlayerId: string | null;   // Whose turn during pegging
  playerOrder: string[];           // Player IDs in play order
  playerNames: Record<string, string>;
  playerHandSizes: Record<string, number>; // How many cards each player has left to play
  discardsDone: Record<string, boolean>;   // Who has discarded
  lastPegPoints: { playerId: string; playerName: string; points: number; reason: string } | null;
  handScores: HandScore[];         // Shown during scoring phase
  cribScore: HandScore | null;     // Shown during crib phase
  scores: Record<string, number>;  // Running total scores
  winner: { playerId: string; playerName: string } | null;
  goPlayers: string[];             // Players who have said "go" this series
}

/** Private state sent to individual phones */
export interface CRPrivateState {
  gameId: 'cribbage';
  hand: Card[];          // Cards still in hand (not yet played)
  cribCards: Card[];     // Cards sent to crib (shown during scoring)
  selectedForDiscard: string[]; // Card IDs selected for discard
  isMyTurn: boolean;
  canPlay: boolean;      // Has playable cards (not all exceed 31)
  playableCardIds: string[]; // Cards that won't bust 31
  phase: string;
  handScore: HandScore | null; // Shown during scoring
}
