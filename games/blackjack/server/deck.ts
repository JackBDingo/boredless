// ============================================================
// BLACKJACK — Deck management (6-deck shoe)
// ============================================================

import type { Card } from '../types.js';
import { SUITS, RANKS } from '../constants.js';

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

/** Fisher-Yates shuffle (in-place) */
export function shuffleDeck(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
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

/** Calculate the blackjack value of a hand.
 *  Returns { score, soft } where soft=true if an Ace is counted as 11. */
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
