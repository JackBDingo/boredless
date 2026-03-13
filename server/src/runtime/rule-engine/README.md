# Rule Engine — Boredless V2

**Phase:** 4.1  
**Subsystem:** `rule-engine`  
**Status:** Complete

## Overview

The Rule Engine is a declarative evaluation system that lets game schemas define game logic as data — conditions, actions, and rule composition — without writing TypeScript. Games declare rules in their YAML/JSON schema; the runtime evaluates them.

## Architecture

```
rule-engine/
  types.ts              — Type definitions (RuleDeclaration, RuleCondition, RuleAction, RuleContext, RuleResult)
  expression-evaluator.ts — Safe recursive descent parser (no eval())
  condition-evaluator.ts  — Evaluates RuleCondition trees (comparison, logical, expression, builtin)
  builtin-rules.ts        — Registry of common game patterns
  rule-engine.ts          — Main RuleEngine class (evaluate, enable/disable, add/remove)
  schema-integration.ts   — Zod schemas for YAML validation
  index.ts                — Public API
  __tests__/
    rule-engine.test.ts   — Comprehensive test suite
```

## Subsystem Boundary

**Import rule:** Only import from `index.ts`. Never import from internal modules.

```ts
import { RuleEngine, evaluateExpression, registerBuiltIn } from '../rule-engine/index.js';
```

## Core Concepts

### RuleDeclaration

A rule in the game schema:

```yaml
rules:
  - id: check_winner
    name: "Check for Winner"
    priority: 10
    when:
      type: builtin
      rule: score_reached
      params:
        target: 10
        path: "globals.players.*.score"
    then:
      - type: set
        path: "globals.winner"
        value: "$event.data.playerId"
      - type: transition
        to: results
    else:
      - type: emit
        event: game_continues
```

### Condition Types

| Type | Description |
|------|-------------|
| `comparison` | Compare two values: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `in` |
| `and` | All sub-conditions must be true |
| `or` | At least one sub-condition must be true |
| `not` | Negates the first sub-condition |
| `expression` | Free-form expression string (safe parser, no eval) |
| `builtin` | Named built-in rule pattern |

### Action Types

| Type | Description |
|------|-------------|
| `set` | Set a state field to a value |
| `increment` | Increment a numeric state field |
| `emit` | Emit a named event |
| `transition` | Trigger a phase machine transition |
| `custom` | Invoke a registered custom action handler |

### Built-in Rules

| Name | Description | Params |
|------|-------------|--------|
| `all_players_submitted` | All active players have `submitted: true` | — |
| `timer_expired` | `event.type === 'timer_expired'` | — |
| `min_players` | Player count >= min | `{ min: number }` |
| `max_players` | Player count <= max | `{ max: number }` |
| `score_reached` | Any value at path >= target | `{ target: number, path: string }` |
| `all_equal` | All values at path are equal | `{ path: string }` |
| `majority_vote` | Majority of votes are the same | `{ path: string }` |
| `last_standing` | Only one non-eliminated player | — |
| `round_limit` | Round >= max | `{ max: number }` |
| `items_remaining` | Item count at path satisfies operator | `{ path: string, operator: string, count: number }` |

### Expression Language

Safe recursive descent parser supporting:
- **Field access:** `globals.score`, `phase.name`, `$event.type`, `$players.count`
- **Comparisons:** `==`, `!=`, `>`, `<`, `>=`, `<=`
- **Boolean:** `&&`, `||`, `!`
- **Arithmetic:** `+`, `-`, `*`, `/`, `%`
- **String methods:** `.contains()`, `.startsWith()`, `.length`
- **Array methods:** `.includes()`, `.length`
- **Ternary:** `condition ? valueA : valueB`
- **Parentheses:** `(a + b) * 2`
- **Literals:** `42`, `"string"`, `'string'`, `true`, `false`, `null`

**Security:** No `eval()`, no `new Function()`. All expressions are parsed into an AST.

## Usage

### Basic evaluation

```ts
import { RuleEngine } from '../rule-engine/index.js';

const engine = new RuleEngine(gamePackage.rules);

const results = engine.evaluate(context);
for (const result of results) {
  if (result.matched) {
    // Execute result.actions — the engine does NOT do this
    await executeActions(result.actions);
  }
}
```

### Register custom built-in

```ts
import { registerBuiltIn } from '../rule-engine/index.js';

registerBuiltIn('deck_empty', (context) => {
  const deck = context.state.globals?.deck as unknown[];
  return Array.isArray(deck) && deck.length === 0;
});
```

### Register custom action handler

```ts
engine.registerCustomAction('deal_cards', (params, context) => {
  // Return additional actions to execute
  return [{ type: 'emit', event: 'cards_dealt' }];
});
```

## Design Notes

See `DECISIONS.md` for non-obvious architectural choices.

## Test Coverage

Run tests:
```bash
cd server && npx vitest run src/runtime/rule-engine
```

Test suite covers: expression evaluator, condition evaluator, built-in rules, RuleEngine class, schema validation, and a full trivia game simulation.
