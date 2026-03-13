# Boredless V2 Runtime

The V2 runtime is a **declarative game operating system**. Games are structured data packages (YAML) interpreted by the runtime kernel — not custom code that calls the runtime ad hoc. V1 imperative modules coexist with V2 declarative packages in the same process.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     GAME PACKAGE (data)                     │
│          game.yaml  —  manifest · state_model · phases      │
│          turn_model · scoring · victory · presentation      │
└────────────────────────────┬────────────────────────────────┘
                             │ loadGamePackage()
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     SCHEMA ENGINE                           │
│   schema-engine/   Validates YAML → typed GamePackage       │
└────────────────────────────┬────────────────────────────────┘
                             │ GamePackage (typed)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  DECLARATIVE INTERPRETER                    │
│   interpreter/    Implements GameModule interface           │
│                   One StateManager + PhaseMachine per room  │
│                                                             │
│   ┌────────────────────┐  ┌─────────────────────────────┐   │
│   │   STATE MANAGER    │  │      PHASE MACHINE          │   │
│   │  state-manager/    │  │   phase-machine/            │   │
│   │                    │  │                             │   │
│   │  globals           │◄─│  timed / input_gate /       │   │
│   │  per_player        │  │  conditional / loop         │   │
│   │  per_team (stub)   │  │  evaluateCondition()        │   │
│   │  getPublicState()  │  │  submitInput()              │   │
│   │  getPrivateState() │  │  onAction callback          │   │
│   └────────────────────┘  └─────────────┬───────────────┘   │
│                                         │ input routing      │
│                            ┌────────────▼──────────────┐    │
│                            │  INTERACTION PRIMITIVES   │    │
│                            │  interaction-primitives/  │    │
│                            │                           │    │
│                            │  choice / text_submit /   │    │
│                            │  vote / confirm           │    │
│                            │  InputCollector           │    │
│                            │  PrimitiveRegistry        │    │
│                            └───────────────────────────┘    │
└────────────────────────────┬────────────────────────────────┘
                             │ GameModule interface
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    V1 KERNEL (unchanged)                    │
│   engine/   RoomManager · TimerEngine · ScoreEngine        │
│             WebSocket · GameContext · auto-discover.ts      │
└───────────────┬──────────────────┬──────────────────────────┘
                │                  │
         ┌──────▼──────┐    ┌──────▼──────┐
         │  Display    │    │   Phones    │
         │  (TV/WS)    │    │ (Players/WS)│
         └─────────────┘    └─────────────┘
```

### Data Flow

```
YAML file
  └─→ loadGamePackage()               [schema-engine]
        └─→ GamePackage (typed)
              └─→ DeclarativeGameModule.setup()     [interpreter]
                    ├─→ new StateManager(stateModel, playerIds)  [state-manager]
                    ├─→ new PhaseMachine(phases, stateManager, opts)  [phase-machine]
                    │     └─→ enterPhase(initialPhaseId)
                    │           ├─→ executeActions(on_enter)
                    │           ├─→ timerEngine.start()
                    │           └─→ opts.onPhaseChange() → ctx.broadcastPhase()
                    └─→ handleInput(roomId, playerId, type, payload)
                            └─→ InputCollector.submit(playerId, value)
                                  └─→ PhaseMachine.submitInput()
                                        └─→ stateManager.setPlayer()
                                              └─→ [all submitted] → phase advance
```

---

## Subsystem Inventory

| Subsystem | Directory | Phase | Purpose |
|-----------|-----------|-------|---------|
| **Schema Engine** | `schema-engine/` | 0.1 | Load + validate game YAML → typed `GamePackage` |
| **State Manager** | `state-manager/` | 0.2 | Authoritative state storage; globals, per-player, per-team |
| **Phase Machine** | `phase-machine/` | 1.1 | Drive the phase graph; timers, transitions, expression eval |
| **Interaction Primitives** | `interaction-primitives/` | 1.2 | Validate + collect player input; primitive registry |
| **Interpreter** | `interpreter/` | 1.3 | Ties everything together; implements `GameModule` interface |

Each subsystem exposes only its `index.ts` as a public API. Never import from internal files.

---

## V2 and V1 Coexistence

V2 games coexist with V1 games transparently. The kernel (`auto-discover.ts`) distinguishes them by the presence of `schema_version: "2.0"` in the manifest:

```
auto-discover.ts
  ├── V1 game (no schema_version) → load as GameModule (imperative path)
  └── V2 game (schema_version: "2.0") → load as DeclarativeGameModule
```

`DeclarativeGameModule` implements the same `GameModule` interface as V1 modules. The kernel never knows which type it's running. All WebSocket messages, room management, timers, and scores work identically.

---

## How to Add a New V2 Game

**1. Create the game directory:**
```
games/my-game/
  game.yaml        ← game package (required)
  prompts.json     ← content (optional, Phase 3)
  README.md        ← documentation (recommended)
```

**2. Write `game.yaml` with all required top-level sections:**
```yaml
schema_version: "2.0"

manifest:
  id: my-game          # lowercase-alphanumeric-with-hyphens
  name: My Game
  description: "What players do."
  version: "1.0.0"
  players: { min: 3, max: 8 }

state_model:
  globals:
    round: { type: integer, default: 0 }
    total_rounds: { type: integer, default: 5 }
  per_player:
    score: { type: integer, default: 0, visibility: public }
    answer: { type: string, default: null, visibility: private }

turn_model:
  type: simultaneous    # or: round_robin, priority_queue

phases:
  instructions:
    type: timed
    duration: 8
    on_exit:
      - action: advance
        to: play

  play:
    type: input_gate
    duration: 30
    input:
      primitive: text_submit
      target: per_player.answer
      required: all_players
    on_enter:
      - action: increment
        target: globals.round
    on_complete:
      - action: advance
        to: results

  results:
    type: timed
    duration: 10
    on_exit:
      - action: conditional
        condition: "globals.round < globals.total_rounds"
        then: { advance_to: play }
        else: { advance_to: final_results }

  final_results:
    type: timed
    duration: 15

presentation:
  theme:
    accent: violet
    background: dark

scoring:
  correct_answer: 100

victory:
  type: highest_score
  after: all_rounds
```

**3. Validate the schema:**
```ts
import { loadGamePackage } from './server/src/runtime/schema-engine/index.js';
loadGamePackage('./games/my-game/game.yaml'); // throws with field paths on error
```

**4. Register in the kernel** (until `auto-discover.ts` is wired for V2, construct manually):
```ts
import { loadGamePackage } from '../runtime/schema-engine/index.js';
import { DeclarativeGameModule } from '../runtime/interpreter/index.js';

const pkg = loadGamePackage('./games/my-game/game.yaml');
const definition = { /* GameDefinition from manifest */ };
const module = new DeclarativeGameModule(definition, pkg);
```

**5. Verify V1 games still pass:** `npx vitest run`

---

## How to Add a New Interaction Primitive

**1. Implement the factory in `interaction-primitives/primitives.ts`:**
```ts
export function createMyPrimitive(config: unknown): InteractionPrimitive {
  const cfg = config as { allowedValues?: string[] };
  const allowed = Array.isArray(cfg?.allowedValues) ? cfg.allowedValues : [];

  return {
    type: 'my_primitive',
    validate(payload: unknown): { valid: boolean; error?: string } {
      if (typeof payload !== 'string') {
        return { valid: false, error: 'Payload must be a string' };
      }
      if (allowed.length > 0 && !allowed.includes(payload)) {
        return { valid: false, error: `"${payload}" is not a valid option` };
      }
      return { valid: true };
    },
  };
}
```

**2. Register in `interaction-primitives/registry.ts`:**
```ts
registerPrimitive('my_primitive', createMyPrimitive);
```

**3. Export from `interaction-primitives/index.ts`:**
```ts
export { createMyPrimitive } from './primitives.js';
```

**4. Use in a game schema:**
```yaml
phases:
  my_phase:
    type: input_gate
    input:
      primitive: my_primitive
      options:
        allowedValues: [red, green, blue]
      target: per_player.color_choice
      required: all_players
```

**5. Write tests** in `interaction-primitives/__tests__/interaction-primitives.test.ts`.

---

## How to Extend the Expression Evaluator

`phase-machine/expression-eval.ts` implements a minimal safe expression language. It is intentionally constrained — complex logic belongs in extension evaluators (Phase 4).

**Current capabilities:**
- State refs: `globals.field`, `per_player.field`
- Comparison operators: `<`, `>`, `<=`, `>=`, `==`, `!=`
- Boolean: `AND`, `OR` (case-sensitive, must be space-padded)
- Literals: number, `"string"`, `'string'`, `true`, `false`, `null`

**To add a new value resolver** (e.g. `team.score`):
Edit `resolveValue()` in `expression-eval.ts` to handle the new prefix. Provide the value via the `ExpressionContext` interface.

**To add arithmetic** (Phase 4):
Add arithmetic tokenization before the comparison step. Keep it right-to-left or document precedence explicitly.

**Constraints that must be preserved:**
- No control flow in expressions
- No function calls in expressions
- Expressions must be side-effect free (read-only)
- Every new feature must have tests

---

## Phase Actions Reference

| Action | Handled By | Description |
|--------|-----------|-------------|
| `advance` | PhaseMachine | Transition to named phase: `to: phase_id` |
| `conditional` | PhaseMachine | Branch: `condition`, `then.advance_to`, `else.advance_to` |
| `increment` | PhaseMachine | `target: globals.field` — add 1 |
| `set` | PhaseMachine | `target: globals.field`, `value: x` — assign value |
| `reset_players` | PhaseMachine | Reset all players' `field` to null (schema default lookup is stub) |
| `score_round` | Interpreter | Apply scoring formulas — **stub in Phase 1, no scores applied** |
| `content_draw` | Interpreter | Draw from content pool — **no-op until Phase 3** |
| `shuffle_and_merge` | Interpreter | Merge + shuffle arrays — **no-op until Phase 3** |

Unknown actions are delegated via `PhaseMachineOptions.onAction` to the Interpreter.

---

## Current Limitations (What's Not Yet Built)

| Feature | Planned Phase | Current State |
|---------|---------------|---------------|
| Visibility projection (team, role, host, spectator scopes) | 2.1 | Basic public/private only |
| Declarative Event System | 2.2 | Not built |
| Object Models (deck, hand, board, pool, tile) | 2.3 | Not built |
| Turn & Initiative System (round_robin execution) | 2.4 | Schema accepted, not executed |
| Content System (pools, selection strategies) | 3.1 | `content_draw` is a no-op |
| Presentation Templates (Tier 1 screens) | 3.2 | Not built |
| Rule Evaluator (arithmetic, built-in rules) | 4.1 | Expression lang is comparison-only |
| Extension Sandbox (custom renderers, evaluators) | 4.2 | Not built |
| Declarative Scoring & Victory evaluation | 4.3 | `score_round` is a stub |
| Hybrid Loader (auto-detect V2 in auto-discover.ts) | 0.3 | Not wired |
| CLI tooling (validate, scaffold, simulate) | 5.3 | Not built |
| Per-team state initialization from schema | 2 | Types exist; initialization is stub |

---

## Running Tests

```bash
# All tests (from repo root)
npx vitest run

# Watch mode
npx vitest

# With verbose output
npx vitest run --reporter=verbose
```

Test counts as of Phase 1.3 (2026-03-13):
- Schema Engine: **28 tests**
- State Manager: **59 tests**
- Phase Machine: **52 tests**
- Interaction Primitives: **57 tests**
- Interpreter: **36 tests**
- **Total runtime: 232 tests**
