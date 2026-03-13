// ============================================================
// BATTLESHIP — Game-specific types
// ============================================================

/** Ship definition (static fleet config) */
export interface Ship {
  id: string;
  name: string;
  size: number;
}

/** A placed ship on the grid */
export interface PlacedShip {
  shipId: string;
  cells: string[];   // e.g. ["A1", "A2", "A3"]
  hits: string[];    // Cells that have been hit
  sunk: boolean;
}

/** Cell state for rendering */
export type CellState = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk';

/** A single shot record */
export interface Shot {
  cell: string;           // e.g. "B5"
  result: 'hit' | 'miss';
  sunkShip?: string;      // Ship ID if this shot sunk a ship
}

/** Full board state (server-internal) */
export interface PlayerBoard {
  ships: PlacedShip[];
  incomingShots: Shot[];  // Shots the opponent has fired at this board
}

/** Board as shown on TV — ships visible only where hit/sunk */
export interface DisplayBoard {
  hits: string[];
  misses: string[];
  sunkShips: PlacedShip[];
  shipsRemaining: number;
}

/** Public state for the TV display */
export interface BSPublicState {
  gameId: 'battleship';
  player1: { playerId: string; playerName: string; board: DisplayBoard };
  player2: { playerId: string; playerName: string; board: DisplayBoard };
  activePlayerId: string;
  lastShot: {
    playerId: string;
    cell: string;
    result: 'hit' | 'miss';
    sunkShip?: string;
  } | null;
  turnNumber: number;
  /** Setup phase: per-player ready status */
  readyStatus?: Record<string, boolean>;
}

/** Private state sent to individual phones */
export interface BSPrivateState {
  gameId: 'battleship';
  phase: string;
  isActivePlayer: boolean;
  myBoard: {
    ships: PlacedShip[];
    incomingShots: Shot[];
  };
  opponentBoard: {
    hits: string[];
    misses: string[];
    sunkShips: PlacedShip[];
  };
  /** Setup phase only */
  availableShips?: Ship[];
  placedShips?: PlacedShip[];
  isReady?: boolean;
  /** Already-fired cells (battle phase) */
  firedCells?: string[];
}
