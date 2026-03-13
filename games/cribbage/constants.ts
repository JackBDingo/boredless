// ============================================================
// CRIBBAGE — Game-specific constants
// ============================================================

export const CR_MIN_PLAYERS = 2;
export const CR_MAX_PLAYERS = 6;
export const CR_WIN_SCORE = 121;
export const CR_PEGGING_TARGET = 31;

// Cards dealt per player by player count
export const CR_HAND_SIZE: Record<number, number> = {
  2: 6,
  3: 5,
  4: 5,
  5: 5,
  6: 5,
};

// Cards each player discards to the crib
export const CR_DISCARD_COUNT: Record<number, number> = {
  2: 2,
  3: 1,
  4: 1,
  5: 1,
  6: 1,
};

// Phase durations in seconds
export const CR_DISCARD_TIME_SECONDS = 30;
export const CR_CUT_TIME_SECONDS = 4;
export const CR_PEGGING_TIME_SECONDS = 45;
export const CR_SCORING_TIME_SECONDS = 8;
export const CR_CRIB_TIME_SECONDS = 8;
export const CR_RESULTS_TIME_SECONDS = 6;
export const CR_SCORES_TIME_SECONDS = 6;
export const CR_DEALING_TIME_SECONDS = 3;

// Card suits and ranks
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;

export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];

// Numeric value of each rank for counting to 15/31 (face cards = 10)
export const RANK_VALUES: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 10, 'Q': 10, 'K': 10,
};

// Numeric value for runs (Ace = 1, face cards have distinct values)
export const RANK_ORDER: Record<string, number> = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13,
};

export const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

export const SUIT_COLORS: Record<string, string> = {
  hearts: '#ef4444',
  diamonds: '#ef4444',
  clubs: '#1e293b',
  spades: '#1e293b',
};
