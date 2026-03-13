# Visibility & Projection System

Audience-aware state projection for Boredless V2. Given a full game state snapshot and an *audience* (who is asking), returns only the fields that audience is permitted to see — with redaction applied per field declarations.

Replaces the basic `getPublicState()` / `getPrivateState()` methods in the State Manager with a full projection engine driven by field visibility annotations in the game schema.

---

## Public API

### `ProjectionEngine`

```ts
import { ProjectionEngine } from './visibility/index.js';
import type { Audience, ProjectedState } from './visibility/index.js';
```

**Constructor**
```ts
new ProjectionEngine(stateModel: StateModel)
```
Reads the `state_model` (from a `GamePackage`) and pre-compiles a visibility map. One engine per room, reused across all projections.

**Core method**
```ts
project(state: StateSnapshot, audience: Audience): ProjectedState
```
Returns the projected state. Pure function — same inputs always produce same output, no side effects.

---

### Types

| Type | Description |
|------|-------------|
| `Audience` | Who is requesting: `{ type: 'player' \| 'host' \| 'spectator' \| 'eliminated', playerId?, teamId? }` |
| `RedactionStrategy` | `'omit' \| 'null' \| 'placeholder' \| 'count'` |
| `FieldVisibility` | `{ scope, redaction?, placeholder? }` — what a field declaration can contain |
| `ProjectedState` | The output: `{ globals, players, teams, meta: { audience, phase, redactedFields } }` |

---

## Visibility Rules

| Scope | Player (own) | Player (other) | Host | Spectator | Eliminated |
|-------|:---:|:---:|:---:|:---:|:---:|
| `public` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `spectator` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `team` | ✅* | ❌ | ✅ | ❌ | ❌ |
| `private` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `host` | ❌ | ❌ | ✅ | ❌ | ❌ |

\* Team visibility is stubbed until Phase 2.4 (team tracking). Currently degrades to private (own player only).

**Fields with no visibility declared default to `public`.**

---

## Redaction Strategies

When a field is not visible to the audience, the `redaction` strategy controls how it appears:

| Strategy | Output |
|----------|--------|
| `omit` (default) | Field absent from output |
| `null` | Field present, value is `null` |
| `placeholder` | Field present, value is `placeholder` (or `"?"` if not declared) |
| `count` | For arrays: `{ count: N }`; for non-arrays: `null` |

---

## Usage Example

```yaml
# In game.yaml
state_model:
  per_player:
    score:
      type: integer
      default: 0
      visibility: public       # everyone sees scores
    hand:
      type: array
      default: []
      visibility: private      # omit by default
      redaction: count         # show { count: N } to others
    role:
      type: string
      default: null
      visibility: private
      redaction: placeholder
      placeholder: "???"
```

```ts
import { ProjectionEngine } from '../visibility/index.js';

// Create engine once per room
const engine = new ProjectionEngine(gamePackage.state_model);

// Get player view
const snapshot = stateManager.snapshot();
const playerView = engine.project(snapshot, { type: 'player', playerId: 'alice' });
// → alice sees her own hand and role; others show { count: N } for hand, "???" for role

// Get host view
const hostView = engine.project(snapshot, { type: 'host' });
// → host sees everything

// Get spectator view  
const spectatorView = engine.project(snapshot, { type: 'spectator' });
// → only public fields visible
```

---

## Tests

**35 tests** covering:
- Basic projection (player, host, spectator, eliminated)
- All 4 redaction strategies
- Global visibility scopes
- Edge cases (empty model, unknown player, no visibility declared)
- Integration test against `_test-v2/game.yaml`

Run:
```bash
cd server
npx vitest run src/runtime/visibility
```

---

## Dependencies

| Subsystem | Import path |
|-----------|-------------|
| Schema Engine | `../schema-engine/index.js` — `StateModel` type |
| State Manager | `../state-manager/index.js` — `StateSnapshot` type |

No circular imports. The Visibility subsystem is a consumer of Schema Engine and State Manager types only.
