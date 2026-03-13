/**
 * board.ts — BoardManager class for the Object Models subsystem.
 *
 * Manages a 2D grid of cells, each optionally containing a GameItem.
 * Used for tile-placement games (WordCraft), grid-based strategy (Battleship),
 * and any game with a spatial layout.
 *
 * Coordinate system: (x, y) where x is column (0..width-1), y is row (0..height-1).
 * Stored internally as cells[y][x] (row-major).
 *
 * Design principles:
 * - place() throws on occupied cell — caller is responsible for checking
 * - move() throws if source is empty or destination is occupied
 * - Out-of-bounds access always throws
 * - getState() returns a deep copy; callers can't mutate internals
 */

import type { Board, GameItem } from './types.js';

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function cloneItem(item: GameItem): GameItem {
  return {
    ...item,
    metadata: item.metadata ? { ...item.metadata } : undefined,
  };
}

// ---------------------------------------------------------------------------
// BoardManager
// ---------------------------------------------------------------------------

export class BoardManager {
  private readonly _id: string;
  private readonly _width: number;
  private readonly _height: number;
  private readonly _cells: (GameItem | null)[][];

  /**
   * Create a BoardManager with an empty grid.
   *
   * @param config.id     - Unique identifier for this board
   * @param config.width  - Number of columns
   * @param config.height - Number of rows
   */
  constructor(config: { id: string; width: number; height: number }) {
    this._id = config.id;
    this._width = config.width;
    this._height = config.height;

    // Initialize all cells to null
    this._cells = Array.from({ length: config.height }, () =>
      Array(config.width).fill(null) as (GameItem | null)[],
    );
  }

  // ---------------------------------------------------------------------------
  // Bounds check
  // ---------------------------------------------------------------------------

  /**
   * Check if the given coordinates are within the board's bounds.
   */
  isValidPosition(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      x < this._width &&
      y >= 0 &&
      y < this._height
    );
  }

  private assertBounds(x: number, y: number): void {
    if (!this.isValidPosition(x, y)) {
      throw new RangeError(
        `Board '${this._id}': position (${x}, ${y}) is out of bounds (${this._width}x${this._height})`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Cell access
  // ---------------------------------------------------------------------------

  /**
   * Get the item at the given position, or null if empty.
   * Returns a copy — mutations won't affect the board.
   *
   * @throws RangeError if out of bounds
   */
  getCell(x: number, y: number): GameItem | null {
    this.assertBounds(x, y);
    const item = this._cells[y]![x]!;
    return item === null ? null : cloneItem(item);
  }

  /** True if the given cell contains an item. */
  isOccupied(x: number, y: number): boolean {
    this.assertBounds(x, y);
    return this._cells[y]![x] !== null;
  }

  /** True if the given cell is empty. */
  isEmpty(x: number, y: number): boolean {
    return !this.isOccupied(x, y);
  }

  // ---------------------------------------------------------------------------
  // Place / Remove / Move
  // ---------------------------------------------------------------------------

  /**
   * Place an item at the given position.
   *
   * @throws RangeError if out of bounds
   * @throws Error if cell is already occupied
   */
  place(x: number, y: number, item: GameItem): void {
    this.assertBounds(x, y);
    if (this._cells[y]![x] !== null) {
      throw new Error(
        `Board '${this._id}': cell (${x}, ${y}) is already occupied`,
      );
    }
    this._cells[y]![x] = cloneItem(item);
  }

  /**
   * Remove and return the item at the given position.
   * Returns null if the cell was already empty.
   *
   * @throws RangeError if out of bounds
   */
  remove(x: number, y: number): GameItem | null {
    this.assertBounds(x, y);
    const item = this._cells[y]![x]!;
    this._cells[y]![x] = null;
    return item === null ? null : item;
  }

  /**
   * Move the item at (fromX, fromY) to (toX, toY).
   *
   * @throws RangeError if either position is out of bounds
   * @throws Error if source cell is empty
   * @throws Error if destination cell is occupied
   */
  move(fromX: number, fromY: number, toX: number, toY: number): void {
    this.assertBounds(fromX, fromY);
    this.assertBounds(toX, toY);

    const item = this._cells[fromY]![fromX];
    if (item === null) {
      throw new Error(
        `Board '${this._id}': source cell (${fromX}, ${fromY}) is empty`,
      );
    }
    if (this._cells[toY]![toX] !== null) {
      throw new Error(
        `Board '${this._id}': destination cell (${toX}, ${toY}) is already occupied`,
      );
    }

    this._cells[toY]![toX] = item;
    this._cells[fromY]![fromX] = null;
  }

  // ---------------------------------------------------------------------------
  // Board queries
  // ---------------------------------------------------------------------------

  /**
   * Return all occupied cells with their coordinates.
   * Items are copies — mutations won't affect the board.
   */
  getOccupiedCells(): Array<{ x: number; y: number; item: GameItem }> {
    const result: Array<{ x: number; y: number; item: GameItem }> = [];
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        const item = this._cells[y]![x]!;
        if (item !== null) {
          result.push({ x, y, item: cloneItem(item) });
        }
      }
    }
    return result;
  }

  /**
   * Remove all items from the board.
   */
  clear(): void {
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        this._cells[y]![x] = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  /**
   * Return an immutable snapshot of the board's current state.
   */
  getState(): Board {
    return {
      id: this._id,
      type: 'board',
      width: this._width,
      height: this._height,
      cells: this._cells.map((row) =>
        row.map((item) => (item === null ? null : cloneItem(item))),
      ),
    };
  }
}
