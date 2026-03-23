/**
 * deck.ts — Texas Hold'em deck operations for V2 extensions.
 *
 * Pure functions for creating, shuffling, and dealing cards.
 * No runtime imports — only game data types.
 */

// ---------------------------------------------------------------------------
// Card types (duplicated from V1 types to keep extensions self-contained)
// ---------------------------------------------------------------------------

export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];

export interface Card {
  suit: Suit;
  rank: Rank;
}

// ---------------------------------------------------------------------------
// Deck operations
// ---------------------------------------------------------------------------

/** Create a fresh 52-card deck (unshuffled). */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle (in-place). */
export function shuffleDeck(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/** Create and shuffle a fresh 52-card deck. */
export function freshDeck(): Card[] {
  return shuffleDeck(createDeck());
}

/** Deal n cards from the top of the deck (mutates deck array). */
export function deal(deck: Card[], n: number): Card[] {
  return deck.splice(0, n);
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/** Serialize a Card array to JSON string for state storage. */
export function serializeCards(cards: Card[]): string {
  return JSON.stringify(cards);
}

/** Deserialize a JSON string back to Card array. */
export function deserializeCards(json: string | null | undefined): Card[] {
  if (!json) return [];
  try {
    return JSON.parse(json) as Card[];
  } catch {
    return [];
  }
}
