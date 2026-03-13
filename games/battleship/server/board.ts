import type { PlacedShip, Ship } from '../types.js';
import { BS_FLEET, BS_GRID_SIZE, COL_LABELS } from '../constants.js';

/** Convert "A1" → { row: 0, col: 0 } */
export function parseCell(cell: string): { row: number; col: number } | null {
  const match = cell.match(/^([A-J])(\d{1,2})$/);
  if (!match) return null;
  const col = COL_LABELS.indexOf(match[1]!);
  const row = parseInt(match[2]!, 10) - 1;
  if (col < 0 || row < 0 || row >= BS_GRID_SIZE) return null;
  return { row, col };
}

/** Convert { row: 0, col: 0 } → "A1" */
export function toCell(row: number, col: number): string {
  return `${COL_LABELS[col]}${row + 1}`;
}

/** Validate a full fleet placement. Returns error string or null if valid. */
export function validatePlacement(ships: PlacedShip[]): string | null {
  if (ships.length !== BS_FLEET.length) return `Expected ${BS_FLEET.length} ships, got ${ships.length}`;

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

    // Parse all cells and check bounds
    const parsed = placed.cells.map(parseCell);
    if (parsed.some(p => p === null)) return `${placed.shipId} has invalid cell coordinates`;

    const coords = parsed as { row: number; col: number }[];

    // Check contiguous + straight line
    const rows = coords.map(c => c.row);
    const cols = coords.map(c => c.col);
    const isHorizontal = new Set(rows).size === 1;
    const isVertical = new Set(cols).size === 1;

    if (!isHorizontal && !isVertical) return `${placed.shipId} cells are not in a straight line`;

    // Check contiguous
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

    // Check overlap
    for (const cell of placed.cells) {
      if (usedCells.has(cell)) return `Cell ${cell} is occupied by multiple ships`;
      usedCells.add(cell);
    }
  }

  // Check all ship types present
  for (const def of BS_FLEET) {
    if (!usedShipIds.has(def.id)) return `Missing ship: ${def.id}`;
  }

  return null;
}

/** Generate a random valid fleet placement */
export function randomPlacement(): PlacedShip[] {
  const placed: PlacedShip[] = [];
  const occupied = new Set<string>();

  // Place largest ships first
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

/** Get DisplayBoard from a PlayerBoard (hides ship positions, shows only hits/misses/sunk) */
export function toDisplayBoard(ships: PlacedShip[], incomingShots: { cell: string; result: string }[]): {
  hits: string[];
  misses: string[];
  sunkShips: PlacedShip[];
  shipsRemaining: number;
} {
  const sunkShips = ships.filter(s => s.sunk);
  const aliveCount = ships.length - sunkShips.length;
  return {
    hits: incomingShots.filter(s => s.result === 'hit').map(s => s.cell),
    misses: incomingShots.filter(s => s.result === 'miss').map(s => s.cell),
    sunkShips,
    shipsRemaining: aliveCount,
  };
}

/** Fire a shot at a board. Returns the shot result and updates the board in place. */
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
        return { result: 'hit', sunkShip: shipDef };
      }
      return { result: 'hit' };
    }
  }
  return { result: 'miss' };
}

/** Check if all ships are sunk */
export function allShipsSunk(ships: PlacedShip[]): boolean {
  return ships.every(s => s.sunk);
}

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
