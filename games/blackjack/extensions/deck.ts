/**
 * deck.ts — Blackjack deck management for V2 extensions.
 *
 * Migrated from games/blackjack/server/deck.ts.
 * Pure TypeScript — no runtime subsystem imports.
 *
 * Provides: Card type, createShoe, shuffleDeck, freshShoe, deal, handValue, isBlackjack
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];

export interface Card {
  suit: Suit;
  rank: Rank;
}

/** Player hand state for a round */
export interface PlayerHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  split: boolean;
  bust: boolean;
  stood: boolean;
  blackjack: boolean;
}

/** Result of a player's hand vs dealer */
export type HandResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust' | 'pending';

// ---------------------------------------------------------------------------
// Deck creation
// ---------------------------------------------------------------------------

/** Create a single 52-card deck */
function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Create a multi-deck shoe */
export function createShoe(numDecks: number): Card[] {
  const shoe: Card[] = [];
  for (let i = 0; i < numDecks; i++) {
    shoe.push(...createDeck());
  }
  return shoe;
}

/** Fisher-Yates shuffle (in-place, returns deck) */
export function shuffleDeck(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/** Create and shuffle a fresh shoe */
export function freshShoe(numDecks: number): Card[] {
  return shuffleDeck(createShoe(numDecks));
}

/** Deal n cards from the top of the shoe (mutates shoe) */
export function deal(shoe: Card[], n: number): Card[] {
  return shoe.splice(0, n);
}

// ---------------------------------------------------------------------------
// Hand evaluation
// ---------------------------------------------------------------------------

/**
 * Calculate the blackjack value of a hand.
 * Returns { score, soft } where soft=true if an Ace is counted as 11.
 */
export function handValue(cards: Card[]): { score: number; soft: boolean } {
  let score = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === 'A') {
      aces++;
      score += 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      score += 10;
    } else {
      score += Number(card.rank);
    }
  }

  let soft = aces > 0 && score <= 21;
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  if (aces === 0) soft = false;

  return { score, soft };
}

/** Check if a 2-card hand is a natural blackjack */
export function isBlackjack(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  const { score } = handValue(cards);
  return score === 21;
}

// ---------------------------------------------------------------------------
// Hand serialization helpers
// ---------------------------------------------------------------------------

/** Serialize a shoe to JSON string for state storage */
export function serializeShoe(shoe: Card[]): string {
  return JSON.stringify(shoe);
}

/** Deserialize shoe from JSON state string */
export function deserializeShoe(json: string | null | undefined): Card[] {
  if (!json) return freshShoe(6);
  try {
    return JSON.parse(json) as Card[];
  } catch {
    return freshShoe(6);
  }
}

/** Serialize player hands to JSON string */
export function serializeHands(hands: PlayerHand[]): string {
  return JSON.stringify(hands);
}

/** Deserialize player hands from JSON state string */
export function deserializeHands(json: string | null | undefined): PlayerHand[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as PlayerHand[];
  } catch {
    return [];
  }
}

/** Serialize dealer cards to JSON string */
export function serializeCards(cards: Card[]): string {
  return JSON.stringify(cards);
}

/** Deserialize dealer cards from JSON state string */
export function deserializeCards(json: string | null | undefined): Card[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Card[];
  } catch {
    return [];
  }
}
