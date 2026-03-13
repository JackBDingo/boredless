// ============================================================
// BLACKJACK — Game-specific constants
// ============================================================

export const BJ_MIN_PLAYERS = 2;
export const BJ_MAX_PLAYERS = 8;
export const BJ_STARTING_CHIPS = 1000;
export const BJ_DEFAULT_BET = 20;
export const BJ_MIN_BET = 20;
export const BJ_MAX_BET = 500;
export const BJ_NUM_DECKS = 6;

// Phase durations (seconds)
export const BJ_BETTING_TIME_SECONDS = 20;
export const BJ_DEALING_TIME_SECONDS = 3;
export const BJ_PLAYING_TIME_SECONDS = 30;
export const BJ_DEALER_TIME_SECONDS = 5;
export const BJ_RESULTS_TIME_SECONDS = 8;
export const BJ_SCORES_TIME_SECONDS = 6;

// Card suits and ranks
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];

// Suit display symbols
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
