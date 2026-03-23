/**
 * board.ts — WordCraft board and tile operations.
 *
 * Pure functions for:
 * - Creating the 15×15 board with premium squares
 * - Creating and shuffling the tile bag
 * - Drawing tiles from the bag
 * - Validating tile placements (geometry + connectivity + first-word rules)
 * - Scoring words with premium multipliers
 * - Applying placements (mutating board state)
 * - Game-over detection
 *
 * All functions are pure TypeScript — no runtime subsystem imports.
 */

import type { Tile, BoardCell, PlacedTile } from '../types.js';
import {
  WC_BOARD_SIZE,
  WC_RACK_SIZE,
  WC_ALL_TILES_BONUS,
  TILE_DISTRIBUTION,
  getPremium,
} from '../constants.js';

// ---------------------------------------------------------------------------
// Tile bag
// ---------------------------------------------------------------------------

let _tileCounter = 0;

/** Reset the tile ID counter (call before createTileBag each game). */
export function resetTileCounter(): void {
  _tileCounter = 0;
}

/** Create a full shuffled tile bag. */
export function createTileBag(): Tile[] {
  _tileCounter = 0;
  const bag: Tile[] = [];
  for (const entry of TILE_DISTRIBUTION) {
    for (let i = 0; i < entry.count; i++) {
      bag.push({
        id: `tile-${_tileCounter++}`,
        letter: entry.letter,
        points: entry.points,
        isBlank: entry.letter === '',
      });
    }
  }
  return shuffleBag(bag);
}

/** Fisher-Yates shuffle (returns new array, does not mutate input). */
export function shuffleBag(bag: Tile[]): Tile[] {
  const arr = [...bag];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Draw up to `count` tiles from the front of the bag.
 * Mutates `bag` in-place (removes drawn tiles).
 */
export function drawTiles(bag: Tile[], count: number): Tile[] {
  return bag.splice(0, Math.min(count, bag.length));
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/** Create a fresh 15×15 board. */
export function createBoard(): BoardCell[][] {
  const board: BoardCell[][] = [];
  for (let r = 0; r < WC_BOARD_SIZE; r++) {
    const row: BoardCell[] = [];
    for (let c = 0; c < WC_BOARD_SIZE; c++) {
      row.push({
        tile: null,
        premium: getPremium(r, c),
        premiumUsed: false,
      });
    }
    board.push(row);
  }
  return board;
}

/** True if no tiles have been placed on the board yet. */
export function boardIsEmpty(board: BoardCell[][]): boolean {
  for (let r = 0; r < WC_BOARD_SIZE; r++) {
    for (let c = 0; c < WC_BOARD_SIZE; c++) {
      if (board[r]![c]!.tile !== null) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface WordCell {
  row: number;
  col: number;
  letter: string;
  points: number;
  isNewTile: boolean;
}

export interface PlacementValidation {
  valid: boolean;
  reason?: string;
  mainWord?: WordCell[];
  crossWords?: WordCell[][];
}

function tilesOwnedByPlayer(rack: Tile[], placed: PlacedTile[]): boolean {
  const rackCopy = [...rack];
  for (const pt of placed) {
    const idx = rackCopy.findIndex(t => t.id === pt.tileId);
    if (idx === -1) return false;
    rackCopy.splice(idx, 1);
  }
  return true;
}

function getCellForWord(
  board: BoardCell[][],
  rack: Tile[],
  placed: PlacedTile[],
  r: number,
  c: number,
): WordCell | null {
  const newTile = placed.find(p => p.row === r && p.col === c);
  if (newTile) {
    const tileInRack = rack.find(t => t.id === newTile.tileId)!;
    return { row: r, col: c, letter: newTile.letter, points: tileInRack.points, isNewTile: true };
  }
  const existing = board[r]![c]!;
  if (existing.tile !== null) {
    return { row: r, col: c, letter: existing.tile.letter, points: existing.tile.points, isNewTile: false };
  }
  return null;
}

/** Full placement validation: geometry, ownership, connectivity, word formation. */
export function validatePlacement(
  board: BoardCell[][],
  placed: PlacedTile[],
  rack: Tile[],
): PlacementValidation {
  if (placed.length === 0) {
    return { valid: false, reason: 'No tiles placed' };
  }

  if (!tilesOwnedByPlayer(rack, placed)) {
    return { valid: false, reason: 'Placed tiles not in your rack' };
  }

  for (const pt of placed) {
    if (pt.row < 0 || pt.row >= WC_BOARD_SIZE || pt.col < 0 || pt.col >= WC_BOARD_SIZE) {
      return { valid: false, reason: 'Tile placed out of bounds' };
    }
    if (board[pt.row]![pt.col]!.tile !== null) {
      return { valid: false, reason: `Cell (${pt.row},${pt.col}) is already occupied` };
    }
  }

  const posSet = new Set(placed.map(p => `${p.row},${p.col}`));
  if (posSet.size !== placed.length) {
    return { valid: false, reason: 'Duplicate tile positions' };
  }

  const rows = [...new Set(placed.map(p => p.row))];
  const cols = [...new Set(placed.map(p => p.col))];
  const isHorizontal = rows.length === 1;
  const isVertical = cols.length === 1;

  if (!isHorizontal && !isVertical) {
    return { valid: false, reason: 'Tiles must be placed in a straight line' };
  }

  const mainWord: WordCell[] = [];

  if (isHorizontal) {
    const row = rows[0]!;
    let minCol = Math.min(...placed.map(p => p.col));
    let maxCol = Math.max(...placed.map(p => p.col));
    while (minCol > 0 && board[row]![minCol - 1]!.tile !== null) minCol--;
    while (maxCol < WC_BOARD_SIZE - 1 && board[row]![maxCol + 1]!.tile !== null) maxCol++;

    for (let c = minCol; c <= maxCol; c++) {
      const cell = getCellForWord(board, rack, placed, row, c);
      if (cell) {
        mainWord.push(cell);
      } else {
        return { valid: false, reason: `Gap at (${row},${c}) not filled by existing tile` };
      }
    }
  } else {
    const col = cols[0]!;
    let minRow = Math.min(...placed.map(p => p.row));
    let maxRow = Math.max(...placed.map(p => p.row));
    while (minRow > 0 && board[minRow - 1]![col]!.tile !== null) minRow--;
    while (maxRow < WC_BOARD_SIZE - 1 && board[maxRow + 1]![col]!.tile !== null) maxRow++;

    for (let r = minRow; r <= maxRow; r++) {
      const cell = getCellForWord(board, rack, placed, r, col);
      if (cell) {
        mainWord.push(cell);
      } else {
        return { valid: false, reason: `Gap at (${r},${col}) not filled by existing tile` };
      }
    }
  }

  if (mainWord.length < 2) {
    return { valid: false, reason: 'Word must be at least 2 letters' };
  }

  // Collect cross-words
  const crossWords: WordCell[][] = [];
  for (const pt of placed) {
    const crossWord: WordCell[] = [];

    if (isHorizontal) {
      let minRow = pt.row;
      let maxRow = pt.row;
      while (minRow > 0 && board[minRow - 1]![pt.col]!.tile !== null) minRow--;
      while (maxRow < WC_BOARD_SIZE - 1 && board[maxRow + 1]![pt.col]!.tile !== null) maxRow++;

      if (minRow < maxRow) {
        for (let r = minRow; r <= maxRow; r++) {
          const cell = getCellForWord(board, rack, placed, r, pt.col);
          if (cell) crossWord.push(cell);
        }
        if (crossWord.length >= 2) crossWords.push(crossWord);
      }
    } else {
      let minCol = pt.col;
      let maxCol = pt.col;
      while (minCol > 0 && board[pt.row]![minCol - 1]!.tile !== null) minCol--;
      while (maxCol < WC_BOARD_SIZE - 1 && board[pt.row]![maxCol + 1]!.tile !== null) maxCol++;

      if (minCol < maxCol) {
        for (let c = minCol; c <= maxCol; c++) {
          const cell = getCellForWord(board, rack, placed, pt.row, c);
          if (cell) crossWord.push(cell);
        }
        if (crossWord.length >= 2) crossWords.push(crossWord);
      }
    }
  }

  const empty = boardIsEmpty(board);

  if (empty) {
    const crossesCenter = mainWord.some(c => c.row === 7 && c.col === 7);
    if (!crossesCenter) {
      return { valid: false, reason: 'First word must cross the center square (7,7)' };
    }
  } else {
    const connectsToExisting =
      mainWord.some(c => !c.isNewTile) ||
      crossWords.length > 0 ||
      placed.some(pt => {
        const neighbors = [
          board[pt.row - 1]?.[pt.col],
          board[pt.row + 1]?.[pt.col],
          board[pt.row]?.[pt.col - 1],
          board[pt.row]?.[pt.col + 1],
        ];
        return neighbors.some(cell => cell !== undefined && cell.tile !== null);
      });

    if (!connectsToExisting) {
      return { valid: false, reason: 'Word must connect to an existing tile on the board' };
    }
  }

  return { valid: true, mainWord, crossWords };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** Score a word, applying premium square multipliers for new tiles only. */
export function scoreWord(board: BoardCell[][], wordCells: WordCell[]): number {
  let wordScore = 0;
  let wordMultiplier = 1;

  for (const cell of wordCells) {
    const boardCell = board[cell.row]![cell.col]!;
    let letterScore = cell.points;

    if (cell.isNewTile && !boardCell.premiumUsed) {
      const premium = boardCell.premium;
      if (premium === 'DL') {
        letterScore *= 2;
      } else if (premium === 'TL') {
        letterScore *= 3;
      } else if (premium === 'DW') {
        wordMultiplier *= 2;
      } else if (premium === 'TW') {
        wordMultiplier *= 3;
      }
    }

    wordScore += letterScore;
  }

  return wordScore * wordMultiplier;
}

/**
 * Calculate total score for a placement (main word + cross-words + all-tiles bonus).
 */
export function calculatePlacementScore(
  board: BoardCell[][],
  mainWord: WordCell[],
  crossWords: WordCell[][],
  placedCount: number,
  rackSizeBefore: number,
): number {
  const mainWordScore = scoreWord(board, mainWord);
  const crossWordScore = crossWords.reduce((sum, cw) => sum + scoreWord(board, cw), 0);
  const usedAllTiles = placedCount === WC_RACK_SIZE && rackSizeBefore === WC_RACK_SIZE;
  const bonus = usedAllTiles ? WC_ALL_TILES_BONUS : 0;
  return mainWordScore + crossWordScore + bonus;
}

// ---------------------------------------------------------------------------
// Apply placement
// ---------------------------------------------------------------------------

/** Apply a validated placement to the board (mutates in place). */
export function applyPlacement(board: BoardCell[][], placed: PlacedTile[], rack: Tile[]): void {
  for (const pt of placed) {
    const tileInRack = rack.find(t => t.id === pt.tileId)!;
    const cell = board[pt.row]![pt.col]!;

    cell.tile = {
      id: tileInRack.id,
      letter: pt.letter,
      points: tileInRack.points,
      isBlank: tileInRack.isBlank,
    };

    if (cell.premium !== null && !cell.premiumUsed) {
      cell.premiumUsed = true;
    }
  }
}

// ---------------------------------------------------------------------------
// Game-over check
// ---------------------------------------------------------------------------

/**
 * Returns true if the game should end:
 * - Too many consecutive passes (2 × number of players)
 * - Any player's rack is empty AND the bag is empty
 */
export function isGameOver(
  consecutivePasses: number,
  playerCount: number,
  bagEmpty: boolean,
  racks: Tile[][],
): boolean {
  if (consecutivePasses >= playerCount * 2) return true;
  if (bagEmpty && racks.some(r => r.length === 0)) return true;
  return false;
}

/**
 * Apply end-of-game penalties: deduct remaining rack tile values from each
 * player's score (floor at 0).
 */
export function applyEndGamePenalties(scores: number[], racks: Tile[][]): number[] {
  return scores.map((score, i) => {
    const penalty = (racks[i] ?? []).reduce((sum, t) => sum + t.points, 0);
    return Math.max(0, score - penalty);
  });
}
