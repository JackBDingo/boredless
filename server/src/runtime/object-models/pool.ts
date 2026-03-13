/**
 * pool.ts — PoolManager class for the Object Models subsystem.
 *
 * Manages a shared unordered collection of GameItems for random draws.
 * Think tile bag (Scrabble), dice pool, shared resource pile, or discard zone.
 *
 * Design principles:
 * - drawRandom() uses Fisher-Yates partial shuffle for fair sampling
 * - add()/remove() operate on concrete items (caller controls what goes in)
 * - find()/filter() return copies — callers can't mutate internals
 * - getItems() returns a copy in insertion order (not randomized)
 */

import type { Pool, GameItem } from './types.js';

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
// PoolManager
// ---------------------------------------------------------------------------

export class PoolManager {
  private readonly _id: string;
  private _items: GameItem[];

  /**
   * Create a PoolManager.
   *
   * @param config.id    - Unique identifier for this pool
   * @param config.items - Initial items (optional, default: empty)
   */
  constructor(config: { id: string; items?: GameItem[] }) {
    this._id = config.id;
    this._items = (config.items ?? []).map(cloneItem);
  }

  // ---------------------------------------------------------------------------
  // Add / Remove
  // ---------------------------------------------------------------------------

  /**
   * Add items to the pool.
   *
   * @param items - Items to add
   */
  add(items: GameItem[]): void {
    for (const item of items) {
      this._items.push(cloneItem(item));
    }
  }

  /**
   * Remove specific items from the pool by ID.
   * Returns the removed items (in the order requested).
   * Items not found are silently skipped.
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

  // ---------------------------------------------------------------------------
  // Random draw
  // ---------------------------------------------------------------------------

  /**
   * Randomly draw `count` items from the pool (removes them).
   * Uses partial Fisher-Yates for unbiased sampling.
   * Returns fewer items if the pool has fewer than `count`.
   *
   * @param count - Number of items to draw (default: 1)
   * @returns Drawn items
   */
  drawRandom(count = 1): GameItem[] {
    if (this._items.length === 0) return [];
    const actual = Math.min(count, this._items.length);
    const arr = this._items;

    // Partial Fisher-Yates: swap `actual` random elements to the end
    for (let i = arr.length - 1; i >= arr.length - actual; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }

    // Extract and remove the last `actual` items
    return arr.splice(arr.length - actual, actual);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** True if the pool contains an item with the given ID. */
  has(itemId: string): boolean {
    return this._items.some((i) => i.id === itemId);
  }

  /** Number of items in the pool. */
  getSize(): number {
    return this._items.length;
  }

  /**
   * Get all items in the pool (insertion order).
   * Returns copies — mutations won't affect the pool.
   */
  getItems(): GameItem[] {
    return this._items.map(cloneItem);
  }

  /**
   * Find the first item matching the predicate.
   * Returns a copy, or undefined if not found.
   */
  find(predicate: (item: GameItem) => boolean): GameItem | undefined {
    const item = this._items.find(predicate);
    return item ? cloneItem(item) : undefined;
  }

  /**
   * Filter items matching the predicate.
   * Returns copies — mutations won't affect the pool.
   */
  filter(predicate: (item: GameItem) => boolean): GameItem[] {
    return this._items.filter(predicate).map(cloneItem);
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  /**
   * Return an immutable snapshot of the pool's current state.
   */
  getState(): Pool {
    return {
      id: this._id,
      type: 'pool',
      items: this._items.map(cloneItem),
    };
  }
}
