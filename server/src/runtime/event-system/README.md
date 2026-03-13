# Event System

The declarative Event System allows game schemas to define trigger → effect rules that drive dynamic behavior at runtime, without writing any TypeScript code.

## What It Does

Games declare event rules in their YAML schema under the `events:` key. When the runtime detects a relevant game event (phase transition, state change, timer expiry, etc.), it calls `EventEngine.emit()` with a trigger descriptor. The engine finds all matching rules, evaluates guard conditions, and executes effects in priority order.

Native effects (state mutations) are handled directly. External effects (announcements, sounds, scoring) are delegated to a caller-provided `onEffect` callback, keeping the engine decoupled from the broader runtime.

## Public API

### `EventEngine`

```ts
import { EventEngine } from '../event-system/index.js';

const engine = new EventEngine(rules, {
  stateManager,           // StateManager for native mutations
  onEffect,               // callback for broadcast/announce/etc.
  evaluateCondition,      // optional guard condition evaluator
});

engine.emit({ type: 'phase_enter', phase: 'play' }); // → FiredEvent[]
engine.enableRule('rule-id');
engine.disableRule('rule-id');
engine.getHistory();  // → FiredEvent[]
engine.reset();       // clear history, re-enable once-only rules
```

### Schema Integration

```ts
import { parseEventRules, safeParseEventRules, EventRuleSchema } from '../event-system/index.js';

// Parse and validate raw event rules from game YAML
const rules = parseEventRules(gamePackage.events ?? []);

// Non-throwing variant
const result = safeParseEventRules(rawRules);
if (result.success) { /* use result.data */ }
```

### Types

```ts
import type {
  EventTrigger, EventEffect, EventRule, FiredEvent,
  EffectContext, EventEngineOptions
} from '../event-system/index.js';
```

## Usage Example

Game YAML:
```yaml
events:
  - id: increment_round
    name: "Increment round on play"
    triggers:
      - type: phase_enter
        phase: play
    effects:
      - type: increment
        target: globals.round
        amount: 1

  - id: final_round_alert
    triggers:
      - type: state_change
        field: globals.round
        condition: "globals.round == globals.total_rounds"
    effects:
      - type: announce
        message: "Final round!"
```

TypeScript integration:
```ts
import { evaluateCondition } from '../phase-machine/expression-eval.js';
import { EventEngine, parseEventRules } from '../event-system/index.js';

const engine = new EventEngine(parseEventRules(gamePackage.events ?? []), {
  stateManager,
  onEffect: (effect, ctx) => {
    if (effect.type === 'announce') ctx.broadcast(effect.message);
  },
  evaluateCondition: (expr) => evaluateCondition(expr, {
    getGlobal: (field) => stateManager.getGlobal(field),
  }),
});

// Wire to StateManager change events
stateManager.onChange((event) => {
  engine.emit({
    type: 'state_change',
    field: `globals.${event.field}`,
  });
});

// Fire on phase transitions
engine.emit({ type: 'phase_enter', phase: 'play' });
```

## Test Count

**39 tests** covering trigger matching, effect execution, priority ordering, guard conditions, once-only rules, enable/disable, history, schema validation, and integration.

Run tests:
```bash
npx vitest run server/src/runtime/event-system/__tests__/event-system.test.ts
```

## Dependencies

- `zod` — schema validation
- `../state-manager/index.js` — StateManager interface (for native state mutations)

**No runtime dependencies on Phase Machine, Interpreter, or other subsystems.**
The engine is standalone; callers wire it to other subsystems via callbacks.
