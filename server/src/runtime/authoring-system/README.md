# Authoring System — Phase 4.4 AI Authoring Foundation

The Authoring System is the data layer that enables AI-assisted game creation in Boredless V2.

## Purpose

An LLM (or human developer) can use this subsystem to:

1. **Explore runtime capabilities** — what interactions, phases, and scoring patterns does V2 support?
2. **Scaffold new games from templates** — get a complete, valid game.yaml in seconds
3. **Validate game packages** — catch semantic errors before runtime load
4. **Introspect existing games** — understand what subsystems a game uses

## Public API

```ts
import {
  // Introspection
  introspect,          // Analyze a parsed game.yaml
  calculateComplexity, // Score game complexity

  // Validation
  validateGamePackage, // Deep semantic validation

  // Templates
  getTemplate,         // Scaffold a new game by type
  getAvailableTemplates, // List all template types

  // Documentation
  getCapabilityDocs,   // All runtime capabilities as structured data
  getCapabilityDoc,    // Find one capability by name
  generateSchemaReference, // LLM-ready markdown schema reference
} from './runtime/authoring-system/index.js';
```

## Modules

| File | Purpose |
|------|---------|
| `types.ts` | All type definitions (no logic) |
| `introspector.ts` | `introspect()` and `calculateComplexity()` |
| `validator.ts` | `validateGamePackage()` — semantic checks beyond Zod |
| `template-library.ts` | `getTemplate()` and `getAvailableTemplates()` |
| `capability-docs.ts` | `getCapabilityDocs()` and `generateSchemaReference()` |
| `index.ts` | Public API exports |

## Template Types

| Type | Description | Complexity |
|------|-------------|------------|
| `minimal` | Bare minimum: lobby → play → end | simple |
| `party` | Quiplash-style: submit + vote | moderate |
| `trivia` | Multiple choice, timed answers | moderate |
| `hidden-role` | Werewolf-style social deduction | moderate |
| `drawing` | Pictionary-style draw + guess | moderate |
| `word` | Letter set word game | moderate |
| `card` | Deck/deal/play skeleton | moderate |
| `board` | Grid board game skeleton | moderate |

## Validation Checks

Beyond Zod (structural), `validateGamePackage()` checks:

- Phase transitions reference existing phases
- No orphaned phases (unreachable from initial)
- At least one phase has player interaction
- Content pool references are valid
- Score track references in rules exist
- Victory condition references valid track
- Extension types are built-in or declared

## Complexity Tiers

| Tier | Phases | Rules | Extensions |
|------|--------|-------|------------|
| `simple` | ≤3 | ≤2 | 0 |
| `moderate` | ≤6 | ≤5 | ≤1 |
| `complex` | ≤10 | ≤10 | ≤3 |
| `advanced` | >10 | >10 | >3 |

## Architecture Compliance

- ✅ No imports from runtime subsystems (pure data layer)
- ✅ No game-specific code (`if gameId === ...`)
- ✅ No circular imports
- ✅ Reads raw game YAML data only
- ✅ All functions are pure (no side effects)

## Tests

```
npx vitest run server/src/runtime/authoring-system/__tests__/
```

See `__tests__/authoring-system.test.ts` for full test coverage.
