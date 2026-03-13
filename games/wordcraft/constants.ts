// ============================================================
// WORDCRAFT — Game-specific constants
// ============================================================

export const WC_MIN_PLAYERS = 2;
export const WC_MAX_PLAYERS = 4;
export const WC_BOARD_SIZE = 15;
export const WC_RACK_SIZE = 7;
export const WC_ALL_TILES_BONUS = 50;

// Phase durations (seconds)
export const WC_STARTING_TIME_SECONDS = 3;
export const WC_PLAYING_TIME_SECONDS = 90;
export const WC_WORD_REVEAL_TIME_SECONDS = 5;
export const WC_SCORES_TIME_SECONDS = 5;

// ============================================================
// Letter point values (standard Scrabble)
// ============================================================
export const LETTER_POINTS: Record<string, number> = {
  A: 1,  B: 3,  C: 3,  D: 2,  E: 1,
  F: 4,  G: 2,  H: 4,  I: 1,  J: 8,
  K: 5,  L: 1,  M: 3,  N: 1,  O: 1,
  P: 3,  Q: 10, R: 1,  S: 1,  T: 1,
  U: 1,  V: 4,  W: 4,  X: 8,  Y: 4,
  Z: 10, '': 0, // '' = blank tile
};

// ============================================================
// Standard Scrabble tile distribution (100 tiles total)
// ============================================================
export const TILE_DISTRIBUTION: Array<{ letter: string; count: number; points: number }> = [
  { letter: 'A', count: 9,  points: 1  },
  { letter: 'B', count: 2,  points: 3  },
  { letter: 'C', count: 2,  points: 3  },
  { letter: 'D', count: 4,  points: 2  },
  { letter: 'E', count: 12, points: 1  },
  { letter: 'F', count: 2,  points: 4  },
  { letter: 'G', count: 3,  points: 2  },
  { letter: 'H', count: 2,  points: 4  },
  { letter: 'I', count: 9,  points: 1  },
  { letter: 'J', count: 1,  points: 8  },
  { letter: 'K', count: 1,  points: 5  },
  { letter: 'L', count: 4,  points: 1  },
  { letter: 'M', count: 2,  points: 3  },
  { letter: 'N', count: 6,  points: 1  },
  { letter: 'O', count: 8,  points: 1  },
  { letter: 'P', count: 2,  points: 3  },
  { letter: 'Q', count: 1,  points: 10 },
  { letter: 'R', count: 6,  points: 1  },
  { letter: 'S', count: 4,  points: 1  },
  { letter: 'T', count: 6,  points: 1  },
  { letter: 'U', count: 4,  points: 1  },
  { letter: 'V', count: 2,  points: 4  },
  { letter: 'W', count: 2,  points: 4  },
  { letter: 'X', count: 1,  points: 8  },
  { letter: 'Y', count: 2,  points: 4  },
  { letter: 'Z', count: 1,  points: 10 },
  { letter: '',  count: 2,  points: 0  }, // blank tiles
];

// ============================================================
// Premium square types
// ============================================================
export type PremiumType = 'TW' | 'DW' | 'TL' | 'DL' | null;

/**
 * Premium square layout for the standard 15x15 Scrabble board.
 * Key format: "row,col" (0-indexed). Center is (7,7).
 *
 * TW = Triple Word Score
 * DW = Double Word Score
 * TL = Triple Letter Score
 * DL = Double Letter Score
 */
export const PREMIUM_SQUARES: Map<string, PremiumType> = new Map([
  // Triple Word (TW) — corners and mid-edges
  ['0,0',   'TW'], ['0,7',   'TW'], ['0,14',  'TW'],
  ['7,0',   'TW'], ['7,14',  'TW'],
  ['14,0',  'TW'], ['14,7',  'TW'], ['14,14', 'TW'],

  // Double Word (DW) — diagonals + center star
  ['1,1',   'DW'], ['2,2',   'DW'], ['3,3',   'DW'], ['4,4',   'DW'],
  ['1,13',  'DW'], ['2,12',  'DW'], ['3,11',  'DW'], ['4,10',  'DW'],
  ['13,1',  'DW'], ['12,2',  'DW'], ['11,3',  'DW'], ['10,4',  'DW'],
  ['13,13', 'DW'], ['12,12', 'DW'], ['11,11', 'DW'], ['10,10', 'DW'],
  ['7,7',   'DW'], // Center star — DW on first play

  // Triple Letter (TL)
  ['1,5',   'TL'], ['1,9',   'TL'],
  ['5,1',   'TL'], ['5,5',   'TL'], ['5,9',   'TL'], ['5,13',  'TL'],
  ['9,1',   'TL'], ['9,5',   'TL'], ['9,9',   'TL'], ['9,13',  'TL'],
  ['13,5',  'TL'], ['13,9',  'TL'],

  // Double Letter (DL)
  ['0,3',   'DL'], ['0,11',  'DL'],
  ['2,6',   'DL'], ['2,8',   'DL'],
  ['3,0',   'DL'], ['3,7',   'DL'], ['3,14',  'DL'],
  ['6,2',   'DL'], ['6,6',   'DL'], ['6,8',   'DL'], ['6,12',  'DL'],
  ['7,3',   'DL'], ['7,11',  'DL'],
  ['8,2',   'DL'], ['8,6',   'DL'], ['8,8',   'DL'], ['8,12',  'DL'],
  ['11,0',  'DL'], ['11,7',  'DL'], ['11,14', 'DL'],
  ['12,6',  'DL'], ['12,8',  'DL'],
  ['14,3',  'DL'], ['14,11', 'DL'],
]);

export function getPremium(row: number, col: number): PremiumType {
  return PREMIUM_SQUARES.get(`${row},${col}`) ?? null;
}
