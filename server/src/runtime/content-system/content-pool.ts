/**
 * content-pool.ts — ContentPool class.
 *
 * Manages a pool of content items with pluggable selection strategies.
 * The constructor receives already-loaded items (loading is done by ContentLoader).
 *
 * Subsystem: content-system
 * Phase: 3.1
 */

import type {
  ContentItem,
  ContentPoolConfig,
  ContentFilter,
  SelectionStrategy,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fisher-Yates shuffle (in-place). */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Apply a single filter predicate to an item. Returns true if item PASSES (should be kept). */
function itemMatchesFilter(item: ContentItem, filter: ContentFilter): boolean {
  const values = Array.isArray(filter.value) ? filter.value : [filter.value];

  let matches = false;
  switch (filter.field) {
    case 'category':
      matches = item.category !== undefined && values.includes(item.category);
      break;
    case 'difficulty':
      matches = item.difficulty !== undefined && values.includes(item.difficulty);
      break;
    case 'tag':
      matches = (item.tags ?? []).some((t) => values.includes(t));
      break;
  }

  return filter.exclude ? !matches : matches;
}

/** Apply an array of filters (AND logic) — item must pass ALL filters. */
function applyFilters(items: ContentItem[], filters: ContentFilter[]): ContentItem[] {
  if (filters.length === 0) return items;
  return items.filter((item) => filters.every((f) => itemMatchesFilter(item, f)));
}

// ---------------------------------------------------------------------------
// ContentPool
// ---------------------------------------------------------------------------

/**
 * ContentPool manages a set of content items with a selection strategy.
 *
 * Lifecycle:
 *   1. Construction: pool initialized with all items (optionally pre-filtered).
 *   2. draw(): items drawn per strategy; noRepeat removes from available set.
 *   3. Exhaustion: when no items remain — recycle or return [].
 *   4. reset(): refill from original items.
 */
export class ContentPool {
  private readonly _config: ContentPoolConfig;
  /** All original items (after pre-filters, before draw state). */
  private readonly _allItems: ContentItem[];
  /** Currently available items (items removed as they are drawn when noRepeat=true). */
  private _available: ContentItem[];
  /** Index pointer for sequential/shuffle strategies. */
  private _sequentialIndex: number = 0;
/** Count of total items ever drawn (across all recycles). */
  private _totalDrawn: number = 0;

  constructor(config: ContentPoolConfig, items: ContentItem[]) {
    this._config = config;

    // Apply pre-filters from config
    const preFilters = config.filters ?? [];
    this._allItems = applyFilters(items, preFilters);

    // Initialize the available pool
    this._available = this._initAvailable();
  }

  // ---------------------------------------------------------------------------
  // Private initializers
  // ---------------------------------------------------------------------------

  private _initAvailable(): ContentItem[] {
    const items = [...this._allItems];

    if (this._strategy() === 'shuffle') {
      shuffleArray(items);
    }

    this._sequentialIndex = 0;
    return items;
  }

  private _strategy(): SelectionStrategy {
    return this._config.selection;
  }

  private _noRepeat(): boolean {
    return this._config.noRepeat !== false; // default true
  }

  private _recyclable(): boolean {
    return this._config.recyclable !== false; // default true
  }

  // ---------------------------------------------------------------------------
  // Draw helpers per strategy
  // ---------------------------------------------------------------------------

  /** Draw one item from _available using the configured strategy. Returns undefined if empty. */
  private _drawOne(): ContentItem | undefined {
    if (this._available.length === 0) return undefined;

    let item: ContentItem;
    let idx: number;

    switch (this._strategy()) {
      case 'random': {
        idx = Math.floor(Math.random() * this._available.length);
        item = this._available[idx];
        if (this._noRepeat()) {
          this._available.splice(idx, 1);
        }
        return item;
      }

      case 'weighted': {
        const totalWeight = this._available.reduce((sum, it) => sum + (it.weight ?? 1), 0);
        if (totalWeight <= 0) return undefined; // all weights are 0
        let r = Math.random() * totalWeight;
        idx = 0;
        for (let i = 0; i < this._available.length; i++) {
          r -= this._available[i].weight ?? 1;
          if (r <= 0) {
            idx = i;
            break;
          }
        }
        item = this._available[idx];
        if (this._noRepeat()) {
          this._available.splice(idx, 1);
        }
        return item;
      }

      case 'sequential': {
        item = this._available[this._sequentialIndex];
        if (this._noRepeat()) {
          this._available.splice(this._sequentialIndex, 1);
          // index stays the same — next item slid into current position
        } else {
          this._sequentialIndex = (this._sequentialIndex + 1) % this._available.length;
        }
        return item;
      }

      case 'shuffle': {
        // Shuffle strategy: draw sequentially from a pre-shuffled order
        item = this._available[this._sequentialIndex];
        if (this._noRepeat()) {
          this._available.splice(this._sequentialIndex, 1);
        } else {
          this._sequentialIndex = (this._sequentialIndex + 1) % this._available.length;
        }
        return item;
      }
    }
  }

  /**
   * Attempt to recycle the pool when exhausted.
   * Returns true if recycle succeeded, false if not recyclable.
   */
  private _tryRecycle(): boolean {
    if (!this._recyclable()) return false;
    if (this._allItems.length === 0) return false;
    this._available = this._initAvailable();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Draw items from the pool based on the selection strategy.
   *
   * @param count Number of items to draw (default: 1).
   * @returns Array of drawn items. May be fewer than count if pool exhausted
   *   and recyclable=false.
   */
  draw(count: number = 1): ContentItem[] {
    if (count <= 0) return [];

    const results: ContentItem[] = [];

    for (let i = 0; i < count; i++) {
      if (this._available.length === 0) {
        if (!this._tryRecycle()) break;
      }

      const item = this._drawOne();
      if (item === undefined) {
        // Can happen if all weights are 0
        if (!this._tryRecycle()) break;
        const retried = this._drawOne();
        if (retried === undefined) break;
        results.push(retried);
      } else {
        results.push(item);
      }
    }

    this._totalDrawn += results.length;
    return results;
  }

  /**
   * Peek at what would be drawn without consuming items.
   *
   * @param count Number of items to peek at (default: 1).
   * @returns Items that would be drawn next.
   */
  peek(count: number = 1): ContentItem[] {
    if (count <= 0 || this._available.length === 0) return [];

    switch (this._strategy()) {
      case 'sequential':
      case 'shuffle': {
        // Peek at next N from sequential position
        const end = Math.min(this._sequentialIndex + count, this._available.length);
        return this._available.slice(this._sequentialIndex, end);
      }
      case 'random':
      case 'weighted': {
        // For random/weighted, peek returns first N items in available order
        // (not truly predictive, but gives caller a sense of pool contents)
        return this._available.slice(0, Math.min(count, this._available.length));
      }
    }
  }

  /** Number of items remaining before the pool is exhausted. */
  getRemaining(): number {
    return this._available.length;
  }

  /**
   * Refill the pool from original items, resetting all draw state.
   * Equivalent to creating a fresh pool with the same config.
   */
  reset(): void {
    this._available = this._initAvailable();
    this._totalDrawn = 0;
  }

  /**
   * Get a filtered subset of items.
   * Does NOT consume items — the pool's draw state is unaffected.
   *
   * @param filters Filter criteria (AND logic).
   */
  filter(filters: ContentFilter[]): ContentItem[] {
    return applyFilters(this._allItems, filters);
  }

  /** All original items in the pool (after pre-filters, regardless of draw state). */
  getAll(): ContentItem[] {
    return [...this._allItems];
  }

  /** Current state snapshot. */
  getState(): { remaining: number; total: number; drawn: number } {
    return {
      remaining: this._available.length,
      total: this._allItems.length,
      drawn: this._totalDrawn,
    };
  }

  /** Pool ID from config. */
  get id(): string {
    return this._config.id;
  }
}
