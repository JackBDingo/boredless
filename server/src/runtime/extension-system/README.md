# Extension System

**Phase:** 4.2  
**Status:** Complete  
**Location:** `server/src/runtime/extension-system/`

---

## Overview

The Extension System is the clean escape hatch for game authors who need capabilities beyond what the declarative schema can express. It lets game authors register:

- **Custom renderers** — React components for specialized game UI (e.g., WordCraft board, poker table)
- **Custom rule evaluators** — TypeScript functions for complex rule logic (e.g., dictionary validation, poker hand ranking)
- **Custom interaction widgets** — Specialized player input components (e.g., tile placer, drawing canvas)
- **Lifecycle hooks** — Callbacks for game lifecycle events (game start/end, phase enter/exit, player join/leave)

**The runtime remains authoritative.** Extensions are advisors, not overrides. They receive sandboxed copies of state and cannot access engine internals.

---

## Architecture

```
GamePackage (YAML)
  extensions:
    - id: dictionary-validator
      type: rule
    - id: word-board
      type: renderer

                  ↓ load time
ExtensionRegistry
  ├── _extensions: Map<id, LoadedExtension>
  ├── _rendererIndex: Map<componentType, RendererExtension>
  ├── _ruleIndex: Map<ruleType, RuleExtension>
  ├── _interactionIndex: Map<widgetType, InteractionExtension>
  └── _lifecycleIndex: Map<hookName, LifecycleHookExtension[]>

                  ↓ evaluate time
ExtensionSandbox
  ├── createSandboxedContext() → deep-frozen state copy
  ├── wrapRuleHandler() → error-catching + timeout
  └── wrapLifecycleHandler() → async error-catching + timeout
```

---

## Files

| File | Purpose |
|------|---------|
| `types.ts` | All TypeScript interfaces and types |
| `extension-registry.ts` | `ExtensionRegistry` class — registration, lookup, indexing |
| `extension-sandbox.ts` | Isolation utilities — frozen context, import validation, handler wrapping |
| `schema-integration.ts` | Zod schemas for the `extensions:` section of game YAML |
| `index.ts` | Public API (only import from here) |
| `__tests__/extension-system.test.ts` | 81 comprehensive tests |
| `README.md` | This file |
| `DECISIONS.md` | Architecture decision records |

---

## Usage

### In a game YAML

```yaml
extensions:
  - id: dictionary-validator
    name: "Dictionary Validator"
    type: rule
    description: "Validates words against the built-in dictionary"

  - id: word-board
    name: "Word Board Renderer"
    type: renderer
    description: "Custom board renderer for the WordCraft grid"

  - id: drawing-canvas
    name: "Drawing Canvas"
    type: interaction
    description: "Freeform drawing widget for the player phone"
```

### At runtime (interpreter wires this up)

```typescript
import { ExtensionRegistry, createSandboxedContext, wrapRuleHandler } from '../extension-system/index.js';

// Create one registry per game room
const registry = new ExtensionRegistry();

// Game author code registers capabilities
registry.register(
  { id: 'dictionary-validator', name: 'Dictionary Validator', type: 'rule' },
  {
    rules: [{
      id: 'dict-rule',
      name: 'Dictionary Validation',
      ruleType: 'validate_word',
      evaluate: (ctx) => dictionary.has(ctx.params?.word),
    }]
  }
);

// Use at rule evaluation time
const rule = registry.getRule('validate_word');
if (rule) {
  const ctx = createSandboxedContext(gameState, playerIds, currentPhase, round);
  const ctxWithParams = { ...ctx, params: { word: 'HELLO' } };
  const wrappedEval = wrapRuleHandler(rule.evaluate);
  const result = wrappedEval(ctxWithParams);
}
```

---

## Extension Types

### Renderer Extension

Registers a named React component type that game schemas can reference in screen declarations.

```typescript
interface RendererExtension {
  id: string;
  name: string;
  componentType: string;           // Name used in game schema
  surfaces: ('display' | 'phone')[];
  propsSchema?: Record<string, unknown>;  // JSON Schema for props
  description?: string;
}
```

### Rule Extension

Registers a named evaluate function for complex rule logic.

```typescript
interface RuleExtension {
  id: string;
  name: string;
  ruleType: string;                // Name used in game schema conditions
  paramSchema?: Record<string, unknown>;  // JSON Schema for params
  description?: string;
  evaluate: (context: RuleExtensionContext) => boolean;
}
```

### Interaction Extension

Registers a named widget type for specialized player input.

```typescript
interface InteractionExtension {
  id: string;
  name: string;
  widgetType: string;              // Name used in game schema interactions
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  description?: string;
}
```

### Lifecycle Hook Extension

Registers a callback for a named lifecycle event.

```typescript
interface LifecycleHookExtension {
  id: string;
  hook: 'onGameStart' | 'onGameEnd' | 'onPhaseEnter' | 'onPhaseExit' |
        'onPlayerJoin' | 'onPlayerLeave' | 'onRoundStart' | 'onRoundEnd';
  handler: (context: LifecycleContext) => void | Promise<void>;
}
```

---

## Isolation Guarantees

1. **Frozen state** — `createSandboxedContext()` deep-freezes the state copy. Write attempts throw TypeError.
2. **Deep copy isolation** — `JSON.parse(JSON.stringify(state))` ensures no reference sharing. Mutations to the original don't affect the sandboxed copy.
3. **Error containment** — `wrapRuleHandler()` and `wrapLifecycleHandler()` catch all thrown errors and log them. Extensions never crash the runtime.
4. **Timeout protection** — `wrapLifecycleHandler()` enforces a 1000ms timeout via `Promise.race`. Rule handlers have a 100ms timeout (enforced by convention; sync timeouts in JS require Worker threads for hard enforcement).
5. **Import validation** — `validateExtensionImports()` performs static analysis on extension source code to detect illegal imports from engine internals.
6. **One registry per room** — `ExtensionRegistry` is instantiated per game room by the interpreter. Extensions from different games never share a registry.

---

## Validation Rules

The `ExtensionRegistry` enforces these constraints:

- **Duplicate extension IDs** — Throws `Error` if an ID is already registered
- **Duplicate componentType** — Throws if a renderer componentType is already taken
- **Duplicate ruleType** — Throws if a rule ruleType is already taken  
- **Duplicate widgetType** — Throws if an interaction widgetType is already taken
- **Unregister unknown ID** — Silent no-op (idempotent)

---

## Test Coverage

81 tests covering:
- Registration, lookup, unregister, clear
- Renderer/rule/interaction index management
- Lifecycle hook management (multiple hooks per event)
- Sandboxed context creation and deep freezing
- Import validation (12 blocked subsystems)
- Handler wrapping (error catching, async errors)
- Schema validation (all types, required fields, invalid types)
- Full WordCraft integration scenario (dictionary validator + renderer + widget + lifecycle)
