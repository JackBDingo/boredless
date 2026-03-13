# Interaction Primitives

Provides stateless payload validation primitives and a stateful `InputCollector` for tracking per-player submissions during `input_gate` phases. Replaces ad-hoc input handling scattered across V1 game modules.

---

## What It Does

The subsystem has two layers:
1. **Primitives** — stateless validators for specific input shapes (`choice`, `text_submit`, `vote`, `confirm`). Each primitive knows how to validate a single payload value.
2. **InputCollector** — stateful per-phase tracker. Wraps a primitive, records who has submitted, rejects duplicates, and signals when all required players are done.

A **primitive registry** maps type names (from game schemas) to factory functions, enabling new primitive types to be registered at startup.

---

## Public API

Import only from `interaction-primitives/index.ts`.

### Types

```ts
import type {
  InteractionPrimitive,   // { type: string; validate(payload): { valid, error? } }
  InputSubmission,        // { playerId, primitiveType, payload, timestamp }
  InputCollectorInterface, // interface matching InputCollector class
  PrimitiveFactory,       // (config: unknown) => InteractionPrimitive
} from '../interaction-primitives/index.js';
```

### `InputCollector` class

```ts
import { InputCollector } from '../interaction-primitives/index.js';

const collector = new InputCollector(requiredPlayerIds, primitive);
collector.submit(playerId, payload)       // → { accepted: boolean; error?: string }
collector.hasSubmitted(playerId)          // → boolean
collector.getSubmission(playerId)         // → unknown | undefined
collector.getAllSubmissions()             // → Map<string, unknown>
collector.allRequiredSubmitted()          // → boolean
collector.reset()                         // clear for next round/phase
```

### Primitive Factories (built-in)

```ts
import {
  createChoicePrimitive,     // pick one from a declared options list
  createTextSubmitPrimitive, // free text with optional min/max length
  createVotePrimitive,       // string matching optional validTargets list
  createConfirmPrimitive,    // any truthy value (ready-up, acknowledgment)
} from '../interaction-primitives/index.js';
```

### Registry

```ts
import {
  registerPrimitive,   // (type, factory) => void — add or replace a type
  createPrimitive,     // (type, config) => InteractionPrimitive — throws if unknown
  hasPrimitive,        // (type) => boolean
  getRegisteredTypes,  // () => string[]
} from '../interaction-primitives/index.js';
```

---

## Usage Example

```ts
import {
  InputCollector,
  createPrimitive,
  registerPrimitive,
} from '../interaction-primitives/index.js';

// --- Using a built-in primitive via the registry ---
const textPrimitive = createPrimitive('text_submit', { maxLength: 100 });
const collector = new InputCollector(['p1', 'p2', 'p3'], textPrimitive);

collector.submit('p1', 'My answer');          // { accepted: true }
collector.submit('p1', 'Again');             // { accepted: false, error: 'already submitted' }
collector.submit('p2', '');                  // { accepted: false, error: 'Text cannot be empty' }
collector.submit('p2', 'Valid answer');       // { accepted: true }
collector.submit('p3', 'Third answer');       // { accepted: true }

collector.allRequiredSubmitted();             // true → trigger phase advance
collector.getAllSubmissions();               // Map { p1 → 'My answer', p2 → 'Valid answer', p3 → ... }

// Reset between rounds
collector.reset();
collector.allRequiredSubmitted();             // false

// --- Registering a custom primitive ---
registerPrimitive('emoji_react', (config) => {
  const cfg = config as { allowed: string[] };
  return {
    type: 'emoji_react',
    validate(payload) {
      if (!cfg.allowed.includes(payload as string)) {
        return { valid: false, error: `Invalid emoji reaction` };
      }
      return { valid: true };
    },
  };
});

const emojiPrimitive = createPrimitive('emoji_react', { allowed: ['👍', '👎', '🔥'] });
```

---

## Tests

**57 tests** in `__tests__/interaction-primitives.test.ts`.

```bash
npx vitest run server/src/runtime/interaction-primitives
```

Covers: all four built-in primitive types (validation, edge cases, config options), `InputCollector` submission tracking, duplicate rejection, unknown-player rejection, `allRequiredSubmitted` with various required sets, `reset()` behavior, and registry operations.

---

## Dependencies

**Imports FROM:**
- `zod` is not used in this subsystem — validation is hand-rolled for simplicity.
- No imports from other V2 runtime subsystems.

**Imported BY:**
- `interpreter/declarative-game-module.ts` — creates primitives from schema config and instantiates `InputCollector` per `input_gate` phase.
