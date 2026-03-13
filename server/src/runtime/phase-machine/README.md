# Phase Machine

Drives declarative games through their phase graph. Replaces the ad-hoc phase transition logic in V1 modules (switch statements, `startRound()`, `advanceToVoting()`) with a schema-driven state machine.

One `PhaseMachine` instance exists per room per game session.

---

## Public API

Import only from `phase-machine/index.ts`.

### Class: `PhaseMachine`

```ts
import { PhaseMachine } from './runtime/phase-machine/index.js';
import type { PhaseMachineOptions, ExpressionContext, TimerImpl } from './runtime/phase-machine/index.js';
```

**Constructor:**
```ts
constructor(
  phases: Phases,              // from GamePackage.phases
  stateManager: StateManager,  // initialized StateManager for this room
  options: PhaseMachineOptions,
  timerImpl?: TimerImpl        // optional — defaults to timerEngine singleton
)
```

**`PhaseMachineOptions`:**
```ts
interface PhaseMachineOptions {
  roomId: string;
  sessionIds: () => string[];         // dynamic — called at timer start
  onPhaseChange: (phaseId: string, phaseNode: PhaseNode) => void;
  onGameEnd: () => void;
  onAction: (action: PhaseAction) => void;  // unknown actions delegated here
}
```

**Methods:**
```ts
pm.start(initialPhaseId: string): void
// Enter the initial phase. Must be called exactly once per session.

pm.getCurrentPhase(): { id: string; node: PhaseNode } | null
// Returns current phase, or null before start().

pm.submitInput(playerId: string, inputType: string, payload: unknown): boolean
// Submit player input during input_gate phases.
// Returns true if accepted, false if rejected (wrong phase/type/player).
// Applies value to declared state target via StateManager.
// Auto-advances when all required players have submitted.

pm.destroy(): void
// Stop timers and clean up. Call when room is destroyed.
```

**`TimerImpl` interface** (for testing):
```ts
interface TimerImpl {
  start(roomId: string, phaseType: string, durationMs: number, sessionIds: string[], onExpire: () => void): void;
  stop(roomId: string): void;
  getRemaining(roomId: string): number | null;
}
```

### Function: `evaluateCondition`

```ts
import { evaluateCondition } from './runtime/phase-machine/index.js';

evaluateCondition(
  expression: string,
  context: ExpressionContext
): boolean
// Throws if expression is malformed.
```

**`ExpressionContext`:**
```ts
interface ExpressionContext {
  getGlobal: (field: string) => unknown;
  getPlayer?: (playerId: string, field: string) => unknown;
}
```

---

## Phase Types

| Type | Behavior |
|------|----------|
| `timed` | Starts timer, fires `on_exit` actions on expiry. Terminates if no duration. |
| `input_gate` | Waits for player submissions. Fires `on_complete` when `required` satisfied. Optional timeout via `duration`. |
| `conditional` | Evaluates `condition`, fires `on_exit` with `conditional` action to branch. Resolves via microtask. |
| `loop` | Phase 1 stub — treated identically to `timed`. |

## Natively Handled Actions

| Action | Description |
|--------|-------------|
| `advance` | Sets next phase target (`to: phase_id`) |
| `conditional` | Evaluates condition expression, branches to `then.advance_to` or `else.advance_to` |
| `increment` | Increments a global field: `target: globals.field` |
| `set` | Assigns a value: `target: globals.field` or `per_player.field`, `value: x` |
| `reset_players` | Resets all players' `field` to null |

All other actions are passed to `options.onAction` for the Interpreter to handle.

## Expression Evaluator

Supported syntax in `condition` fields:

```
globals.round < globals.total_rounds
globals.score >= 100
globals.round == 3 AND globals.active == true
globals.phase == "final" OR globals.score > 500
```

- Operators: `<`, `>`, `<=`, `>=`, `==`, `!=`
- Boolean: `AND`, `OR` (space-padded, case-sensitive, left-to-right, no precedence)
- State refs: `globals.field`, `per_player.field`
- Literals: number, `"string"`, `'string'`, `true`, `false`, `null`
- **Not supported:** arithmetic, nested parens, negation, function calls

---

## Usage Example

```ts
import { PhaseMachine } from '../phase-machine/index.js';
import { StateManager } from '../state-manager/index.js';
import { loadGamePackage } from '../schema-engine/index.js';

const pkg = loadGamePackage('./games/my-game/game.yaml');
const sm = new StateManager(pkg.state_model, ['p1', 'p2', 'p3']);

const pm = new PhaseMachine(pkg.phases, sm, {
  roomId: 'room-123',
  sessionIds: () => ['sess-1', 'sess-2', 'sess-3'],
  onPhaseChange: (phaseId, phaseNode) => {
    console.log(`Phase changed to: ${phaseId} (${phaseNode.type})`);
    // broadcast to clients here
  },
  onGameEnd: () => {
    console.log('Game over');
  },
  onAction: (action) => {
    // handle score_round, content_draw, etc.
  },
});

pm.start('instructions');  // enters the first phase

// During input_gate phase:
pm.submitInput('p1', 'text_submit', 'my answer'); // true
pm.submitInput('p2', 'text_submit', 'another answer'); // true
pm.submitInput('p3', 'text_submit', 'third answer'); // true → triggers on_complete

// Test with controllable timer:
import type { TimerImpl } from '../phase-machine/index.js';
class TestTimer implements TimerImpl {
  private cb: (() => void) | null = null;
  start(_r: string, _t: string, _d: number, _s: string[], cb: () => void) { this.cb = cb; }
  stop() {}
  getRemaining() { return null; }
  trigger() { this.cb?.(); }
}
const timer = new TestTimer();
const pm2 = new PhaseMachine(pkg.phases, sm, opts, timer);
pm2.start('instructions');
timer.trigger(); // manually expire the timer
```

---

## Tests

52 tests in `__tests__/phase-machine.test.ts`.

```bash
npx vitest run server/src/runtime/phase-machine
```

Covers: timed phase timer start/expiry, input_gate submission tracking, all-players-complete detection, conditional branching, action execution (advance, increment, set, reset_players, conditional), expression evaluator (comparisons, AND/OR, literals, state refs, error handling), `destroy()` cleanup.

---

## Dependencies

- **Imports from:** `../schema-engine/index.js` (types: `Phases`, `PhaseNode`, `PhaseAction`)
- **Imports from:** `../state-manager/index.js` (`StateManager`)
- **Imports from:** `../../engine/timer-engine.js` (V1 timer singleton — default timer backend)
- **Imported by:** `interpreter/`
