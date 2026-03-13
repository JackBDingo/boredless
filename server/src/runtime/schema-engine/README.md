# Schema Engine

Loads and validates V2 game package files (YAML) against the `GamePackageSchema` Zod definition. Returns a fully typed `GamePackage` or throws with human-readable field-path errors.

**Does not** execute any game logic. Its only job is structural and semantic validation.

---

## Public API

Import only from `schema-engine/index.ts`.

### Types

```ts
import type {
  GamePackage,    // Top-level validated package type (z.infer<typeof GamePackageSchema>)
  ManifestV2,     // manifest section
  StateModel,     // state_model section
  StateField,     // Individual field declaration { type, default, visibility? }
  PhaseNode,      // Single phase definition
  PhaseAction,    // Action in on_enter / on_exit / on_complete
  PhaseInput,     // input section of a phase
  PhaseScreens,   // screen.display / screen.phone / screen.spectator
  Phases,         // Record<string, PhaseNode>
  TurnModel,      // turn_model section
  Presentation,   // presentation section
  Scoring,        // scoring section (Record<string, number>)
  Victory,        // victory section
} from './schema-engine/index.js';
```

### Functions

```ts
// Load a game package from a YAML file path. Throws on read/parse/validation errors.
// Error messages include field paths: "phases.play.input.primitive: Required"
function loadGamePackage(yamlPath: string): GamePackage

// Validate a plain object without file I/O. Does not throw.
function validateGamePackage(data: unknown): { valid: boolean; errors?: string[] }
```

### Schema

```ts
// The Zod schema itself — use for runtime type narrowing or custom parsing.
import { GamePackageSchema } from './schema-engine/index.js';
const result = GamePackageSchema.safeParse(rawObject);
```

---

## Usage Example

```ts
import { loadGamePackage, validateGamePackage } from './runtime/schema-engine/index.js';

// Load from disk (throws on error)
const pkg = loadGamePackage('./games/my-game/game.yaml');
console.log(pkg.manifest.id);         // "my-game"
console.log(pkg.schema_version);      // "2.0"
console.log(pkg.phases['play'].type); // "input_gate"

// Validate without throwing
const result = validateGamePackage(rawObject);
if (!result.valid) {
  console.error(result.errors?.join('\n'));
  // "phases.play.input.primitive: Required"
}
```

---

## Schema Domain Summary

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `schema_version` | Yes | `"2.0"` | Literal — discriminates V2 from V1 |
| `manifest` | Yes | `ManifestV2` | Identity, players, metadata |
| `state_model` | Yes | `StateModel` | Globals + per_player + per_team field declarations |
| `phases` | Yes | `Phases` | Named phase nodes; first key is initial phase |
| `turn_model` | Yes | `TurnModel` | `simultaneous` / `round_robin` / `priority_queue` |
| `presentation` | Yes | `Presentation` | Theme config (accent, background, typography, etc.) |
| `scoring` | Yes | `Scoring` | Named point values: `Record<string, number>` |
| `victory` | Yes | `Victory` | Win condition type + tiebreak |
| `content` | No | `Record<string, any>` | Content pool declarations (Phase 3) |
| `events` | No | `any[]` | Declarative trigger/effect pairs (Phase 2) |
| `roles` | No | `Record<string, any>` | Role definitions (Phase 2) |
| `teams` | No | `Record<string, any>` | Team definitions (Phase 2) |
| `objects` | No | `Record<string, any>` | Object model declarations (Phase 2) |
| `rules` | No | `any[]` | Rule declarations (Phase 4) |
| `extensions` | No | `ExtensionsSchema` | Custom renderers, rules, interactions, scoring |
| `authoring` | No | `Record<string, any>` | AI/tooling metadata |

**`StateFieldTypeSchema` enum:** `integer`, `float`, `string`, `boolean`, `content_ref`, `array`, `object`, `null`

**`VisibilityScopeSchema` enum:** `public`, `private`, `host`, `spectator`

**`PhaseTypeSchema` enum:** `timed`, `input_gate`, `conditional`, `loop`

**`VictoryTypeSchema` enum:** `highest_score`, `target_score`, `last_standing`, `team_objective`, `faction_parity`, `board_objective`, `narrative_endpoint`, `multi_condition`

---

## Tests

28 tests in `__tests__/schema-engine.test.ts`.

```bash
npx vitest run server/src/runtime/schema-engine
```

Covers: valid package acceptance, field-path error reporting, all invalid field types, YAML file loading, fixture assertions, and `GamePackageSchema` direct usage.

---

## Dependencies

- **Imports from:** `zod`, `yaml`, `node:fs` (standard library)
- **No runtime imports from:** any other V2 subsystem
- **Imported by:** `state-manager`, `phase-machine`, `interpreter`
