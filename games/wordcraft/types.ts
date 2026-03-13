// ============================================================
// WORDCRAFT — Game-specific types
// ============================================================

import type { PremiumType } from './constants.js';

// -------------------------------------------------------
// Core tile type
// -------------------------------------------------------

/** A single letter tile */
export interface Tile {
  id: string;       // Unique ID for tracking in racks/bag
  letter: string;   // 'A'-'Z', or '' for blank
  points: number;   // 0 for blank
  isBlank: boolean; // True if this is a blank tile (letter may be '' or chosen letter)
}

// -------------------------------------------------------
// Board types
// -------------------------------------------------------

/** A single cell on the 15x15 board */
export interface BoardCell {
  tile: Tile | null;        // null = empty
  premium: PremiumType;     // TW / DW / TL / DL / null
  premiumUsed: boolean;     // Premium squares are consumed once a tile is placed
}

/** A tile being placed on the board during a turn (player input) */
export interface PlacedTile {
  row: number;
  col: number;
  letter: string;   // Chosen letter (especially relevant for blanks)
  tileId: string;   // ID matching the tile in the player's rack
}

// -------------------------------------------------------
// Player rack
// -------------------------------------------------------

export interface PlayerRack {
  playerId: string;
  tiles: Tile[];
}

// -------------------------------------------------------
// Public state (visible on TV display)
// -------------------------------------------------------

export interface WCPlayerInfo {
  playerId: string;
  playerName: string;
  score: number;
  tilesInRack: number;  // Count only — don't reveal letters
  connected: boolean;
}

export interface WCPublicState {
  gameId: 'wordcraft';
  board: BoardCell[][];         // 15x15 grid
  players: WCPlayerInfo[];
  currentPlayerId: string | null;
  turnOrder: string[];          // Player IDs in turn order
  tilesInBag: number;
  lastWord: LastWordResult | null;
  roundNumber: number;
  consecutivePasses: number;
}

export interface LastWordResult {
  playerId: string;
  playerName: string;
  word: string;
  score: number;
  placedTiles: Array<{ row: number; col: number }>;
}

// -------------------------------------------------------
// Private state (sent to individual phones)
// -------------------------------------------------------

export interface WCPrivateState {
  gameId: 'wordcraft';
  rack: Tile[];           // My current tiles
  isMyTurn: boolean;
  canSwap: boolean;       // Can swap tiles (bag has enough tiles)
  canPass: boolean;       // Always true during playing phase
  tilesInBag: number;
}
