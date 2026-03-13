/**
 * object-registry.ts — Central registry for all game objects in a room.
 *
 * ObjectRegistry is the single point of access for creating and retrieving
 * DeckManager, HandManager, BoardManager, and PoolManager instances.
 * It also handles cross-object item transfers.
 *
 * Design principles:
 * - One registry per game room (created by the interpreter or setup code)
 * - Type-safe getters (getDeck, getHand, etc.) throw with clear messages on wrong type
 * - transfer() works between any combination of object types
 * - getSnapshot() returns the full state of all objects for persistence
 * - destroy() clears all objects (cleanup on game end)
 */

import { DeckManager } from './deck.js';
import { HandManager } from './hand.js';
import { BoardManager } from './board.js';
import { PoolManager } from './pool.js';
import type { Deck, Hand, Board, Pool, GameItem } from './types.js';

// ---------------------------------------------------------------------------
// Config types (re-exposed for convenience)
// ---------------------------------------------------------------------------

export type DeckConfig = { id: string; items: GameItem[] };
export type HandConfig = { id: string; playerId: string; maxSize?: number };
export type BoardConfig = { id: string; width: number; height: number };
export type PoolConfig = { id: string; items?: GameItem[] };

// ---------------------------------------------------------------------------
// ObjectRegistry
// ---------------------------------------------------------------------------

export class ObjectRegistry {
  private readonly _objects: Map<
    string,
    DeckManager | HandManager | BoardManager | PoolManager
  >;

  constructor() {
    this._objects = new Map();
  }

  // ---------------------------------------------------------------------------
  // Factory methods
  // ---------------------------------------------------------------------------

  /** Create and register a DeckManager. Throws if id already exists. */
  createDeck(config: DeckConfig): DeckManager {
    this._assertUnique(config.id);
    const deck = new DeckManager(config);
    this._objects.set(config.id, deck);
    return deck;
  }

  /** Create and register a HandManager. Throws if id already exists. */
  createHand(config: HandConfig): HandManager {
    this._assertUnique(config.id);
    const hand = new HandManager(config);
    this._objects.set(config.id, hand);
    return hand;
  }

  /** Create and register a BoardManager. Throws if id already exists. */
  createBoard(config: BoardConfig): BoardManager {
    this._assertUnique(config.id);
    const board = new BoardManager(config);
    this._objects.set(config.id, board);
    return board;
  }

  /** Create and register a PoolManager. Throws if id already exists. */
  createPool(config: PoolConfig): PoolManager {
    this._assertUnique(config.id);
    const pool = new PoolManager(config);
    this._objects.set(config.id, pool);
    return pool;
  }

  // ---------------------------------------------------------------------------
  // Retrieval
  // ---------------------------------------------------------------------------

  /**
   * Get any object by id, regardless of type.
   * Returns null if not found.
   */
  get(id: string): DeckManager | HandManager | BoardManager | PoolManager | null {
    return this._objects.get(id) ?? null;
  }

  /**
   * Get a DeckManager by id.
   * @throws Error if not found or wrong type.
   */
  getDeck(id: string): DeckManager {
    return this._getTyped(id, DeckManager, 'deck') as DeckManager;
  }

  /**
   * Get a HandManager by id.
   * @throws Error if not found or wrong type.
   */
  getHand(id: string): HandManager {
    return this._getTyped(id, HandManager, 'hand') as HandManager;
  }

  /**
   * Get a BoardManager by id.
   * @throws Error if not found or wrong type.
   */
  getBoard(id: string): BoardManager {
    return this._getTyped(id, BoardManager, 'board') as BoardManager;
  }

  /**
   * Get a PoolManager by id.
   * @throws Error if not found or wrong type.
   */
  getPool(id: string): PoolManager {
    return this._getTyped(id, PoolManager, 'pool') as PoolManager;
  }

  // ---------------------------------------------------------------------------
  // Transfer
  // ---------------------------------------------------------------------------

  /**
   * Move items from one object to another.
   * Works between any combination: deck→hand, hand→pool, pool→deck, etc.
   *
   * The source object removes the items; the destination receives them.
   * Board objects are NOT valid transfer sources or destinations (items
   * on a board have spatial meaning that a simple transfer would violate).
   *
   * @param fromId   - Source object id
   * @param toId     - Destination object id
   * @param itemIds  - IDs of items to transfer
   * @throws Error if either object doesn't exist, is a board, or items not found
   */
  transfer(fromId: string, toId: string, itemIds: string[]): void {
    const from = this._objects.get(fromId);
    const to = this._objects.get(toId);

    if (!from) throw new Error(`ObjectRegistry: source object '${fromId}' not found`);
    if (!to) throw new Error(`ObjectRegistry: destination object '${toId}' not found`);

    if (from instanceof BoardManager) {
      throw new Error(
        `ObjectRegistry: cannot transfer from board '${fromId}' — use board.remove() directly`,
      );
    }
    if (to instanceof BoardManager) {
      throw new Error(
        `ObjectRegistry: cannot transfer to board '${toId}' — use board.place() directly`,
      );
    }

    // Extract items from source
    let removed: GameItem[];
    if (from instanceof DeckManager) {
      // Draw from top using a set lookup approach:
      // We need to pull specific items by ID, not necessarily from the top.
      // Use getState() to find items, then reconstruct by drawing what we need.
      removed = this._removeFromDeck(from, itemIds);
    } else if (from instanceof HandManager) {
      removed = from.remove(itemIds);
    } else {
      // PoolManager
      removed = (from as PoolManager).remove(itemIds);
    }

    // Add items to destination
    if (to instanceof DeckManager) {
      to.addToBottom(removed);
    } else if (to instanceof HandManager) {
      to.add(removed);
    } else {
      // PoolManager
      (to as PoolManager).add(removed);
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot
  // ---------------------------------------------------------------------------

  /**
   * Get a full snapshot of all registered objects.
   * Returns a plain object mapping id → state (Deck | Hand | Board | Pool).
   * Safe for serialization.
   */
  getSnapshot(): Record<string, Deck | Hand | Board | Pool> {
    const result: Record<string, Deck | Hand | Board | Pool> = {};
    for (const [id, obj] of this._objects) {
      result[id] = obj.getState();
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Destroy
  // ---------------------------------------------------------------------------

  /**
   * Clear all registered objects.
   * Call on game end to release memory.
   */
  destroy(): void {
    this._objects.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _assertUnique(id: string): void {
    if (this._objects.has(id)) {
      throw new Error(`ObjectRegistry: object with id '${id}' already exists`);
    }
  }

  private _getTyped(
    id: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Ctor: new (...args: any[]) => any,
    typeName: string,
  ): DeckManager | HandManager | BoardManager | PoolManager {
    const obj = this._objects.get(id);
    if (!obj) {
      throw new Error(`ObjectRegistry: object '${id}' not found`);
    }
    if (!(obj instanceof Ctor)) {
      throw new Error(
        `ObjectRegistry: object '${id}' is not a ${typeName} (got ${obj.constructor.name})`,
      );
    }
    return obj;
  }

  /**
   * Remove specific items from a DeckManager by ID.
   * Since DeckManager doesn't have a remove-by-id method, we need to
   * pull its full state, filter, and rebuild.
   */
  private _removeFromDeck(deck: DeckManager, itemIds: string[]): GameItem[] {
    const idSet = new Set(itemIds);
    const state = deck.getState();

    const toRemove: GameItem[] = [];
    const toKeep: GameItem[] = [];

    for (const item of state.items) {
      if (idSet.has(item.id)) {
        toRemove.push(item);
        idSet.delete(item.id);
      } else {
        toKeep.push(item);
      }
    }

    // Rebuild deck: clear by drawing all, then re-add only the kept items
    // This is the cleanest way without adding internals access
    deck.draw(state.items.length); // drain the deck
    deck.addToBottom(toKeep);      // restore kept items

    return toRemove;
  }
}
