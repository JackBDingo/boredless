// ============================================================
// TEXAS HOLD'EM — Deck management
// ============================================================

import type { Card } from '../types.js';
import { SUITS, RANKS } from '../constants.js';

/** Create a fresh 52-card deck */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Fisher-Yates shuffle (in-place) */
export function shuffleDeck(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Create and shuffle a fresh deck */
export function freshDeck(): Card[] {
  return shuffleDeck(createDeck());
}

/** Deal n cards from the top of the deck (mutates deck) */
export function deal(deck: Card[], n: number): Card[] {
  return deck.splice(0, n);
}
