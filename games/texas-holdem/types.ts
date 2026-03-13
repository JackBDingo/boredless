// ============================================================
// TEXAS HOLD'EM — Game-specific types
// ============================================================

import type { Suit, Rank } from './constants.js';

/** A single playing card */
export interface Card {
  suit: Suit;
  rank: Rank;
}

/** Player action types */
export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'all-in';

/** A player's action */
export interface PlayerAction {
  playerId: string;
  action: ActionType;
  amount: number; // 0 for fold/check
}

/** Hand ranking category */
export type HandRank =
  | 'royal-flush'
  | 'straight-flush'
  | 'four-of-a-kind'
  | 'full-house'
  | 'flush'
  | 'straight'
  | 'three-of-a-kind'
  | 'two-pair'
  | 'one-pair'
  | 'high-card';

/** Evaluated hand result */
export interface HandResult {
  rank: HandRank;
  rankValue: number;     // 0-9, higher is better
  tiebreakers: number[]; // For comparing hands of same rank
  bestCards: Card[];      // The 5-card hand used
  label: string;         // e.g. "Pair of Kings"
}

/** Per-player seat state */
export interface SeatState {
  playerId: string;
  playerName: string;
  chips: number;
  currentBet: number;      // Bet in current betting round
  totalBetThisHand: number; // Total invested this hand
  folded: boolean;
  allIn: boolean;
  hasActed: boolean;        // Has acted this betting round
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  connected: boolean;
}

/** Public state visible on TV display */
export interface THPublicState {
  gameId: 'texas_holdem';
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  seats: SeatState[];
  activePlayerId: string | null;
  dealerIndex: number;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  minRaise: number;
  lastAction: { playerId: string; playerName: string; action: ActionType; amount: number } | null;
  winners: WinnerInfo[] | null;
}

/** Side pot for all-in situations */
export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

/** Winner information for showdown */
export interface WinnerInfo {
  playerId: string;
  playerName: string;
  amount: number;
  handLabel: string;
  cards: Card[];
}

/** Private state sent to individual phones */
export interface THPrivateState {
  gameId: 'texas_holdem';
  holeCards: Card[];
  chips: number;
  currentBet: number;
  isActive: boolean;         // Is it my turn?
  folded: boolean;
  allIn: boolean;
  availableActions: AvailableAction[];
  handResult: HandResult | null; // Shown at showdown
}

/** An action the player can take */
export interface AvailableAction {
  action: ActionType;
  minAmount?: number;
  maxAmount?: number;
}
