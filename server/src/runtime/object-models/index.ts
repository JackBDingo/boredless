/**
 * index.ts — Public API for the Object Models subsystem.
 *
 * Import from this file only. Never import from internal files directly.
 *
 * @example
 * import { DeckManager, HandManager, ObjectRegistry } from '../object-models/index.js';
 */

// Core type definitions
export type {
  GameObjectType,
  GameObject,
  GameItem,
  Deck,
  Hand,
  Board,
  Pool,
  ObjectEvent,
} from './types.js';

// Manager classes
export { DeckManager } from './deck.js';
export { HandManager } from './hand.js';
export { BoardManager } from './board.js';
export { PoolManager } from './pool.js';

// Central registry
export {
  ObjectRegistry,
  type DeckConfig,
  type HandConfig,
  type BoardConfig,
  type PoolConfig,
} from './object-registry.js';

// Schema integration
export {
  // Zod schemas
  GameItemSchema,
  DeckDeclarationSchema,
  HandDeclarationSchema,
  BoardDeclarationSchema,
  PoolDeclarationSchema,
  ObjectDeclarationSchema,
  ObjectsArraySchema,
  // Parse helpers
  parseGameObjects,
  safeParseGameObjects,
  // Types
  type ObjectDeclaration,
} from './schema-integration.js';
