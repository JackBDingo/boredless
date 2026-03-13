// ============================================================
// CRIBBAGE — Hand scoring logic
// 15s, pairs, runs, flush, nobs, his heels
// ============================================================

import type { Card, ScoreItem, HandScore } from '../types.js';
import { RANK_VALUES, RANK_ORDER } from '../constants.js';

/** Card numeric value for counting to 15 */
function val(card: Card): number {
  return RANK_VALUES[card.rank] ?? 0;
}

/** Card order value for detecting runs */
function ord(card: Card): number {
  return RANK_ORDER[card.rank] ?? 0;
}

/** All subsets of an array */
function subsets<T>(arr: T[]): T[][] {
  const result: T[][] = [];
  const n = arr.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    const subset: T[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) subset.push(arr[i]!);
    }
    result.push(subset);
  }
  return result;
}

/** Score 15s: any combination of cards summing to 15 = 2pts each */
function scoreFifteens(cards: Card[]): ScoreItem[] {
  const items: ScoreItem[] = [];
  for (const subset of subsets(cards)) {
    if (subset.length >= 2) {
      const total = subset.reduce((s, c) => s + val(c), 0);
      if (total === 15) {
        items.push({
          type: 'fifteen',
          points: 2,
          label: `Fifteen (${subset.map(c => c.rank).join('+')})`,
          cards: subset,
        });
      }
    }
  }
  return items;
}

/** Score pairs: any two cards of same rank = 2pts */
function scorePairs(cards: Card[]): ScoreItem[] {
  const items: ScoreItem[] = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i]!.rank === cards[j]!.rank) {
        items.push({
          type: 'pair',
          points: 2,
          label: `Pair of ${cards[i]!.rank}s`,
          cards: [cards[i]!, cards[j]!],
        });
      }
    }
  }
  return items;
}

/** Score runs: 3+ consecutive ranks = 1pt/card */
function scoreRuns(cards: Card[]): ScoreItem[] {
  const items: ScoreItem[] = [];
  const n = cards.length;

  // Find longest runs in all subsets of size 3+
  // We find maximal runs (not covered by longer ones)
  const runSets: Card[][] = [];

  for (let size = n; size >= 3; size--) {
    for (const subset of subsets(cards).filter(s => s.length === size)) {
      const sorted = [...subset].sort((a, b) => ord(a) - ord(b));
      const orders = sorted.map(c => ord(c));
      // Check consecutive and no duplicates
      const unique = [...new Set(orders)];
      if (unique.length !== sorted.length) continue;
      let consecutive = true;
      for (let i = 1; i < sorted.length; i++) {
        if (orders[i]! - orders[i - 1]! !== 1) { consecutive = false; break; }
      }
      if (!consecutive) continue;

      // Check this subset isn't already covered by a longer run
      const coveredByLonger = runSets.some(existing =>
        sorted.every(c => existing.some(e => e.id === c.id))
      );
      if (!coveredByLonger) {
        runSets.push(sorted);
      }
    }
    // Once we found runs of this size, don't look for shorter ones that are subsets
    if (runSets.length > 0) break;
  }

  for (const run of runSets) {
    items.push({
      type: 'run',
      points: run.length,
      label: `Run of ${run.length} (${run.map(c => c.rank).join('-')})`,
      cards: run,
    });
  }

  return items;
}

/**
 * Score flush:
 * - In hand (4 cards + starter): 4 cards in hand all same suit = 4pts
 *   If starter also matches = 5pts
 * - In crib: ALL 5 cards must be same suit = 5pts only
 */
function scoreFlush(handCards: Card[], starterCard: Card, isCrib: boolean): ScoreItem[] {
  const items: ScoreItem[] = [];
  const handSuit = handCards[0]?.suit;
  if (!handSuit) return items;

  const allHandSameSuit = handCards.every(c => c.suit === handSuit);

  if (isCrib) {
    // Crib flush: all 5 must match
    if (allHandSameSuit && starterCard.suit === handSuit) {
      items.push({
        type: 'flush',
        points: 5,
        label: 'Five-card flush (crib)',
        cards: [...handCards, starterCard],
      });
    }
  } else {
    if (allHandSameSuit) {
      if (starterCard.suit === handSuit) {
        items.push({
          type: 'flush',
          points: 5,
          label: 'Five-card flush',
          cards: [...handCards, starterCard],
        });
      } else {
        items.push({
          type: 'flush',
          points: 4,
          label: 'Four-card flush',
          cards: handCards,
        });
      }
    }
  }
  return items;
}

/**
 * Nobs: Jack in hand matching the suit of the starter card = 1pt
 */
function scoreNobs(handCards: Card[], starterCard: Card): ScoreItem[] {
  const jack = handCards.find(c => c.rank === 'J' && c.suit === starterCard.suit);
  if (jack) {
    return [{
      type: 'nobs',
      points: 1,
      label: 'Nobs (Jack of starter suit)',
      cards: [jack],
    }];
  }
  return [];
}

/**
 * Score a complete cribbage hand (4 cards + starter).
 * isCrib = true: flush rules differ.
 */
export function scoreHand(
  handCards: Card[],
  starterCard: Card,
  playerId: string,
  playerName: string,
  isCrib = false,
): HandScore {
  const allCards = [...handCards, starterCard];
  const items: ScoreItem[] = [
    ...scoreFifteens(allCards),
    ...scorePairs(allCards),
    ...scoreRuns(allCards),
    ...scoreFlush(handCards, starterCard, isCrib),
    ...scoreNobs(handCards, starterCard),
  ];

  const total = items.reduce((s, i) => s + i.points, 0);
  return { items, total, playerId, playerName };
}

/**
 * Score pegging combinations when a card is played.
 * Returns scored items based on current play sequence.
 * playedSequence: the sequence of cards in the CURRENT series (toward 31).
 */
export function scorePegging(
  playedSequence: Card[],
  currentCount: number,
): ScoreItem[] {
  const items: ScoreItem[] = [];
  const n = playedSequence.length;
  if (n === 0) return items;

  // 15 or 31
  if (currentCount === 15) {
    items.push({ type: 'fifteen', points: 2, label: 'Fifteen for two!' });
  }
  if (currentCount === 31) {
    items.push({ type: 'thirty_one', points: 2, label: 'Thirty-one for two!' });
  }

  // Pairs: look back from the most recently played card
  const lastRank = playedSequence[n - 1]!.rank;
  let pairCount = 0;
  for (let i = n - 2; i >= 0; i--) {
    if (playedSequence[i]!.rank === lastRank) pairCount++;
    else break;
  }
  if (pairCount === 1) {
    items.push({ type: 'pair', points: 2, label: 'Pair for two!' });
  } else if (pairCount === 2) {
    items.push({ type: 'pair', points: 6, label: 'Pair royale for six!' });
  } else if (pairCount === 3) {
    items.push({ type: 'pair', points: 12, label: 'Double pair royale for twelve!' });
  }

  // Runs: look for consecutive sequences in the most recent cards
  if (n >= 3) {
    // Try longest possible run ending with most recent card
    for (let len = Math.min(n, 7); len >= 3; len--) {
      const slice = playedSequence.slice(n - len);
      const orders = slice.map(c => ord(c)).sort((a, b) => a - b);
      const uniqueOrders = [...new Set(orders)];
      if (uniqueOrders.length !== len) continue; // duplicates = no run
      let isRun = true;
      for (let i = 1; i < uniqueOrders.length; i++) {
        if (uniqueOrders[i]! - uniqueOrders[i - 1]! !== 1) { isRun = false; break; }
      }
      if (isRun) {
        items.push({
          type: 'run',
          points: len,
          label: `Run of ${len} for ${len}!`,
        });
        break; // Only score the longest run
      }
    }
  }

  return items;
}

export { scoreFlush };
