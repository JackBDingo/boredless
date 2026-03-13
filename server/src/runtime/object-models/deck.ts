/**
 * deck.ts — DeckManager class for the Object Models subsystem.
 *
 * Manages an ordered collection of GameItems that you can shuffle, draw from,
 * peek at, and discard. Used for card games, tile draws, and any game with
 * a "stack you pull from" mechanic.
 *
 * Design principles:
 * - All operations mutate internal state (no immutability overhead for this layer)
 * - getState() returns a deep snapshot — callers can't mutate internals
 * - Drawing from an empty deck returns [] rather than throwing
 * - Fisher-Yates shuffle for unbiased randomness
 */

import type { Deck, GameItem } from './types.js';

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

/** Deep-clone a GameItem (safe for plain objects). */
function cloneItem(item: GameItem): GameItem {
  return {
    ...item,
    metadata: item.metadata ? { ...item.metadata } : undefined,
  };
}

// ---------------------------------------------------------------------------
// DeckManager
// ---------------------------------------------------------------------------

export class DeckManager {
  private readonly _id: string;
  private _items: GameItem[];
  private _discardPile: GameItem[];

  /**
   * Create a DeckManager.
   *
   * @param config.id    - Unique identifier for this deck
   * @param config.items - Initial cards in draw order (index 0 = top)
   */
  constructor(config: { id: string; items: GameItem[] }) {
    this._id = config.id;
    this._items = config.items.map(cloneItem);
    this._discardPile = [];
  }

  // ---------------------------------------------------------------------------
  // Shuffle
  // ---------------------------------------------------------------------------

  /**
   * Fisher-Yates in-place shuffle of the draw pile.
   * Does NOT touch the discard pile.
   */
  shuffle(): void {
    const arr = this._items;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
  }

  // ---------------------------------------------------------------------------
  // Draw
  // ---------------------------------------------------------------------------

  /**
   * Draw `count` items from the TOP of the deck (index 0).
   * Returns however many are available (may be fewer than count).
   * Removes drawn items from the deck.
   *
   * @param count - Number of items to draw (default: 1)
   */
  draw(count = 1): GameItem[] {
    if (this._items.length === 0) return [];
    const actual = Math.min(count, this._items.length);
    return this._items.splice(0, actual);
  }

  /**
   * Draw `count` items from the BOTTOM of the deck.
   * Returns however many are available.
   *
   * @param count - Number of items to draw (default: 1)
   */
  drawBottom(count = 1): GameItem[] {
    if (this._items.length === 0) return [];
    const actual = Math.min(count, this._items.length);
    return this._items.splice(this._items.length - actual, actual);
  }

  // ---------------------------------------------------------------------------
  // Peek
  // ---------------------------------------------------------------------------

  /**
   * Look at the top `count` items without removing them.
   * Returns copies — mutations won't affect the deck.
   *
   * @param count - Number of items to peek at (default: 1)
   */
  peek(count = 1): GameItem[] {
    const actual = Math.min(count, this._items.length);
    return this._items.slice(0, actual).map(cloneItem);
  }

  // ---------------------------------------------------------------------------
  // Add
  // ---------------------------------------------------------------------------

  /**
   * Add items to the TOP of the deck.
   *
   * @param items - Items to add (first item in array becomes new top)
   */
  addToTop(items: GameItem[]): void {
    this._items.unshift(...items.map(cloneItem));
  }

  /**
   * Add items to the BOTTOM of the deck.
   *
   * @param items - Items to add (last item in array becomes new bottom)
   */
  addToBottom(items: GameItem[]): void {
    this._items.push(...items.map(cloneItem));
  }

  // ---------------------------------------------------------------------------
  // Discard
  // ---------------------------------------------------------------------------

  /**
   * Move the given items to the discard pile.
   * Items are pushed onto the top of the discard pile (LIFO).
   *
   * @param items - Items to discard
   */
  discard(items: GameItem[]): void {
    for (const item of items) {
      this._discardPile.unshift(cloneItem(item));
    }
  }

  /**
   * Shuffle the entire discard pile back into the draw pile.
   * Discard pile is cleared after this operation.
   */
  reshuffleDiscard(): void {
    this._items.push(...this._discardPile);
    this._discardPile = [];
    this.shuffle();
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** Number of items remaining in the draw pile. */
  getSize(): number {
    return this._items.length;
  }

  /** Number of items in the discard pile. */
  getDiscardSize(): number {
    return this._discardPile.length;
  }

  /** True if the draw pile is empty. */
  isEmpty(): boolean {
    return this._items.length === 0;
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  /**
   * Return an immutable snapshot of the deck's current state.
   * Mutations to the returned object will NOT affect this deck.
   */
  getState(): Deck {
    return {
      id: this._id,
      type: 'deck',
      items: this._items.map(cloneItem),
      discardPile: this._discardPile.map(cloneItem),
    };
  }
}
