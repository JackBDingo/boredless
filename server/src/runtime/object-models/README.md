# Object Models Subsystem

Generic game object types with standard operations: decks, hands, boards, and pools. No game-specific logic — purely reusable primitives for any card, tile, or grid-based game.

## Public API

### Types (`types.ts`)

| Type | Description |
|------|-------------|
| `GameObject` | Base interface: `id`, `type`, optional `metadata` |
| `GameItem` | A discrete item (card, tile, token): `id`, `type`, `value`, `faceUp`, `metadata` |
| `Deck` | Ordered collection with draw pile + discard pile |
| `Hand` | Player-owned collection with optional size limit |
| `Board` | 2D grid of cells (`cells[y][x]`) |
| `Pool` | Unordered shared collection for random draws |
| `ObjectEvent` | Event emitted by operations (draw, shuffle, place, etc.) |
| `GameObjectType` | Union: `'deck' \| 'hand' \| 'board' \| 'pool' \| 'tile' \| 'token' \| 'custom'` |

### `DeckManager` (`deck.ts`)

```ts
const deck = new DeckManager({ id: 'main_deck', items: cards });
deck.shuffle();                     // Fisher-Yates in-place shuffle
deck.draw(5);                       // Remove and return top 5 items
deck.drawBottom(1);                 // Remove and return bottom item
deck.peek(3);                       // See top 3 without removing
deck.addToTop(items);               // Prepend items
deck.addToBottom(items);            // Append items
deck.discard(items);                // Move to discard pile
deck.reshuffleDiscard();            // Shuffle discard back into draw pile
deck.getSize();                     // Count of draw pile items
deck.getDiscardSize();              // Count of discard pile items
deck.isEmpty();                     // boolean
deck.getState(): Deck;              // Immutable snapshot
```

### `HandManager` (`hand.ts`)

```ts
const hand = new HandManager({ id: 'hand_p1', playerId: 'p1', maxSize: 7 });
hand.add(items);                    // Add items (throws if exceeds maxSize)
hand.remove(['c1', 'c3']);          // Remove by ID, returns removed items
hand.play('c1');                    // Remove and return single item
hand.has('c1');                     // boolean
hand.getSize();                     // Count
hand.isFull();                      // boolean (always false if no maxSize)
hand.getItems(): GameItem[];        // Copies of all items
hand.sort(compareFn?);              // In-place sort (default: by id)
hand.getState(): Hand;              // Immutable snapshot
```

### `BoardManager` (`board.ts`)

```ts
const board = new BoardManager({ id: 'game_board', width: 15, height: 15 });
board.place(x, y, item);            // Place item (throws if occupied or OOB)
board.remove(x, y);                 // Remove and return item (null if empty)
board.move(fx, fy, tx, ty);         // Move item between cells
board.getCell(x, y);                // Item or null (throws if OOB)
board.isOccupied(x, y);             // boolean
board.isEmpty(x, y);                // boolean
board.isValidPosition(x, y);        // bounds check
board.getOccupiedCells();           // Array<{ x, y, item }>
board.clear();                      // Remove all items
board.getState(): Board;            // Immutable snapshot
```

### `PoolManager` (`pool.ts`)

```ts
const pool = new PoolManager({ id: 'tile_bag', items: tiles });
pool.add(items);                    // Add items
pool.remove(['t1', 't2']);          // Remove by ID, returns removed items
pool.drawRandom(7);                 // Random draw (removes items)
pool.has('t1');                     // boolean
pool.getSize();                     // Count
pool.getItems(): GameItem[];        // Copies in insertion order
pool.find(predicate);               // First matching item (copy)
pool.filter(predicate);             // All matching items (copies)
pool.getState(): Pool;              // Immutable snapshot
```

### `ObjectRegistry` (`object-registry.ts`)

Central registry per game room. Creates and manages all objects.

```ts
const registry = new ObjectRegistry();

const deck  = registry.createDeck({ id: 'deck', items: cards });
const hand  = registry.createHand({ id: 'hand_p1', playerId: 'p1' });
const board = registry.createBoard({ id: 'board', width: 8, height: 8 });
const pool  = registry.createPool({ id: 'discard' });

registry.get('deck');               // DeckManager | HandManager | ... | null
registry.getDeck('deck');           // DeckManager (throws if wrong type)
registry.getHand('hand_p1');        // HandManager
registry.getBoard('board');         // BoardManager
registry.getPool('discard');        // PoolManager

registry.transfer('deck', 'hand_p1', ['c1', 'c2']);  // Move items between objects
registry.getSnapshot();             // Record<string, Deck | Hand | Board | Pool>
registry.destroy();                 // Clear all objects (call on game end)
```

### Schema Integration (`schema-integration.ts`)

Zod schemas for the `objects:` section in game YAML.

```ts
import { parseGameObjects, safeParseGameObjects } from '../object-models/index.js';

// In a game YAML:
// objects:
//   - id: main_deck
//     type: deck
//     items: [...]
//   - id: game_board
//     type: board
//     width: 8
//     height: 8

const objects = parseGameObjects(rawYaml.objects); // throws ZodError if invalid
const result = safeParseGameObjects(rawYaml.objects); // { success, data | error }
```

## Usage Example

```ts
import { ObjectRegistry } from '../object-models/index.js';

// Create a 52-card game
const registry = new ObjectRegistry();
const deck = registry.createDeck({ id: 'deck', items: make52Cards() });
const hand = registry.createHand({ id: 'hand_p1', playerId: 'p1', maxSize: 13 });
const discard = registry.createPool({ id: 'discard' });

deck.shuffle();

// Deal 5 cards
const cards = deck.draw(5);
hand.add(cards);

// Player plays a card
registry.transfer('hand_p1', 'discard', [cards[0].id]);

// Persist state
const snapshot = registry.getSnapshot();

// Cleanup
registry.destroy();
```

## Tests

**102 tests** in `__tests__/object-models.test.ts`

```bash
cd server
npx vitest run src/runtime/object-models/__tests__/object-models.test.ts
```

## Dependencies

- **No imports from other V2 subsystems** — fully standalone
- `zod` for schema validation (schema-integration.ts only)
