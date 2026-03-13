# Phase Machine — Design Decisions

## Key Design Decisions

### 1. Timer Abstraction (`TimerImpl`) for Testability

**Decision:** `PhaseMachine` accepts an optional `timerImpl` parameter (defaulting to the `timerEngine` singleton) rather than calling `timerEngine` directly everywhere.

**Rationale:**
- The V1 `timerEngine` singleton sends WebSocket messages (`sendToSessions`) internally — calling it in unit tests would require a full WS infrastructure mock.
- By accepting `TimerImpl`, tests can inject a controllable stub (e.g. a `TestTimer` with a manual `trigger()` method) and exercise timer expiry without any async complexity.
- Production code paths are unchanged — the default `timerEngine` is wired automatically.

**Alternatives considered:**
- `vi.useFakeTimers()` only: rejected because `timerEngine` uses `setInterval` *and* WS calls; faking timers handles the former but the WS side still blows up.
- Wrapping `timerEngine` in a module-level mock: rejected as invasive and fragile across different test isolation strategies.

---

### 2. `advancing` Guard to Prevent Double-Advance

**Decision:** A boolean `advancing` flag is set to `true` at the start of `exitPhase`/`completePhase` and is checked in both methods as an early return.

**Rationale:**
- Race condition: an `input_gate` phase can fire `completeInputGate()` *and* the optional timeout timer can fire simultaneously. Without a guard, both paths call `enterPhase()`, resulting in duplicate transitions.
- The flag is reset at the top of each `enterPhase()` call so it doesn't bleed into the next phase.

**Alternatives considered:**
- Cancelling the timer before both paths: partially mitigates but doesn't close the race window if the timer callback is already queued.
- Promise-based sequential queue: rejected as over-engineering for the single-timer-per-room model.

---

### 3. Phase Exit via `on_exit` Actions, Not a Hardcoded `next:` Field

**Decision:** `exitPhase` executes all `on_exit` actions and captures any `advance` action's `to:` value as the next phase. It does *not* require a top-level `next:` key on the phase node.

**Rationale:**
- The schema design puts transition targets *inside actions* (`on_exit: [{action: advance, to: next_phase}]`), not as a top-level `next:` key.
- A `conditional` action in `on_exit` can inspect state and branch to different targets — enabling dynamic routing without any game-specific code.
- An `on_exit` with no `advance` action results in `null`, which correctly triggers `onGameEnd()`.

**Alternatives considered:**
- Top-level `next: phase_id` on each phase: simpler to parse but can't express conditional branching without a separate `next_if` / `next_else` convention, which duplicates what the `conditional` action already provides.

---

### 4. `conditional` Phase Uses `Promise.resolve()` Microtask Deferral

**Decision:** `startConditionalPhase` wraps its logic in `Promise.resolve().then(...)`, deferring execution to the next microtask.

**Rationale:**
- Without the deferral, callers would receive the `onPhaseChange` callback for the conditional phase *and* the `onPhaseChange` for the next phase in the same synchronous call stack — before any broadcasting can run.
- The microtask ensures the conditional phase is observable for at least one event-loop tick, matching the behavior of `timed` phases (which call `onPhaseChange` then start the timer asynchronously).
- A stale-reference guard (`if (!this.currentPhaseNode || this.currentPhaseNode !== phaseNode)`) prevents the microtask from acting on a destroyed phase machine.

**Alternatives considered:**
- `setImmediate` / `setTimeout(fn, 0)`: defers to the macro-task queue, interleaving with I/O and producing less predictable ordering in tests.
- Fully synchronous transition: would fire `enterPhase` inside the `onPhaseChange` callback, causing re-entrant transitions and difficult-to-reason-about call stacks.

---

### 5. Expression Evaluator: String-Splitting, No AST

**Decision:** `evaluateCondition` splits on ` AND ` / ` OR ` and delegates each clause to a linear operator scan — no tokenizer, no AST.

**Rationale:**
- Game schema conditions are simple comparisons (`globals.round < globals.total_rounds`). A full parser is massive overkill for Phase 1.
- Space-padded `AND` / `OR` avoids ambiguity with `&&` / `||` and is visually clear in YAML.
- Left-to-right evaluation with no operator precedence is explicitly documented — authors who need complex logic should use extension evaluators (Phase 4).

**Alternatives considered:**
- `eval()` / `new Function()`: rejected (unsafe sandbox escape, no type safety).
- Third-party expression library (e.g. `expr-eval`): rejected (unnecessary dependency; pulls in arithmetic/function capabilities we don't want authors to rely on).
- Full recursive descent parser: rejected for Phase 1; planned for Phase 4.

---

### 6. `loop` Phase Type Aliased to `timed` (Phase 1 Stub)

**Decision:** In the `enterPhase` switch statement, `loop` is handled identically to `timed`.

**Rationale:**
- The architecture plan includes a `loop` type for repeating phase sub-graphs, but full loop semantics (iteration count, sub-graph tracking) are deferred to Phase 2.
- Treating `loop` as `timed` means games declaring a `loop` phase won't crash — they run as a timed phase, which is a safe, documented stub.

**Trade-off:** Authors who write a `loop` phase expecting iteration behavior will get timed behavior. The README documents this limitation.

---

### 7. `onAction` Delegation Instead of an Exhaustive Native Action List

**Decision:** Any action with an unrecognized `action` field falls through to `options.onAction`. Only `advance`, `conditional`, `increment`, `set`, and `reset_players` are handled natively.

**Rationale:**
- Phase Machine should not grow to contain game-level actions (`score_round`, `content_draw`, etc.).
- Delegating unknown actions to the Interpreter keeps subsystem boundaries clean and allows new actions to be added without modifying `PhaseMachine`.
- Native actions were chosen because they directly manipulate state that `PhaseMachine` already owns: `StateManager` mutations and phase transitions.

---

## Subsystem Boundary Documentation

**`phase-machine` imports FROM:**
- `../schema-engine/index.js` — `Phases`, `PhaseNode`, `PhaseAction` types
- `../state-manager/index.js` — `StateManager` class
- `../../engine/timer-engine.js` — V1 timer singleton (default `TimerImpl` backend)

**`phase-machine` is imported BY:**
- `interpreter/declarative-game-module.ts` — constructs and drives `PhaseMachine` per room
- `event-system/README.md` — documents using `evaluateCondition` as the condition evaluator callback

**`phase-machine` does NOT import:**
- `interaction-primitives` — input validation is the Interpreter's responsibility
- `event-system` — the Interpreter wires event rules via callbacks after phase transitions
- Any V1 game modules

---

## Trade-Offs & Future Improvement Paths

1. **`getPerPlayerDefault` stub:** `reset_players` resets all per-player fields to `null` rather than their schema-declared defaults. Full implementation requires `StateManager` to expose the `stateModel`. Tracked for Phase 2.

2. **`per_player` increment not supported in native actions:** The `increment` action only applies to `globals.*` targets. Per-player increments from phase actions require the `onAction` delegation pattern. Planned for Phase 2.

3. **`loop` phase semantics:** Phase 1 treats `loop` identically to `timed`. Full loop semantics (child phase sub-graph, iteration count, break condition) are a Phase 2 deliverable.

4. **Expression precedence:** `AND` / `OR` are evaluated left-to-right with no grouping. The Phase 4 rule evaluator should introduce a proper parser with `()` support, arithmetic, and function calls.

5. **`start()` is one-shot:** `PhaseMachine` cannot be restarted after `destroy()`. This is intentional — create a new instance per game session. A `restart()` method for rematch support is a potential future addition.
