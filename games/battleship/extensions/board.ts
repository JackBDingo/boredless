/**
 * extensions/board.ts — Battleship board / grid operations.
 *
 * Migrated from server/board.ts. Pure functions — no runtime imports.
 * All dependencies come from constants embedded in this file so extensions
 * stay isolated from the V1 server directory.
 */

// ---------------------------------------------------------------------------
// Constants (inlined from constants.ts to keep extensions self-contained)
// ---------------------------------------------------------------------------

export const BS_GRID_SIZE = 10;
export const COL_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

export const BS_FLEET = [
  { id: 'carrier',    name: 'Carrier',    size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser',    name: 'Cruiser',    size: 3 },
  { id: 'submarine',  name: 'Submarine',  size: 3 },
  { id: 'destroyer',  name: 'Destroyer',  size: 2 },
] as const;

// ---------------------------------------------------------------------------
// Types (inlined from types.ts to keep extensions self-contained)
// ---------------------------------------------------------------------------

export interface Ship {
  id: string;
  name: string;
  size: number;
}

export interface PlacedShip {
  shipId: string;
  cells: string[];
  hits: string[];
  sunk: boolean;
}

export interface Shot {
  cell: string;
  result: 'hit' | 'miss';
  sunkShip?: string;
}

export interface DisplayBoard {
  hits: string[];
  misses: string[];
  sunkShips: PlacedShip[];
  shipsRemaining: number;
}

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

/** Convert "A1" → { row: 0, col: 0 } */
export function parseCell(cell: string): { row: number; col: number } | null {
  const match = cell.match(/^([A-J])(\d{1,2})$/);
  if (!match) return null;
  const col = COL_LABELS.indexOf(match[1]! as typeof COL_LABELS[number]);
  const row = parseInt(match[2]!, 10) - 1;
  if (col < 0 || row < 0 || row >= BS_GRID_SIZE) return null;
  return { row, col };
}

/** Convert { row: 0, col: 0 } → "A1" */
export function toCell(row: number, col: number): string {
  return `${COL_LABELS[col]}${row + 1}`;
}

// ---------------------------------------------------------------------------
// Placement validation
// ---------------------------------------------------------------------------

/** Validate a full fleet placement. Returns error string or null if valid. */
export function validatePlacement(ships: PlacedShip[]): string | null {
  if (ships.length !== BS_FLEET.length) {
    return `Expected ${BS_FLEET.length} ships, got ${ships.length}`;
  }

  const usedCells = new Set<string>();
  const usedShipIds = new Set<string>();

  for (const placed of ships) {
    const shipDef = BS_FLEET.find(s => s.id === placed.shipId);
    if (!shipDef) return `Unknown ship: ${placed.shipId}`;
    if (usedShipIds.has(placed.shipId)) return `Duplicate ship: ${placed.shipId}`;
    usedShipIds.add(placed.shipId);

    if (placed.cells.length !== shipDef.size) {
      return `${placed.shipId} should have ${shipDef.size} cells, got ${placed.cells.length}`;
    }

    const parsed = placed.cells.map(parseCell);
    if (parsed.some(p => p === null)) return `${placed.shipId} has invalid cell coordinates`;

    const coords = parsed as { row: number; col: number }[];
    const rows = coords.map(c => c.row);
    const cols = coords.map(c => c.col);
    const isHorizontal = new Set(rows).size === 1;
    const isVertical = new Set(cols).size === 1;

    if (!isHorizontal && !isVertical) return `${placed.shipId} cells are not in a straight line`;

    if (isHorizontal) {
      const sorted = [...cols].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i]! - sorted[i - 1]! !== 1) return `${placed.shipId} cells are not contiguous`;
      }
    } else {
      const sorted = [...rows].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i]! - sorted[i - 1]! !== 1) return `${placed.shipId} cells are not contiguous`;
      }
    }

    for (const cell of placed.cells) {
      if (usedCells.has(cell)) return `Cell ${cell} is occupied by multiple ships`;
      usedCells.add(cell);
    }
  }

  for (const def of BS_FLEET) {
    if (!usedShipIds.has(def.id)) return `Missing ship: ${def.id}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Random placement
// ---------------------------------------------------------------------------

/** Generate a random valid fleet placement */
export function randomPlacement(): PlacedShip[] {
  const placed: PlacedShip[] = [];
  const occupied = new Set<string>();

  const fleet = [...BS_FLEET].sort((a, b) => b.size - a.size);

  for (const ship of fleet) {
    let success = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const horizontal = Math.random() < 0.5;
      const maxCol = horizontal ? BS_GRID_SIZE - ship.size : BS_GRID_SIZE - 1;
      const maxRow = horizontal ? BS_GRID_SIZE - 1 : BS_GRID_SIZE - ship.size;
      const startRow = Math.floor(Math.random() * (maxRow + 1));
      const startCol = Math.floor(Math.random() * (maxCol + 1));

      const cells: string[] = [];
      let valid = true;
      for (let i = 0; i < ship.size; i++) {
        const r = horizontal ? startRow : startRow + i;
        const c = horizontal ? startCol + i : startCol;
        const cell = toCell(r, c);
        if (occupied.has(cell)) { valid = false; break; }
        cells.push(cell);
      }

      if (valid) {
        cells.forEach(c => occupied.add(c));
        placed.push({ shipId: ship.id, cells, hits: [], sunk: false });
        success = true;
        break;
      }
    }
    if (!success) throw new Error(`Failed to place ${ship.id} after 100 attempts`);
  }

  return placed;
}

// ---------------------------------------------------------------------------
// Display board
// ---------------------------------------------------------------------------

/** Get DisplayBoard from a player's ships + incoming shots */
export function toDisplayBoard(ships: PlacedShip[], incomingShots: Shot[]): DisplayBoard {
  const sunkShips = ships.filter(s => s.sunk);
  const aliveCount = ships.length - sunkShips.length;
  return {
    hits: incomingShots.filter(s => s.result === 'hit').map(s => s.cell),
    misses: incomingShots.filter(s => s.result === 'miss').map(s => s.cell),
    sunkShips,
    shipsRemaining: aliveCount,
  };
}

// ---------------------------------------------------------------------------
// Shot processing
// ---------------------------------------------------------------------------

/** Fire a shot at a board. Mutates ships in place. Returns shot result. */
export function fireShot(
  ships: PlacedShip[],
  cell: string,
): { result: 'hit' | 'miss'; sunkShip?: Ship } {
  for (const placed of ships) {
    if (placed.cells.includes(cell) && !placed.hits.includes(cell)) {
      placed.hits.push(cell);
      if (placed.hits.length === placed.cells.length) {
        placed.sunk = true;
        const shipDef = BS_FLEET.find(s => s.id === placed.shipId);
        return { result: 'hit', sunkShip: shipDef ? { ...shipDef } : undefined };
      }
      return { result: 'hit' };
    }
  }
  return { result: 'miss' };
}

// ---------------------------------------------------------------------------
// Win detection
// ---------------------------------------------------------------------------

/** Check if all ships are sunk */
export function allShipsSunk(ships: PlacedShip[]): boolean {
  return ships.every(s => s.sunk);
}

// ---------------------------------------------------------------------------
// Auto-fire
// ---------------------------------------------------------------------------

/** Get a random untargeted cell */
export function randomUntargetedCell(existingShots: string[]): string {
  const targeted = new Set(existingShots);
  const available: string[] = [];
  for (let r = 0; r < BS_GRID_SIZE; r++) {
    for (let c = 0; c < BS_GRID_SIZE; c++) {
      const cell = toCell(r, c);
      if (!targeted.has(cell)) available.push(cell);
    }
  }
  return available[Math.floor(Math.random() * available.length)]!;
}
