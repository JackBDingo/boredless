# Object Models — Design Decisions

## Key Design Decisions

### 1. Manager Classes, Not Plain Objects

**Decision:** Each object type is a `*Manager` class (`DeckManager`, `HandManager`, etc.) rather than plain object literals plus standalone functions.

**Rationale:** Games need to call `deck.shuffle()`, `hand.play('c3')` frequently. Class methods give clean call-site ergonomics and encapsulate internal state mutation. The alternative (pure functions taking state objects) would require passing the whole state object on every call — awkward for frequent use.

**Trade-off:** Slightly more verbose construction. Mitigated by `ObjectRegistry` factory methods.

---

### 2. getState() Returns Deep Copies

**Decision:** All snapshot methods (`getState()`, `getItems()`, `getCell()`, `getOccupiedCells()`) return deep copies of internal state.

**Rationale:** Prevents callers from accidentally mutating internal state through references. This class of bug (mutating a returned reference and corrupting game state) is subtle and hard to debug. The performance cost for game-scale data (52 cards, 15×15 boards) is negligible.

**Alternative rejected:** Returning frozen objects (`Object.freeze`). Rejected because TypeScript doesn't fully model immutability through freeze, and it produces confusing runtime errors instead of clear copy semantics.

---

### 3. Board Uses cells[y][x] (Row-Major, Y=Row)

**Decision:** Board cells are stored as `cells[y][x]` where `y` is the row index and `x` is the column index.

**Rationale:** Matches standard 2D array conventions in most programming contexts. When iterating over the grid (e.g., for serialization), `cells[y]` is a natural row. The API exposes `(x, y)` coordinate pairs at call sites, which matches player-facing "column, row" conventions.

**Trade-off:** The internal `[y][x]` vs external `(x, y)` asymmetry requires careful reading of the implementation. Documented in the source and tests.

---

### 4. DeckManager Has No Remove-By-ID

**Decision:** `DeckManager` only exposes draw-from-top, draw-from-bottom, peek, add-to-top, add-to-bottom, discard. There is no `removeById()` on `DeckManager`.

**Rationale:** Decks are ordered stacks. "Pulling a specific card from the middle of a shuffled deck" is not a standard deck operation — it's a cheat or a special rule. Games that need this should use a `PoolManager` (unordered) or build a filter-and-rebuild pattern through `ObjectRegistry.transfer()`.

**ObjectRegistry.transfer() workaround:** When transferring specific items from a deck, `ObjectRegistry._removeFromDeck()` uses a drain-and-rebuild strategy. This is intentionally internal — callers use `transfer()` and don't need to think about the mechanics.

---

### 5. Board Objects Not Valid Transfer Endpoints

**Decision:** `ObjectRegistry.transfer()` throws if either endpoint is a `BoardManager`.

**Rationale:** Board items have spatial meaning. A card on a Battleship grid at (3, 7) is fundamentally different from a card "in a pool" — its location is part of its game-state identity. Allowing blind transfers to/from boards would silently discard spatial information. Games use `board.place()` and `board.remove()` directly for spatial operations.

---

### 6. PoolManager Uses Partial Fisher-Yates for drawRandom

**Decision:** `drawRandom()` uses a partial Fisher-Yates shuffle (swap random elements to the end, then splice).

**Rationale:** Unbiased random sampling without needing to generate a full shuffled copy of the pool. O(count) rather than O(n log n) for sort-based approaches. Mutates the array in-place by moving selected items to the end, which is efficient.

---

### 7. HandManager: add() Throws on maxSize Exceed

**Decision:** `add()` throws if adding items would exceed `maxSize`, rather than silently ignoring excess or truncating.

**Rationale:** Silent truncation would lose items from the game (cards disappear). Silent ignore would make the caller's add() appear to succeed but the hand wouldn't have all items. Throwing forces the game author to handle the constraint explicitly. This is the correct behavior for a hand-limit rule.

---

### 8. No GameItem.faceUp Enforcement in Managers

**Decision:** `faceUp` is stored on `GameItem` as a data field but the managers don't enforce visibility projections.

**Rationale:** Visibility projection is handled by the Visibility & Projection subsystem (Phase 2.1). Object Models are the ground truth of what items exist and where — visibility is a separate concern. The `faceUp` field provides the data that the visibility subsystem uses when projecting state.

---

### 9. ObjectRegistry Is Per-Room, Not Singleton

**Decision:** `ObjectRegistry` is instantiated per game room, not shared globally.

**Rationale:** Each game room has its own independent set of objects. A deck in room A should never be accessible from room B. The interpreter creates one `ObjectRegistry` per room during setup.

---

### 10. No Integration With DeclarativeGameModule (Yet)

**Decision:** Object Models are built standalone. Integration with the DeclarativeGameModule (interpreter) is Phase 2.3+ work, not done here.

**Rationale:** Per the architecture plan, subsystems are built and tested independently before being wired together. This prevents coupling and makes testing easier. The interpreter will create `ObjectRegistry` instances from the `objects:` section of game schemas in a later phase.

---

## Alternatives Considered

### Alternative: Immutable State Pattern (Redux-style)
Pure functions that return new state objects rather than mutating managers. Rejected because: (1) game logic calls `draw()`, `shuffle()` many times per turn — immutable copies would allocate excessively; (2) turn-based game logic is inherently sequential, so immutability buys little safety.

### Alternative: Single Generic "Collection" Type
One `Collection` class for all deck/hand/pool variants. Rejected because: (1) the operations are meaningfully different (deck has top/bottom semantics, hand has ownership, pool has random draw); (2) type safety is lost with a single type; (3) the type discriminant on the schema makes the intent clear.

### Alternative: EventEmitter Pattern
Emit events from every operation (shuffle, draw, etc.) using Node EventEmitter. Rejected for now because: (1) adds complexity without current consumers; (2) the ObjectEvent type exists for future use if a pub/sub layer is needed; (3) callers can observe state changes through the StateManager or interpreter layer.

---

## Subsystem Boundary Documentation

**Imports from:**
- `zod` (schema-integration.ts only)
- No other V2 subsystems

**Exports to:**
- Any subsystem via `object-models/index.ts`
- Schema Engine will reference `ObjectsArraySchema` for the `objects:` field validation

**Does NOT own:**
- Visibility projection of faceUp cards (Visibility subsystem)
- Wiring objects into game phases (DeclarativeGameModule / interpreter)
- Persistence/serialization (caller uses `getSnapshot()` and stores it)
