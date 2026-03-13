# Boredless V2 — Changelog

This file tracks each phase of the V2 declarative game runtime implementation.
Append entries chronologically — do not reorder or remove existing entries.

---

## Phase 0.1 — Schema Engine
*Completed prior to this changelog*

- GamePackageSchema (Zod), YAML loader, validation
- Test fixture: `games/_test-v2/game.yaml`
- Hybrid loader: V1/V2 detection

## Phase 0.2 — State Manager
*Completed prior to this changelog*

- StateManager class: typed get/set for globals, per-player, per-team
- Schema-driven initialization from defaults
- Change events (observable)
- Snapshot for debugging/replay
- Basic visibility: `getPublicState()` / `getPrivateState()`

## Phase 1.1 — Phase Machine
*Completed prior to this changelog*

- PhaseMachine: timed, input_gate, conditional, loop phases
- Timer integration
- Expression evaluator for transition conditions

## Phase 1.2 — Interaction Primitives
*Completed prior to this changelog*

- Primitive registry: choice, text_submit, vote, confirm
- InputCollector: tracks submissions, detects completion
- Payload validation per primitive schema

## Phase 1.3 — Declarative Game Interpreter
*Completed prior to this changelog*

- DeclarativeGameModule implementing GameModule interface
- Wires StateManager + PhaseMachine + InputCollector
- Bluffalo-equivalent game runs from YAML

---

## Phase 2.1 — Visibility & Projection System
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/visibility/` subsystem:

- **`types.ts`** — `Audience`, `RedactionStrategy`, `FieldVisibility`, `ProjectedState` types
- **`projection-engine.ts`** — `ProjectionEngine` class: audience-aware state projection
- **`index.ts`** — Public API
- **`__tests__/visibility.test.ts`** — 35 comprehensive tests
- **`README.md`** — Subsystem documentation
- **`DECISIONS.md`** — Design decisions and rationale

### Schema Extensions (Non-Breaking)

- Added `'team'` to `VisibilityScopeSchema` in schema-engine
- Added `redaction` field (`RedactionStrategySchema`) to `StateFieldSchema`
- Added `placeholder` field to `StateFieldSchema`
- Exported `RedactionStrategySchema`, `VisibilityScopeSchema` from schema-engine public API

### Interpreter Integration

Updated `DeclarativeGameModule`:
- Creates `ProjectionEngine` during `setup()` (one per room)
- `buildPublicState()` now uses `projectionEngine.project(snapshot, { type: 'spectator' })`
- `buildPrivateState()` now uses `projectionEngine.project(snapshot, { type: 'player', playerId })`
- Backwards compatible — kernel interface unchanged

### Test Count

**35 new tests** (visibility subsystem)
**302 total passing tests** (all subsystems combined)

### Notable Decisions

- Pure projection function: `project()` is stateless and idempotent
- Visibility map compiled at construction time (not per-call)
- Eliminated players see public fields only (more restricted than spectators)
- Fields without visibility declarations default to public (fail-open)
- Team scope stubs to private pending Phase 2.4 (team tracking)
- `meta.redactedFields` in output for debugging visibility behavior

---

## Phase 2.2 — Event System (Declarative)
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/event-system/` subsystem:

- **`types.ts`** — Core type definitions: `EventTrigger`, `EventEffect`, `EventRule`, `FiredEvent`, `EffectContext`, `EventEngineOptions`
- **`event-engine.ts`** — `EventEngine` class: trigger matching, priority-ordered execution, guard conditions, once-only rules, enable/disable, history tracking
- **`schema-integration.ts`** — Zod schemas (`EventRuleSchema`, `EventTriggerSchema`, `EventEffectSchema`, `EventRulesArraySchema`) and `parseEventRules()` / `safeParseEventRules()`
- **`index.ts`** — Public API
- **`__tests__/event-system.test.ts`** — 59 comprehensive tests
- **`README.md`** — Subsystem documentation
- **`DECISIONS.md`** — Design decisions and rationale

### Schema Extension (Non-Breaking)

- Updated `schema-engine/schema.ts`: `EventsSchema` now uses `EventRulesArraySchema` from event-system (was `z.array(z.any())`)
- Updated `games/_test-v2/game.yaml` to include example `events:` section
- Fixed `schema-engine/__tests__/schema-engine.test.ts`: updated test fixture to use valid event structure (triggers/effects plural)

### Trigger Types Supported
`phase_enter`, `phase_exit`, `state_change`, `input_received`, `timer_expire`, `game_start`, `game_end`

### Effect Types Supported
- **Native (handled by engine):** `set_state`, `increment`, `decrement`
- **Delegated (via onEffect callback):** `add_points`, `broadcast`, `play_sound`, `announce`, `advance_phase`, `custom`

### Test Count

**59 new tests** (event-system subsystem)  
**426 total passing tests** (all subsystems combined)

### Notable Decisions

- **Standalone engine**: EventEngine has no direct dependencies on PhaseMachine, Interpreter, or WS layer. Callers wire it via emit() calls and the onEffect callback — eliminates circular dependencies.
- **Callback-driven condition evaluation**: `evaluateCondition` is injected optionally, allowing tests to use real or custom evaluators without coupling to phase-machine internals.
- **Trigger OR semantics**: A rule fires if ANY trigger matches. Effects within a rule all execute in order (AND semantics).
- **Native vs delegated effects**: Only state mutations (set_state/increment/decrement) are handled natively. All display/audio/scoring effects delegate to the onEffect callback.
- **Schema-first**: `EventRulesArraySchema` is now the canonical Zod schema for events in game packages, replacing the `z.array(z.any())` stub.
