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
