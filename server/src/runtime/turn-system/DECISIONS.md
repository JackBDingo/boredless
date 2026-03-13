# Turn System — Design Decisions

## Key Decisions

### 1. Standalone Subsystem (No State Manager Dependency)

**Decision:** TurnManager does not import from StateManager. It manages its own internal state (`_turnOrder`, `_currentIndex`, etc.).

**Rationale:** The turn system needs to work as a standalone component that can be:
- Unit tested without a full game stack
- Used independently by callers who may or may not have a StateManager
- Composed with StateManager by the interpreter layer (Phase 2.4's consumer), not mandated internally

**Alternative considered:** Storing turn state in StateManager fields (e.g. `globals.currentPlayerId`). Rejected because it would couple TurnManager to StateManager's API and make it impossible to test turn logic independently.

**Trade-off:** Caller (interpreter/DeclarativeGameModule) must sync TurnManager state to StateManager if they want it in public/private state projections. This is an acceptable trade-off — the interpreter knows both subsystems and can bridge them.

---

### 2. Event Callback (Not Observer Pattern)

**Decision:** TurnManager accepts a single `onTurnEvent` callback rather than an EventEmitter or observable.

**Rationale:**
- Single callback is simpler and matches the pattern used throughout the codebase (PhaseMachine uses `onPhaseChange`, `onAction`, `onGameEnd`)
- No dependency on Node.js EventEmitter (keeps subsystem portable)
- Synchronous callbacks make test assertions straightforward

**Alternative considered:** EventEmitter or rxjs observable. Rejected as overkill for a synchronous, single-consumer use case.

---

### 3. Five Turn Models (Not Three)

**Decision:** Added `free_form` and `elimination` beyond the three specified in the architecture plan.

**Rationale:**
- `free_form` covers lobby-style games and any game where turn ordering is irrelevant (e.g. simultaneously exploring a dungeon). Without it, callers would have to use `simultaneous` which increments rounds unnecessarily.
- `elimination` covers games like Survivor/Last Standing where the primary mechanic IS player removal. Without a dedicated model, callers would need to awkwardly combine `simultaneous` with manual elimination tracking.
- Both models are referenced in the architecture plan's victory conditions (`last_standing`) and game examples.

**Risk:** Slight scope expansion. Mitigated by the models being simple (both are essentially "all remaining players are active").

---

### 4. No Timer Ownership

**Decision:** TurnManager tracks `timeoutMs` config but owns no timers.

**Rationale:** The architecture plan explicitly says "Use the existing timer engine for turn timeouts — just track the timeout config, let the caller manage actual timers." Timer ownership in multiple subsystems leads to coordination bugs. The interpreter/caller manages the actual timer using `stateManager.model.timeoutMs` and calls `skipPlayer()` on expiry.

**Trade-off:** Callers need slightly more wiring. But it keeps TurnManager testable without fake timer injection.

---

### 5. `_turnOrder` Preserves Eliminated Players

**Decision:** Eliminated players remain in the `_turnOrder` array; they're just marked in `_eliminated`. Only `getRemainingPlayers()` filters them out.

**Rationale:**
- Index-based navigation (round_robin `_currentIndex`) needs a stable array to wrap around in. If we removed players, indices would shift.
- Priority queue advancement uses `findIndex` which needs stable array positions.
- Preserving the array keeps wrap-around detection simple (compare old vs new index).

**Alternative considered:** Removing from array and rebuilding indices. Rejected because it complicates wrap detection and makes the code harder to reason about.

---

### 6. Priority Queue Uses `_currentIndex`, Not a Separate Queue

**Decision:** Priority queue reuses `_currentIndex` to track position in the ordered `_turnOrder` array, advancing forward through it.

**Rationale:** Avoids maintaining a second data structure. The turn order itself IS the priority queue. `advancePriorityQueue` simply finds the next non-eliminated player strictly after `_currentIndex`.

**Key behavior:** `getActivePlayerIds()` for priority_queue uses `_getFirstNonEliminatedFrom(_currentIndex)` to handle the case where the player at currentIndex gets eliminated mid-turn.

---

### 7. Immutable State Snapshots

**Decision:** `getState()` returns deep copies of Sets (not references to internal Sets).

**Rationale:** Prevents callers from accidentally mutating turn state by doing `state.eliminated.add(...)`. The snapshot is a point-in-time view, not a live reference.

**Trade-off:** Small allocation overhead per `getState()` call. Acceptable for a turn-based social game where turns happen at human speed.

---

### 8. `reverseDirection()` Throws Instead of No-Op

**Decision:** Calling `reverseDirection()` when `model.reverseAllowed` is false throws an error rather than silently doing nothing.

**Rationale:** Silent no-ops hide bugs. If a caller invokes `reverseDirection()` on a game that doesn't support it, that's a programming error that should be caught loudly at development time. Production games that use reversal declare `reverse_allowed: true` in their YAML; games that don't use it simply never call this method.

---

## Alternatives Considered

### Alternative: Pure State Object (No Class)

A pure function approach: `advanceTurn(state, model) → newState`. Rejected because:
- Immutable updates would require callers to track state themselves
- The event callback would become an awkward return value
- Class encapsulation makes the API cleaner and matches subsystem patterns

### Alternative: Combine with Phase Machine

TurnManager functionality could live inside PhaseMachine. Rejected because:
- Phase Machine is already complex (300+ lines)
- Turn management is orthogonal to phase transitions
- Some games may want turn management without a full phase machine
- Subsystem boundary discipline: one concern per module

---

## Subsystem Boundary Documentation

**This subsystem imports from:**
- Nothing in the runtime (standalone)
- `zod` (schema validation)

**This subsystem exports to:**
- `interpreter/` (DeclarativeGameModule — will use TurnManager to drive active player state)
- Any future Phase 2.5+ subsystem that needs turn tracking

**Never directly access:**
- `turn-manager.ts`, `types.ts`, `schema-integration.ts` — use `index.ts` only

---

## Future Improvement Paths

1. **Team alternating model**: Teams take turns rather than individuals. Requires team membership tracking. Defer to when teams are needed.
2. **Interrupt model**: A player can "interrupt" another's turn (e.g. play a reaction card). Could be modeled as a temporary priority queue insertion.
3. **Weighted random**: Turn order determined by random draw weighted by a score/stat. Add `shuffle: 'weighted'` option.
4. **Turn timer integration**: If callers want automatic timer management, could add a `TimerImpl` injection (like PhaseMachine does) — but keep it optional.
