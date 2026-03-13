# Interpreter — Design Decisions

## Key Design Decisions

### 1. `DeclarativeGameModule` Implements V1 `GameModule` — Zero Kernel Changes

**Decision:** Rather than building a new kernel dispatch path for V2 games, `DeclarativeGameModule` implements the existing `GameModule` interface verbatim.

**Rationale:**
- The architecture plan's core migration strategy is "hybrid coexistence" — V1 and V2 games must run side-by-side during transition.
- The V1 kernel already knows how to drive a `GameModule`: `setup`, `handleInput`, `getPhaseState`, `getPublicState`, `getPrivateState`, `teardown`. Reusing this interface costs nothing and avoids a big-bang migration.
- Any regression in the kernel that affects V1 games will surface in V2 games too — unified test surface.

**Alternatives considered:**
- New `DeclarativeGameKernel` that bypasses the V1 kernel: rejected (requires kernel modifications, breaks hybrid coexistence, large scope).
- Adapter class wrapping a separate `DeclarativeGameRunner`: considered but rejected — adds indirection for no real gain at Phase 1.

---

### 2. Per-Room State Stored in a `Map<string, RoomState>`

**Decision:** `DeclarativeGameModule` is a **singleton per game** (one instance for all rooms). Per-room state (`StateManager`, `PhaseMachine`, `InputCollector`, etc.) is stored in `this.rooms` keyed by `roomId`.

**Rationale:**
- V1 `GameModule` is already a singleton per game — each game registers one module instance, and the kernel calls it with different `roomId`s.
- Storing per-room state in the module (rather than creating a new module per room) matches the V1 contract exactly.
- Cleanup is explicit: `teardown(roomId)` removes the entry from the map and calls `phaseMachine.destroy()`.

**Alternatives considered:**
- One module instance per room: would require changing the game registry and kernel — rejected (out of scope for Phase 1, breaks V1 compatibility).

---

### 3. `onPhaseChange` Callback Closes Over `RoomState` by Reference

**Decision:** The `onPhaseChange` callback passed to `PhaseMachine` captures `roomState` by reference (via `this.rooms.get(roomId)`), not by value at construction time.

**Rationale:**
- `roomState.phaseMachine` is set *after* the `RoomState` object is created (because `PhaseMachine` needs the callbacks, which need `roomState`). Using a reference avoids a chicken-and-egg initialization problem.
- The pattern is explicitly documented in a code comment (`// NOTE: callbacks close over roomState by reference`).

**Alternatives considered:**
- Two-phase initialization (create state without `phaseMachine`, then set it): this is exactly what the current code does — `phaseMachine` is initialized as `null as unknown as PhaseMachine` and filled in immediately after construction. The reference close pattern is the cleanest solution without restructuring the constructor.

---

### 4. Input Validation Runs Through Both `InputCollector` and `PhaseMachine`

**Decision:** `handleInput` validates and records the submission in `InputCollector` first, then delegates to `PhaseMachine.submitInput()` for state storage and completion checking.

**Rationale:**
- `InputCollector` provides primitive-level validation (payload shape, duplicates, unknown player rejection) and tracks submissions for `buildPrivateState()` queries.
- `PhaseMachine.submitInput()` writes the value to `StateManager` and triggers phase completion when all required players have submitted.
- The two layers are complementary: if `InputCollector` accepts but `PhaseMachine` rejects (e.g. `advancing` flag is set), the overall result is rejected. This prevents the private state from reflecting a submission that didn't take effect.

**Alternatives considered:**
- Only `PhaseMachine.submitInput()`: loses primitive validation and the ability to query per-player submission status from `buildPrivateState()`.
- Only `InputCollector`: the phase machine never learns about submissions, so it can't trigger phase completion.

---

### 5. `extractInputValue` Normalizes Payload Shape

**Decision:** `handleInput` receives a `Record<string, unknown>` payload from the kernel. `extractInputValue` extracts the canonical value by checking common keys in priority order: `value`, `answer`, `choice`, `target`, `text`, single-key fallback, then the whole payload.

**Rationale:**
- V1 game clients send payloads in a variety of shapes (some use `{answer: "foo"}`, some use `{value: "foo"}`). A normalization step in the interpreter means primitives only have to validate the canonical value, not parse arbitrary key names.
- This is explicitly a V2 convention — future clients should send `{value: ...}` for all input types, but the fallback chain handles legacy shapes gracefully.

**Alternatives considered:**
- Schema-declared payload key name: games could declare `input.key: "answer"` and the interpreter would extract `payload[inputDef.key]`. Deferred to Phase 2 as a nice-to-have; the fallback chain handles the common cases without schema changes.

---

### 6. `buildPublicState` Uses `ProjectionEngine` with Spectator Audience

**Decision:** `buildPublicState` creates a `spectator` audience and runs the state snapshot through `ProjectionEngine.project()`. Private fields declared in the schema are redacted.

**Rationale:**
- Visibility rules are declared per-field in the game schema (`visible_to: public`, `visible_to: owner_only`, etc.). `ProjectionEngine` enforces these rules — the interpreter shouldn't need to know which fields are sensitive.
- Using a `spectator` audience for the public state ensures that even screen-sharing spectators see only what the schema author intended.

**Alternatives considered:**
- Returning the raw `stateManager.snapshot()` for public state: rejected — exposes all fields including private ones, breaking any game that uses `visible_to: owner_only` fields.

---

### 7. Phase 1 Stubs for `score_round`, `content_draw`, `shuffle_and_merge`

**Decision:** These actions are logged and silently skipped rather than throwing.

**Rationale:**
- Games that declare these actions in their schema shouldn't crash in Phase 1 — they should just not produce the intended effect.
- The stubs are clearly marked with their target phase (e.g. `// Phase 3 feature`) so the implementation path is obvious.
- `score_round` logs "scoring engine ready" to indicate that the plumbing exists; only the formula evaluation is deferred.

**Alternatives considered:**
- Throwing `NotImplementedError`: would prevent any game using these actions from running at all in Phase 1, blocking early testing of non-scoring game flow.

---

### 8. Initial Phase is the First Key in `GamePackage.phases`

**Decision:** `getInitialPhaseId()` returns `Object.keys(this.gamePackage.phases)[0]`.

**Rationale:**
- YAML parsers preserve key insertion order. Schema authors naturally write phases in execution order, with the first phase being the entry point.
- No `initial_phase:` field in the manifest is required — convention over configuration for the common case.
- Game authors who need a non-first entry point can add an `initial_phase:` manifest field — `getInitialPhaseId()` can be updated to check for this in Phase 2.

**Alternatives considered:**
- Explicit `manifest.initial_phase` field: adds schema complexity for Phase 1 where all games naturally start with their first phase. Deferred to Phase 2.

---

## Subsystem Boundary Documentation

**`interpreter` imports FROM:**
- `../../games/game-module.js` — `GameModule` interface
- `../../games/game-context.js` — `GameContext` interface
- `@boredless/shared` — shared types (`Player`, `PhaseState`, `GameDefinition`, `ServerMessageType`, `RoomStatus`)
- `../schema-engine/index.js` — `GamePackage`, `PhaseAction`, `PhaseNode`
- `../state-manager/index.js` — `StateManager`
- `../phase-machine/index.js` — `PhaseMachine`, `TimerImpl`
- `../interaction-primitives/index.js` — `InputCollector`, `createPrimitive`
- `../visibility/index.js` — `ProjectionEngine`, `Audience`

**`interpreter` is imported BY:**
- `games/` — game package loaders call `new DeclarativeGameModule(definition, pkg)` and register with the game registry
- No other V2 runtime subsystems import the interpreter (it is the top of the V2 dependency tree)

**`interpreter` does NOT import:**
- `event-system` — EventEngine integration is Phase 2
- Any V1 game module (`quiplash`, `trivial`, etc.)

---

## Trade-Offs & Future Improvement Paths

1. **EventEngine not wired:** Phase 1 does not wire `EventEngine` into `DeclarativeGameModule`. Phase 2 will add `EventEngine` construction in `setup()` and wire `onPhaseChange` → `engine.emit({ type: 'phase_enter', phase })` and `stateManager.onChange` → `engine.emit({ type: 'state_change', ... })`.

2. **`score_round` is a stub:** Full scoring requires the Phase 4 rule evaluator. The `handleScoreRound` method exists and is called — it just doesn't do arithmetic yet.

3. **Initial phase by convention:** The first phase key is always the entry point. A `manifest.initial_phase` override field would add flexibility for games with setup/lobby phases that shouldn't auto-start.

4. **No rematch support:** `teardown` is final — the room state is deleted and the phase machine is destroyed. A `restart(roomId)` path would re-run `setup()` with the same players for rematches.

5. **`parseDurationMs` is duplicated:** Both `phase-machine.ts` and `declarative-game-module.ts` define `parseDurationMs`. This should be extracted to a shared utility in `schema-engine` or a new `utils` module.
