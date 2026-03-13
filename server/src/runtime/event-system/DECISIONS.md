# Event System — Design Decisions

## Key Design Decisions

### 1. Standalone Engine, Callback-Driven Integration

**Decision:** EventEngine is completely standalone. It doesn't subscribe to StateManager events or call PhaseMachine directly. Callers wire these integrations via callbacks and explicit `emit()` calls.

**Rationale:**
- Avoids circular dependencies between subsystems
- Makes testing trivial — no complex mock setup for WS/timer/phase dependencies
- Gives the interpreter full control over when and how events flow
- Matches the architecture plan: "Trigger registry... Effect executor... Event declarations in game schema"

**Alternatives considered:**
- Auto-subscribe to StateManager.onChange() in constructor → rejected (couples engine to specific StateManager API, complicates reset/teardown, harder to test)
- EventBus singleton → rejected (global state, harder to scope per game session)

---

### 2. Native vs Delegated Effects

**Decision:** `set_state`, `increment`, and `decrement` are handled natively. All other effects (`announce`, `broadcast`, `play_sound`, `advance_phase`, `add_points`, `custom`) delegate to the `onEffect` callback.

**Rationale:**
- State mutations are the most common effect and benefit from direct implementation
- Other effects require context the engine doesn't have: broadcast needs WS connections, advance_phase needs Phase Machine, play_sound needs media pipeline
- Clean separation: engine owns what it can fully implement; everything else is the caller's responsibility

**Trade-off:**
- `per_player.field` targets in native effects (set_state/increment/decrement) require a `playerId` which the engine doesn't have. This is documented and warned. Per-player mutations from events should use the `onEffect` callback pattern.
- Future: add a `playerId` field to EventEffect, or a separate `set_player_state` effect type

---

### 3. Trigger Matching: OR Within a Rule

**Decision:** A rule fires if ANY of its triggers match the emitted event (OR semantics). All effects in the rule then execute (AND semantics).

**Rationale:**
- Most games need "fire on A OR B" (e.g. "on game_start OR on phase_enter:intro")
- AND semantics for multiple simultaneous triggers would require buffering and complex multi-event coordination
- OR semantics is simpler, covers the common case, and matches how most event systems work

**Alternatives considered:**
- AND triggers (rule only fires when all triggers have fired): rejected as overly complex for Phase 2, can be added in Phase 4 rule evaluator
- Per-trigger effects: rejected as verbose and unexpected

---

### 4. Guard Conditions on Individual Triggers

**Decision:** The `condition` field lives on `EventTrigger`, not on `EventRule`. This means a rule can have multiple triggers with different conditions.

**Rationale:**
- "When entering play with round < 5" and "when entering play with round >= 5" can be two triggers on the same rule
- More expressive than one condition per rule
- The condition is naturally associated with the matching trigger's context

**Trade-off:**
- Slightly more complex matching logic (must check condition on the matching trigger, not just the rule)

---

### 5. Priority + Stable Declaration Order

**Decision:** Rules are sorted by priority (higher first). Same-priority rules maintain their original declaration order (stable sort).

**Rationale:**
- Priority ordering gives game designers control over effect sequencing
- Stable sort preserves the human-authored order when priorities are equal
- Predictable and testable

---

### 6. `once` vs `enabled` Are Orthogonal

**Decision:** `once` (auto-exhausts after first fire) and `enabled` (explicitly toggled) are separate concerns tracked separately.

**Rationale:**
- `reset()` re-enables `once` rules but does NOT change `enabled` status
- This lets designers disable rules permanently at runtime while still having once-only rules that reset between games
- Clear separation of concerns

---

### 7. Schema Integration: EventRulesArraySchema Imported by schema-engine

**Decision:** `schema-engine/schema.ts` imports `EventRulesArraySchema` from `event-system/schema-integration.ts` to replace the previous `z.array(z.any())` stub.

**Rationale:**
- Game packages can now have fully validated `events:` sections
- Single source of truth for event rule shape (defined in event-system, consumed by schema-engine)
- No circular dependency: schema-engine → event-system/schema-integration → zod only

**Alternatives considered:**
- Keeping `z.array(z.any())` in schema-engine and validating separately: rejected as duplication
- Defining EventRuleSchema in schema-engine: rejected (violates subsystem boundaries — event types belong in the event-system subsystem)

---

## Subsystem Boundary Documentation

**Imports FROM event-system:**
- `schema-engine/schema.ts` → imports `EventRulesArraySchema` (schema only, no runtime code)
- Future: `interpreter/declarative-game-module.ts` → imports `EventEngine`, `parseEventRules` (Phase 2 integration)

**event-system imports FROM:**
- `zod` (schema validation)
- `state-manager/index.ts` (StateManager type — used as a structural interface, not a concrete class import in the engine itself; the engine accepts the interface)

**event-system does NOT import:**
- `phase-machine` — no dependency (caller wires condition evaluator via callback)
- `interaction-primitives` — no dependency
- `interpreter` — no dependency
- Any V1 game modules

---

## Future Improvement Paths

1. **Per-player increment/decrement**: Add `playerId` field to `EventEffect` or a dedicated `set_player_state` effect type to enable native per-player mutations from event rules.

2. **AND trigger composition**: Phase 4 rule evaluator could support `trigger_all: [...]` to require multiple events before firing.

3. **Event chaining**: Allow effects to emit new triggers (with cycle detection), enabling cascade logic.

4. **Conditional effect branches**: `if/then/else` within an effect group, similar to Phase Machine's conditional action.

5. **Scoped listeners**: Subscribe to specific trigger types via `engine.on('phase_enter', handler)` API for deeper integration patterns.

6. **Persistent state for once-only rules**: Serialize `hasFired` state so once-only rules survive reconnects/restore.
