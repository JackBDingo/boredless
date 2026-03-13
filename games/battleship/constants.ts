// ============================================================
// BATTLESHIP — Game-specific constants
// ============================================================

export const BS_MIN_PLAYERS = 2;
export const BS_MAX_PLAYERS = 2;

// Phase durations (seconds)
export const BS_SETUP_TIME_SECONDS = 120;
export const BS_TURN_TIME_SECONDS = 30;
export const BS_RESULT_TIME_SECONDS = 8;
export const BS_SCORES_TIME_SECONDS = 6;

// Scoring
export const BS_POINTS_HIT = 50;
export const BS_POINTS_SHIP_SUNK = 200;
export const BS_POINTS_VICTORY_BONUS = 1000;

// Grid
export const BS_GRID_SIZE = 10;
export const BS_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

// Fleet configuration
export const BS_FLEET = [
  { id: 'carrier',    name: 'Carrier',    size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser',    name: 'Cruiser',    size: 3 },
  { id: 'submarine',  name: 'Submarine',  size: 3 },
  { id: 'destroyer',  name: 'Destroyer',  size: 2 },
] as const;

export const BS_TOTAL_SHIPS = BS_FLEET.length;
/** Alias used by board.ts */
export const COL_LABELS = BS_COLS;
