// ============================================================
// TEXAS HOLD'EM — Hand Evaluator
// Evaluates 5-card hands from 7 available cards (2 hole + 5 community)
// ============================================================

import type { Card } from '../types.js';
import type { HandResult, HandRank } from '../types.js';
import { RANKS } from '../constants.js';

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

const HAND_LABELS: Record<HandRank, string> = {
  'high-card': 'High Card',
  'one-pair': 'Pair',
  'two-pair': 'Two Pair',
  'three-of-a-kind': 'Three of a Kind',
  'straight': 'Straight',
  'flush': 'Flush',
  'full-house': 'Full House',
  'four-of-a-kind': 'Four of a Kind',
  'straight-flush': 'Straight Flush',
  'royal-flush': 'Royal Flush',
};

function rankVal(card: Card): number {
  return RANK_VALUES[card.rank];
}

function rankName(val: number): string {
  const names: Record<number, string> = {
    14: 'Aces', 13: 'Kings', 12: 'Queens', 11: 'Jacks', 10: 'Tens',
    9: 'Nines', 8: 'Eights', 7: 'Sevens', 6: 'Sixes', 5: 'Fives',
    4: 'Fours', 3: 'Threes', 2: 'Twos',
  };
  return names[val] ?? String(val);
}

/** Generate all 5-card combinations from an array of cards */
function combinations5(cards: Card[]): Card[][] {
  const result: Card[][] = [];
  const n = cards.length;
  for (let i = 0; i < n - 4; i++)
    for (let j = i + 1; j < n - 3; j++)
      for (let k = j + 1; k < n - 2; k++)
        for (let l = k + 1; l < n - 1; l++)
          for (let m = l + 1; m < n; m++)
            result.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
  return result;
}

/** Evaluate a 5-card hand */
function evaluate5(cards: Card[]): HandResult {
  const sorted = [...cards].sort((a, b) => rankVal(b) - rankVal(a));
  const values = sorted.map(rankVal);

  // Check flush
  const isFlush = sorted.every(c => c.suit === sorted[0].suit);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;
  // Normal straight
  if (values[0] - values[4] === 4 && new Set(values).size === 5) {
    isStraight = true;
    straightHigh = values[0];
  }
  // Ace-low straight (A-2-3-4-5)
  if (!isStraight && values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
    isStraight = true;
    straightHigh = 5; // 5-high straight
  }

  // Count ranks
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
  } else if (groups[0][1] === 4) {
    rank = 'four-of-a-kind';
    tiebreakers = [groups[0][0], groups[1][0]];
    label = `Four ${rankName(groups[0][0])}`;
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    rank = 'full-house';
    tiebreakers = [groups[0][0], groups[1][0]];
    label = `Full House, ${rankName(groups[0][0])} full of ${rankName(groups[1][0])}`;
  } else if (isFlush) {
    rank = 'flush';
    tiebreakers = values;
    label = `Flush, ${rankName(values[0])}-high`;
  } else if (isStraight) {
    rank = 'straight';
    tiebreakers = [straightHigh];
    label = `Straight, ${straightHigh}-high`;
  } else if (groups[0][1] === 3) {
    rank = 'three-of-a-kind';
    const kickers = groups.filter(g => g[1] === 1).map(g => g[0]).sort((a, b) => b - a);
    tiebreakers = [groups[0][0], ...kickers];
    label = `Three ${rankName(groups[0][0])}`;
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    rank = 'two-pair';
    const pairs = groups.filter(g => g[1] === 2).map(g => g[0]).sort((a, b) => b - a);
    const kicker = groups.find(g => g[1] === 1)![0];
    tiebreakers = [...pairs, kicker];
    label = `Two Pair, ${rankName(pairs[0])} and ${rankName(pairs[1])}`;
  } else if (groups[0][1] === 2) {
    rank = 'one-pair';
    const kickers = groups.filter(g => g[1] === 1).map(g => g[0]).sort((a, b) => b - a);
    tiebreakers = [groups[0][0], ...kickers];
    label = `Pair of ${rankName(groups[0][0])}`;
  } else {
    rank = 'high-card';
    tiebreakers = values;
    label = `${rankName(values[0])}-high`;
  }

  return {
    rank,
    rankValue: HAND_RANK_VALUES[rank],
    tiebreakers,
    bestCards: sorted,
    label,
  };
}

/** Compare two hand results. Returns negative if a < b, 0 if equal, positive if a > b */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
  for (let i = 0; i < Math.min(a.tiebreakers.length, b.tiebreakers.length); i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) return a.tiebreakers[i] - b.tiebreakers[i];
  }
  return 0;
}

/** Evaluate best 5-card hand from 7 cards (2 hole + 5 community) */
export function evaluateBestHand(holeCards: Card[], communityCards: Card[]): HandResult {
  const allCards = [...holeCards, ...communityCards];
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

/** Label a hand rank for display */
export function handRankLabel(rank: HandRank): string {
  return HAND_LABELS[rank];
}
