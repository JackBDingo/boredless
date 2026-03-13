// ============================================================
// TEXAS HOLD'EM — Game-specific constants
// ============================================================

export const TH_MIN_PLAYERS = 2;
export const TH_MAX_PLAYERS = 8;
export const TH_STARTING_CHIPS = 1000;
export const TH_SMALL_BLIND = 10;
export const TH_BIG_BLIND = 20;
export const TH_ACTION_TIME_SECONDS = 30;
export const TH_SHOWDOWN_TIME_SECONDS = 8;
export const TH_SCORES_TIME_SECONDS = 6;
export const TH_INSTRUCTIONS_TIME_SECONDS = 10;

// Blind escalation: every N hands, blinds double
export const TH_BLIND_ESCALATION_HANDS = 10;

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
