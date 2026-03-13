/**
 * hand.ts — HandManager class for the Object Models subsystem.
 *
 * Manages a player-owned collection of GameItems (cards, tiles, etc.).
 * Enforces optional size limits and provides standard hand operations.
 *
 * Design principles:
 * - add() throws if maxSize would be exceeded (clear contract for game logic)
 * - getItems() returns copies — callers can't mutate internals
 * - play() is semantically distinct from remove() (single card, game action)
 * - sort() is in-place with optional comparator
 */

import type { Hand, GameItem } from './types.js';

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
// HandManager
// ---------------------------------------------------------------------------

export class HandManager {
  private readonly _id: string;
  private readonly _playerId: string;
  private readonly _maxSize: number | undefined;
  private _items: GameItem[];

  /**
   * Create a HandManager.
   *
   * @param config.id       - Unique identifier for this hand
   * @param config.playerId - Player who owns this hand
   * @param config.maxSize  - Maximum number of items allowed (optional)
   */
  constructor(config: { id: string; playerId: string; maxSize?: number }) {
    this._id = config.id;
    this._playerId = config.playerId;
    this._maxSize = config.maxSize;
    this._items = [];
  }

  // ---------------------------------------------------------------------------
  // Add / Remove
  // ---------------------------------------------------------------------------

  /**
   * Add items to the hand.
   * Throws if adding would exceed maxSize.
   *
   * @param items - Items to add
   * @throws Error if hand would exceed maxSize
   */
  add(items: GameItem[]): void {
    if (this._maxSize !== undefined) {
      const newSize = this._items.length + items.length;
      if (newSize > this._maxSize) {
        throw new Error(
          `Hand '${this._id}': adding ${items.length} item(s) would exceed maxSize ${this._maxSize} (current: ${this._items.length})`,
        );
      }
    }
    for (const item of items) {
      this._items.push(cloneItem(item));
    }
  }

  /**
   * Remove specific items from the hand by ID.
   * Returns the removed items (in the order requested).
   * Items not found in the hand are silently skipped.
   *
   * @param itemIds - IDs of items to remove
   * @returns The removed items
   */
  remove(itemIds: string[]): GameItem[] {
    const idSet = new Set(itemIds);
    const removed: GameItem[] = [];
    const remaining: GameItem[] = [];

    for (const item of this._items) {
      if (idSet.has(item.id)) {
        removed.push(item);
        idSet.delete(item.id);
      } else {
        remaining.push(item);
      }
    }

    this._items = remaining;

    // Return in the order requested
    const byId = new Map(removed.map((i) => [i.id, i]));
    return itemIds.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });
  }

  /**
   * Remove and return a single item by ID (playing a card).
   * Throws if the item is not found.
   *
   * @param itemId - ID of the item to play
   * @returns The played item
   * @throws Error if item is not in the hand
   */
  play(itemId: string): GameItem {
    const index = this._items.findIndex((i) => i.id === itemId);
    if (index === -1) {
      throw new Error(`Hand '${this._id}': item '${itemId}' not found`);
    }
    const [item] = this._items.splice(index, 1);
    return item!;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Check if the hand contains an item with the given ID.
   */
  has(itemId: string): boolean {
    return this._items.some((i) => i.id === itemId);
  }

  /** Number of items in the hand. */
  getSize(): number {
    return this._items.length;
  }

  /**
   * True if the hand is at maxSize.
   * Always false if no maxSize was declared.
   */
  isFull(): boolean {
    if (this._maxSize === undefined) return false;
    return this._items.length >= this._maxSize;
  }

  /**
   * Get all items in the hand.
   * Returns copies — mutations won't affect the hand.
   */
  getItems(): GameItem[] {
    return this._items.map(cloneItem);
  }

  // ---------------------------------------------------------------------------
  // Sort
  // ---------------------------------------------------------------------------

  /**
   * Sort items in the hand in place.
   * Uses standard string comparison on item.id by default.
   *
   * @param compareFn - Optional custom comparator
   */
  sort(compareFn?: (a: GameItem, b: GameItem) => number): void {
    if (compareFn) {
      this._items.sort(compareFn);
    } else {
      this._items.sort((a, b) => a.id.localeCompare(b.id));
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  /**
   * Return an immutable snapshot of the hand's current state.
   */
  getState(): Hand {
    return {
      id: this._id,
      type: 'hand',
      playerId: this._playerId,
      items: this._items.map(cloneItem),
      maxSize: this._maxSize,
    };
  }
}
