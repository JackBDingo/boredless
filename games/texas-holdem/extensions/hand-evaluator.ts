/**
 * hand-evaluator.ts — Texas Hold'em hand evaluation for V2 extensions.
 *
 * Pure functions for evaluating poker hands (Royal Flush down to High Card).
 * Evaluates the best 5-card hand from up to 7 available cards.
 *
 * No runtime imports — only extension-local types.
 */

import type { Card } from './deck.js';
import { RANKS } from './deck.js';

// ---------------------------------------------------------------------------
// Hand rank types
// ---------------------------------------------------------------------------

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

export interface HandResult {
  rank: HandRank;
  rankValue: number;      // 0–9, higher is better
  tiebreakers: number[];  // For comparing hands of same rank
  bestCards: Card[];      // The 5-card hand used
  label: string;          // e.g. "Pair of Kings"
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const RANK_VALUES: Record<string, number> = {};
RANKS.forEach((r, i) => { RANK_VALUES[r] = i + 2; }); // 2=2, 3=3, ..., A=14

const HAND_RANK_VALUES: Record<HandRank, number> = {
  'high-card': 0,
  'one-pair': 1,
  'two-pair': 2,
  'three-of-a-kind': 3,
  'straight': 4,
  'flush': 5,
  'full-house': 6,
  'four-of-a-kind': 7,
  'straight-flush': 8,
  'royal-flush': 9,
};

const RANK_NAMES: Record<number, string> = {
  14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 10: 'Tens',
  9: 'Nines', 8: 'Eights', 7: 'Sevens', 6: 'Sixes', 5: 'Fives',
  4: 'Fours', 3: 'Threes', 2: 'Twos',
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rankVal(card: Card): number {
  return RANK_VALUES[card.rank] ?? 0;
}

function rankName(val: number): string {
  return RANK_NAMES[val] ?? String(val);
}

/** Generate all C(n,5) combinations from an array of cards. */
function combinations5(cards: Card[]): Card[][] {
  const result: Card[][] = [];
  const n = cards.length;
  for (let i = 0; i < n - 4; i++)
    for (let j = i + 1; j < n - 3; j++)
      for (let k = j + 1; k < n - 2; k++)
        for (let l = k + 1; l < n - 1; l++)
          for (let m = l + 1; m < n; m++)
            result.push([cards[i]!, cards[j]!, cards[k]!, cards[l]!, cards[m]!]);
  return result;
}

/** Evaluate a single 5-card hand. */
function evaluate5(cards: Card[]): HandResult {
  const sorted = [...cards].sort((a, b) => rankVal(b) - rankVal(a));
  const values = sorted.map(rankVal);

  // Flush check
  const isFlush = sorted.every(c => c.suit === sorted[0]!.suit);

  // Straight check
  let isStraight = false;
  let straightHigh = 0;
  if (values[0]! - values[4]! === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0]!;
  }
  // Ace-low straight (A-2-3-4-5)
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5;
  }

  // Group ranks by count
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let rank: HandRank;
  let tiebreakers: number[];
  let label: string;

  if (isFlush && isStraight && straightHigh === 14) {
    rank = 'royal-flush';
    tiebreakers = [14];
    label = 'Royal Flush';
  } else if (isFlush && isStraight) {
    rank = 'straight-flush';
    tiebreakers = [straightHigh];
    label = `Straight Flush, ${straightHigh}-high`;
  } else if (groups[0]![1] === 4) {
    rank = 'four-of-a-kind';
    tiebreakers = [groups[0]![0], groups[1]![0]];
    label = `Four ${rankName(groups[0]![0])}`;
  } else if (groups[0]![1] === 3 && (groups[1]?.[1] ?? 0) === 2) {
    rank = 'full-house';
    tiebreakers = [groups[0]![0], groups[1]![0]];
    label = `Full House, ${rankName(groups[0]![0])} full of ${rankName(groups[1]![0])}`;
  } else if (isFlush) {
    rank = 'flush';
    tiebreakers = values;
    label = `Flush, ${rankName(values[0]!)}-high`;
  } else if (isStraight) {
    rank = 'straight';
    tiebreakers = [straightHigh];
    label = `Straight, ${straightHigh}-high`;
  } else if (groups[0]![1] === 3) {
    rank = 'three-of-a-kind';
    const kickers = groups.filter(g => g[1] === 1).map(g => g[0]).sort((a, b) => b - a);
    tiebreakers = [groups[0]![0], ...kickers];
    label = `Three ${rankName(groups[0]![0])}`;
  } else if (groups[0]![1] === 2 && (groups[1]?.[1] ?? 0) === 2) {
    rank = 'two-pair';
    const pairs = groups.filter(g => g[1] === 2).map(g => g[0]).sort((a, b) => b - a);
    const kicker = groups.find(g => g[1] === 1)![0];
    tiebreakers = [...pairs, kicker];
    label = `Two Pair, ${rankName(pairs[0]!)} and ${rankName(pairs[1]!)}`;
  } else if (groups[0]![1] === 2) {
    rank = 'one-pair';
    const kickers = groups.filter(g => g[1] === 1).map(g => g[0]).sort((a, b) => b - a);
    tiebreakers = [groups[0]![0], ...kickers];
    label = `Pair of ${rankName(groups[0]![0])}`;
  } else {
    rank = 'high-card';
    tiebreakers = values;
    label = `${rankName(values[0]!)}-high`;
  }

  return {
    rank,
    rankValue: HAND_RANK_VALUES[rank],
    tiebreakers,
    bestCards: sorted,
    label,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate the best 5-card hand from up to 7 cards (2 hole + up to 5 community).
 * Returns the best HandResult from all C(n,5) combinations.
 */
export function evaluateBestHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    // Not enough cards for a full evaluation — return a placeholder
    return {
      rank: 'high-card',
      rankValue: 0,
      tiebreakers: [],
      bestCards: allCards,
      label: 'High Card (incomplete)',
    };
  }
  const combos = combinations5(allCards);
  let best: HandResult | null = null;
  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
    }
  }
  return best!;
}

/**
 * Compare two hand results.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
  for (let i = 0; i < Math.min(a.tiebreakers.length, b.tiebreakers.length); i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) return (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0);
  }
  return 0;
}

/** Serialize HandResult to JSON string for state storage. */
export function serializeHandResult(result: HandResult): string {
  return JSON.stringify(result);
}

/** Deserialize HandResult from JSON string. */
export function deserializeHandResult(json: string | null | undefined): HandResult | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as HandResult;
  } catch {
    return null;
  }
}
