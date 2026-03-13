# Interaction Primitives — Design Decisions

## Key Design Decisions

### 1. Primitives Are Stateless; Collector Is Stateful

**Decision:** `InteractionPrimitive` objects only implement `validate()`. All tracking of *who* has submitted and *what* they submitted lives in `InputCollector`.

**Rationale:**
- Separates the concern of "is this payload valid?" from "has this player submitted this phase?"
- A primitive can be created once and reused across many phases and rooms without any reset/teardown lifecycle.
- `InputCollector` has a clear lifecycle: created per `input_gate` phase, reset between rounds, discarded on phase exit.

**Alternatives considered:**
- Combining validation and tracking into a single object: rejected because it complicates reuse and makes it harder to swap primitives without resetting tracking state.

---

### 2. Primitive Registry Is a Module-Level Singleton

**Decision:** `factories` is a `Map<string, PrimitiveFactory>` declared at module level. `registerPrimitive`, `createPrimitive`, and `hasPrimitive` operate on this shared map.

**Rationale:**
- Game schemas reference primitive types by name (`text_submit`, `vote`, etc.). A global registry means any module can register a type once at startup and it's available everywhere.
- Module-level singletons are the standard Node.js pattern for registries — no need for a class, DI container, or context propagation.
- Primitive factories are pure functions (config → validator) — there is no mutable session-level state in the registry itself.

**Alternatives considered:**
- Per-interpreter registry instance: rejected as overly complex. Primitive types are global by nature (just as HTTP methods or MIME types are).
- Registry class with constructor injection: rejected — adds boilerplate for no real benefit in a server-side singleton context.

---

### 3. Four Built-In Primitives Registered at Module Load

**Decision:** `choice`, `text_submit`, `vote`, and `confirm` are pre-registered at the bottom of `registry.ts` via side effect when the module is first imported.

**Rationale:**
- These four primitives cover the vast majority of game input patterns observed in V1 modules.
- Module-level registration means importers don't need to explicitly call a `bootstrap()` function — the primitives are always available.
- Custom primitives can extend or replace any of them via `registerPrimitive()` after import.

**Alternatives considered:**
- Explicit `initPrimitives()` call: rejected — easy to forget, provides no real benefit, all callers want the built-ins available.

---

### 4. `vote` Accepts Any Non-Empty String When `validTargets` Is Absent

**Decision:** `createVotePrimitive` only validates against a `validTargets` list if one is provided. Without it, any non-empty string is accepted.

**Rationale:**
- At vote phase startup, valid target IDs are often dynamic (current player IDs, shuffled options). Schema-declared `validTargets` would be stale by game time.
- The Interpreter can set up a `vote` primitive with `validTargets` populated at phase setup time when the exact set is known.
- In Phase 1, the interpreter passes an empty config to keep it simple — validation is loose but not absent (empty strings are rejected).

**Trade-off:** Without `validTargets`, players can technically vote for arbitrary strings. The Interpreter layer is responsible for enforcing semantic validity when needed.

---

### 5. `InputCollector` Rejects Unknown Players

**Decision:** `submit()` returns `{ accepted: false }` if the `playerId` is not in the `requiredPlayerIds` set passed to the constructor.

**Rationale:**
- Prevents spectators or disconnected-then-reconnected players from submitting during a phase they weren't part of.
- Keeps the "all required submitted" check simple — there's no need to filter the submission map against required IDs separately.

**Alternatives considered:**
- Accepting any player and only checking `allRequiredSubmitted` against required IDs: rejected because it stores data for players who shouldn't be participating, complicating `getAllSubmissions()` results.

---

### 6. `getAllSubmissions()` Returns a Defensive Copy

**Decision:** `getAllSubmissions()` returns `new Map(this.submissions)` rather than the internal map.

**Rationale:**
- Callers (e.g. `score_round` handlers) should not mutate the collector's internal state.
- Cheap to copy — the map is small (one entry per player) and payloads are primitive values or small objects.

---

### 7. No `InputSubmission` Type Used in `InputCollector`

**Decision:** `InputCollector` stores payloads as `Map<string, unknown>` (not `Map<string, InputSubmission>`), even though `InputSubmission` is a public type.

**Rationale:**
- `InputSubmission` includes `primitiveType` and `timestamp` fields that the Interpreter doesn't currently use.
- Storing raw payloads keeps the map simple, avoids per-submission object allocation, and makes `getSubmission()` return the value directly.
- `InputSubmission` remains in the public API for future use (e.g. a scoring engine that needs timestamps or type info), but the collector doesn't impose it.

---

## Subsystem Boundary Documentation

**`interaction-primitives` imports FROM:**
- Nothing — this subsystem has zero runtime dependencies on other V2 subsystems.

**`interaction-primitives` is imported BY:**
- `interpreter/declarative-game-module.ts` — calls `createPrimitive()` to build validators from schema config; instantiates `InputCollector` per `input_gate` phase; calls `submit()`, `hasSubmitted()`, `getSubmission()`, and `allRequiredSubmitted()`.

---

## Trade-Offs & Future Improvement Paths

1. **`validTargets` must be set at construction time:** `createVotePrimitive` takes `validTargets` as config. Dynamic targets (e.g. current player IDs) must be resolved before creating the primitive — no way to update the set after construction. A mutable `setValidTargets()` method could be useful.

2. **No `InputSubmission` timestamps in practice:** The `InputSubmission` type in `types.ts` includes a `timestamp` field, but `InputCollector` doesn't record it. If submission ordering or latency analysis is needed, the collector would need to store full `InputSubmission` records.

3. **One-player-one-vote enforcement:** `InputCollector` rejects duplicate submissions from the same player. For games that allow changing answers before phase completion, a `resubmit` option or `overwriteSubmit()` method would be needed.

4. **Per-player submission events:** There is no callback mechanism when a player submits (only `allRequiredSubmitted()` polling). An `onPlayerSubmit` callback would let the Interpreter broadcast real-time "X has answered" indicators without polling the collector.

5. **Phase-level primitive config is static:** Primitive config comes from the game schema at phase setup time. Dynamic config (e.g. max text length that depends on round state) would require the Interpreter to resolve the config values before calling `createPrimitive()`.
