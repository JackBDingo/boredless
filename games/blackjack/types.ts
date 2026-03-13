// ============================================================
// BLACKJACK — Game-specific types
// ============================================================

import type { Suit, Rank } from './constants.js';

/** A single playing card */
export interface Card {
  suit: Suit;
  rank: Rank;
}

/** Player hand state for a round */
export interface PlayerHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  split: boolean;        // Is this a split hand?
  bust: boolean;
  stood: boolean;
  blackjack: boolean;
}

/** Result of a player's hand vs dealer */
export type HandResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'pending';

/** Per-player seat state visible to all */
export interface SeatState {
  playerId: string;
  playerName: string;
  chips: number;
  bet: number;
  hands: PlayerHand[];      // Support split (2 hands max)
  activeHandIndex: number;
  stood: boolean;           // All hands stood or busted
  result: HandResult | null;
  resultAmount: number;     // Net chips won/lost this round
  betPlaced: boolean;
  connected: boolean;
}

/** Public state visible on TV display */
export interface BJPublicState {
  gameId: 'blackjack';
  seats: SeatState[];
  dealerCards: Card[];
  dealerScore: number;
  dealerHoleHidden: boolean; // Hide hole card during playing phase
  roundNumber: number;
  lastAction: { playerId: string; playerName: string; action: string } | null;
}

/** Private state sent to individual phones */
export interface BJPrivateState {
  gameId: 'blackjack';
  chips: number;
  bet: number;
  hands: PlayerHand[];
  activeHandIndex: number;
  stood: boolean;
  result: HandResult | null;
  resultAmount: number;
  canDouble: boolean;
  canSplit: boolean;
  betPlaced: boolean;
}
