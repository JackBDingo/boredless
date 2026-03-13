# State Manager — Architectural Decisions

**Phase:** 0.2  
**Subsystem:** `server/src/runtime/state-manager/`  
**Author:** Jack Vincent  
**Date:** 2026-03-13

---

## Decision 1: State stored in plain Maps/objects, not class instances

**Context:** Per the architecture plan, state should be stored in plain data structures for simplicity, serialization, and snapshot support.

**Decision:** Globals stored in a `Record<string, unknown>`, per-player state in a `Map<string, Record<string, unknown>>`, per-team state in a `Map<string, Record<string, unknown>>`.

**Why not class instances?**  
Class instances would require defining a strongly-typed class per game. The State Manager is generic — it doesn't know what fields exist until it reads the schema at runtime. Plain objects allow dynamic field access by name without any code generation.

**Trade-off:** No compile-time safety on individual field access (e.g., `getPlayer('p1', 'score')` returns `unknown`, not `number`). The Schema Engine provides type metadata at runtime; full type enforcement is deferred to the Visibility/Projection system (Phase 2).

---

## Decision 2: All mutations go through set methods (no direct state access)

**Context:** The architecture plan requires change event observation. Observable state requires all mutations to flow through a controlled path.

**Decision:** `globals`, `playerStates`, and `teamStates` are all `private`. External code can only mutate via `setGlobal`, `setPlayer`, `setTeam`, `setPlayerAll`, `resetTransientState`. No direct property assignments on state objects.

**Why not Proxy?**  
JavaScript Proxy could intercept property assignments on plain objects, but adds complexity and makes debugging harder. Explicit set methods are simpler, more readable, and easier to test.

---

## Decision 3: Listeners fire synchronously

**Context:** The architecture plan specifies "Listeners fire synchronously after each mutation." This simplifies the caller's mental model (mutations are complete and listeners notified before the next line of code runs).

**Decision:** Listeners are called immediately inside the `emit()` method, which is called at the end of each set method, before returning.

**Implication:** Listeners must not perform async I/O or long-running work. This is documented in the type definition for `StateChangeListener`. If async notification is needed in future, the Event System (Phase 2) is the right layer.

---

## Decision 4: getPublicState/getPrivateState are basic — full projection deferred to Phase 2

**Context:** The task spec says "just basic public/private filtering — full projection system is Phase 2."

**Decision:** `getPublicState()` filters globals and per-player fields by `visibility === 'public'`. `getPrivateState(playerId)` returns all globals, all fields for the target player, and only public fields for other players.

**Not implemented (Phase 2):**
- Team visibility
- Role-based visibility (e.g., `visibility: 'role:detective'`)
- Host-only visibility
- Spectator visibility
- Transform/redaction operations (e.g., showing "?" for hidden cards)
- Eliminated player visibility

---

## Decision 5: Auto-registering unknown players in setPlayer

**Context:** What happens if `setPlayer('unknown-id', ...)` is called with a player ID not in the initial list?

**Decision:** `setPlayer` auto-creates state for unknown players rather than throwing. This is a graceful-degradation choice: the State Manager shouldn't crash the runtime if a player joins mid-game or if the caller makes a sequencing error. The unknown player's state starts empty (not from schema defaults).

**Trade-off:** A stricter design would throw on unknown player IDs, surfacing bugs earlier. A lenient design avoids crashes. Given the State Manager is a low-level primitive used by higher-level subsystems that handle join sequencing, leniency is preferred here.

---

## Decision 6: resetTransientState resets ALL fields (globals + per-player + per-team)

**Context:** The task spec says "clear all transient/round state back to defaults." The term "transient" could mean only per-round fields, but determining which fields are "transient" requires semantic knowledge the State Manager doesn't have.

**Decision:** `resetTransientState()` resets ALL declared fields to their schema defaults. The caller (Phase Machine, Phase 1) is responsible for deciding when to call this method. The State Manager resets everything it knows about; callers preserve what they need before calling.

**Future:** Phase 2 could add a `transient: true` flag to individual field declarations, allowing selective reset. That design is deferred.

---

## Decision 7: deepClone uses recursive object traversal, not JSON.parse/stringify

**Context:** Snapshot requires deep cloning state.

**Decision:** Custom `deepClone` function that recursively copies objects and arrays. Handles `null` correctly (unlike `JSON.parse(JSON.stringify(null))` edge cases). Handles primitives without unnecessary JSON roundtrips.

**Why not structuredClone?** `structuredClone` is available in Node.js 17+ and is the modern correct choice. However, the custom `deepClone` is explicit about what it supports (primitives, null, plain objects, arrays), avoiding any surprises with Date objects, RegExp, etc. that might appear in state. Revisit if performance ever becomes a concern.

**Why not JSON.parse/stringify?** `undefined` values are dropped by JSON serialization. `null` works fine, but the asymmetry between `undefined` and `null` in JavaScript state could cause subtle bugs. The custom clone preserves all values consistently.

---

## Subsystem Boundary

The State Manager imports only from:
- `../schema-engine/index.js` (public API) — for `StateModel` and `StateField` types
- `./types.js` (internal) — for `StateChangeEvent`, `StateChangeListener`, `StateSnapshot`

It does NOT import from:
- Any V1 game module
- Any engine internals (room-manager, score-engine, etc.)
- Any Phase Machine or other V2 subsystem

External code should only import from `./index.js` (the public API).
