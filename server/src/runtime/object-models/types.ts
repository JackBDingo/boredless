/**
 * types.ts — Core type definitions for the Object Models subsystem.
 *
 * Defines generic game object types (deck, hand, board, pool) and the
 * items they contain. No game-specific logic — these are structural contracts
 * that any game can use.
 */

// ---------------------------------------------------------------------------
// GameObjectType
// ---------------------------------------------------------------------------

/**
 * Discriminant for all game object types.
 */
export type GameObjectType = 'deck' | 'hand' | 'board' | 'pool' | 'tile' | 'token' | 'custom';

// ---------------------------------------------------------------------------
// GameObject — base interface
// ---------------------------------------------------------------------------

/**
 * Base interface for all game objects.
 * Every object has a unique id, a type discriminant, and optional metadata.
 */
export interface GameObject {
  id: string;
  type: GameObjectType;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// GameItem — a card, tile, token, or other discrete item
// ---------------------------------------------------------------------------

/**
 * A discrete item that can live inside a deck, hand, pool, or board cell.
 *
 * - id must be unique within a game session
 * - type is the item's category (e.g. "card", "tile", "token")
 * - value holds the item's payload (suit/rank, letter/score, etc.)
 * - faceUp controls visibility: false = face-down (hidden from others)
 * - metadata for any extra properties
 */
export interface GameItem {
  id: string;
  type?: string;
  value?: unknown;
  faceUp?: boolean;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Concrete object types
// ---------------------------------------------------------------------------

/**
 * Deck: an ordered collection you draw from.
 * Has a main pile and a separate discard pile.
 */
export interface Deck extends GameObject {
  type: 'deck';
  items: GameItem[];
  discardPile: GameItem[];
}

/**
 * Hand: a player-owned collection of items.
 * Optional maxSize enforces hand size limits.
 */
export interface Hand extends GameObject {
  type: 'hand';
  playerId: string;
  items: GameItem[];
  maxSize?: number;
}

/**
 * Board: a 2D grid of cells, each optionally containing a GameItem.
 * Indexed as cells[y][x] (row-major, origin at top-left).
 */
export interface Board extends GameObject {
  type: 'board';
  width: number;
  height: number;
  cells: (GameItem | null)[][];
}

/**
 * Pool: a shared unordered collection to draw from randomly.
 * Think "tile bag" in Scrabble, or a shared resource pool.
 */
export interface Pool extends GameObject {
  type: 'pool';
  items: GameItem[];
}

// ---------------------------------------------------------------------------
// ObjectEvent — events emitted by object operations
// ---------------------------------------------------------------------------

/**
 * Describes an operation that occurred on a game object.
 * Used for state change notifications, replay, and history.
 */
export interface ObjectEvent {
  /** Operation type */
  type: 'draw' | 'discard' | 'shuffle' | 'place' | 'move' | 'add' | 'remove' | 'flip' | 'transfer';
  /** The object that was modified */
  objectId: string;
  /** The item involved (if applicable) */
  itemId?: string;
  /** Source object or location (for move/transfer operations) */
  from?: string;
  /** Destination object or location (for move/transfer operations) */
  to?: string;
  /** Additional operation-specific data */
  data?: Record<string, unknown>;
}
