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

---

## Phase 2.2 — Event System (Declarative)
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/event-system/` subsystem:

- **`types.ts`** — Core type definitions: `EventTrigger`, `EventEffect`, `EventRule`, `FiredEvent`, `EffectContext`, `EventEngineOptions`
- **`event-engine.ts`** — `EventEngine` class: trigger matching, priority-ordered execution, guard conditions, once-only rules, enable/disable, history tracking
- **`schema-integration.ts`** — Zod schemas (`EventRuleSchema`, `EventTriggerSchema`, `EventEffectSchema`, `EventRulesArraySchema`) and `parseEventRules()` / `safeParseEventRules()`
- **`index.ts`** — Public API
- **`__tests__/event-system.test.ts`** — 59 comprehensive tests
- **`README.md`** — Subsystem documentation
- **`DECISIONS.md`** — Design decisions and rationale

### Schema Extension (Non-Breaking)

- Updated `schema-engine/schema.ts`: `EventsSchema` now uses `EventRulesArraySchema` from event-system (was `z.array(z.any())`)
- Updated `games/_test-v2/game.yaml` to include example `events:` section
- Fixed `schema-engine/__tests__/schema-engine.test.ts`: updated test fixture to use valid event structure (triggers/effects plural)

### Trigger Types Supported
`phase_enter`, `phase_exit`, `state_change`, `input_received`, `timer_expire`, `game_start`, `game_end`

### Effect Types Supported
- **Native (handled by engine):** `set_state`, `increment`, `decrement`
- **Delegated (via onEffect callback):** `add_points`, `broadcast`, `play_sound`, `announce`, `advance_phase`, `custom`

### Test Count

**59 new tests** (event-system subsystem)  
**426 total passing tests** (all subsystems combined)

### Notable Decisions

- **Standalone engine**: EventEngine has no direct dependencies on PhaseMachine, Interpreter, or WS layer. Callers wire it via emit() calls and the onEffect callback — eliminates circular dependencies.
- **Callback-driven condition evaluation**: `evaluateCondition` is injected optionally, allowing tests to use real or custom evaluators without coupling to phase-machine internals.
- **Trigger OR semantics**: A rule fires if ANY trigger matches. Effects within a rule all execute in order (AND semantics).
- **Native vs delegated effects**: Only state mutations (set_state/increment/decrement) are handled natively. All display/audio/scoring effects delegate to the onEffect callback.
- **Schema-first**: `EventRulesArraySchema` is now the canonical Zod schema for events in game packages, replacing the `z.array(z.any())` stub.

---

## Phase 2.4 — Turn & Initiative System
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/turn-system/` subsystem:

- **`types.ts`** — `TurnModelType`, `TurnModel`, `TurnState`, `TurnEvent`, `TurnManagerOptions` types
- **`turn-manager.ts`** — `TurnManager` class: manages player ordering, active player tracking, turn progression for 5 turn models
- **`schema-integration.ts`** — `FullTurnModelSchema` (Zod), `turnModelFromYaml()` helper for YAML → TurnModel conversion
- **`index.ts`** — Public API
- **`__tests__/turn-system.test.ts`** — 65 comprehensive tests
- **`README.md`** — Subsystem documentation
- **`DECISIONS.md`** — Design decisions and rationale

### Turn Models Implemented

| Model | Active Players | Use Case |
|-------|---------------|----------|
| `simultaneous` | All non-eliminated | Bluffalo, quiz games |
| `round_robin` | One at a time | Blackjack, card games |
| `free_form` | All non-eliminated | Lobbies, no turn ordering |
| `priority_queue` | First in ordered queue | Speed-based games |
| `elimination` | All remaining | Village of Shadows, Survivor-style |

### Test Count

**65 new tests** (turn-system subsystem)
**426 total passing tests** (all subsystems combined)

### Notable Decisions

- **Standalone**: No imports from other runtime subsystems — pure in-memory, fully unit testable
- **No timer ownership**: `timeoutMs` is stored in config but callers manage actual timers (same pattern as architecture plan specifies)
- **Throws on invalid reversal**: `reverseDirection()` throws when `reverseAllowed: false` — loud failure beats silent no-op
- **Stable array for eliminated**: Eliminated players stay in `_turnOrder` with a Set marking them; prevents index shifting bugs in round_robin wrap detection
- **Five models, not three**: Added `free_form` and `elimination` beyond the architecture plan's three — both justified by existing V1 game patterns (Village of Shadows needs elimination, lobbies need free_form)
- **Immutable snapshots**: `getState()` copies Sets to prevent accidental mutation by callers
- **Multi-game validation**: Tests include Bluffalo-style (simultaneous), Village-style (elimination), and Blackjack-style (round_robin) scenarios per Anti-Drift Rule 5

---

## Phase 2.3 — Object Models
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/object-models/` subsystem:

- **`types.ts`** — Core type definitions: `GameObject`, `GameItem`, `Deck`, `Hand`, `Board`, `Pool`, `ObjectEvent`, `GameObjectType`
- **`deck.ts`** — `DeckManager`: shuffle (Fisher-Yates), draw/drawBottom, peek, addToTop/addToBottom, discard, reshuffleDiscard
- **`hand.ts`** — `HandManager`: add (with maxSize enforcement), remove, play, has, sort, isFull
- **`board.ts`** — `BoardManager`: place, remove, move, getCell, isOccupied/isEmpty, isValidPosition, getOccupiedCells, clear (2D grid, cells[y][x])
- **`pool.ts`** — `PoolManager`: add, remove, drawRandom (partial Fisher-Yates), find, filter
- **`object-registry.ts`** — `ObjectRegistry`: per-room registry, factory methods (createDeck/Hand/Board/Pool), typed getters, cross-object transfer(), getSnapshot(), destroy()
- **`schema-integration.ts`** — Zod schemas for `objects:` section: `DeckDeclarationSchema`, `HandDeclarationSchema`, `BoardDeclarationSchema`, `PoolDeclarationSchema`, `ObjectDeclarationSchema`, `parseGameObjects()`, `safeParseGameObjects()`
- **`index.ts`** — Public API
- **`__tests__/object-models.test.ts`** — 102 comprehensive tests
- **`README.md`** — Subsystem documentation
- **`DECISIONS.md`** — Design decisions and rationale

### Test Count

**102 new tests** (object-models subsystem)  
**528 total passing tests** (all subsystems combined)

### Notable Decisions

- **Manager classes over plain objects**: Clean call-site ergonomics for frequent deck.shuffle(), hand.play() usage
- **getState() deep copies**: Prevents accidental internal state mutation through returned references
- **No remove-by-ID on DeckManager**: Decks are ordered stacks; arbitrary middle-removal belongs in PoolManager or transfer()
- **Board excluded from transfer()**: Board items have spatial meaning that blind transfer would silently destroy; place()/remove() are explicit
- **No imports from other V2 subsystems**: Fully standalone; faceUp visibility enforcement delegated to Visibility subsystem
- **ObjectRegistry is per-room**: One registry per game room, never shared globally
- **No integration with interpreter**: Wire-up to DeclarativeGameModule is a later phase per architecture plan

---

## Phase 3.1 — Content System
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/content-system/` subsystem:

- **`types.ts`** — Core type definitions: `ContentItem`, `ContentSource`, `ContentSourceType`, `ContentPoolConfig`, `ContentFilter`, `ContentPack`, `SelectionStrategy`
- **`content-pool.ts`** — `ContentPool` class: manages item drawing with 4 strategies, noRepeat/recyclable lifecycle, pre-filters at construction, runtime filter queries, peek/getState
- **`content-loader.ts`** — `ContentLoader` class: loads items from `inline`/`file`/`bundled` sources, validates each item against `ContentItemSchema`, manages ContentPack registry; exports `defaultContentLoader` singleton
- **`content-registry.ts`** — `ContentRegistry` class: per-game-room pool lifecycle (create, get, reset, destroy)
- **`schema-integration.ts`** — Zod schemas: `ContentItemSchema`, `ContentSourceSchema` (discriminated union), `ContentPoolConfigSchema`, `ContentSectionSchema`, `ContentPackSchema`; parse helpers `parseContentSection` / `safeParseContentSection`
- **`index.ts`** — Public API
- **`__tests__/content-system.test.ts`** — 64 comprehensive tests
- **`README.md`** — Subsystem documentation
- **`DECISIONS.md`** — 10 design decisions with rationale

### Schema Extension (Non-Breaking)

- Updated `schema-engine/schema.ts`: `ContentSchema` now uses `ContentSectionSchema` from content-system (was `z.record(z.any())`)
- `content:` section in `GamePackageSchema` is still optional — only the type of a present section changed
- Updated `schema-engine/__tests__/schema-engine.test.ts`: one test updated to use the proper `{ pools: [...] }` content format

### Selection Strategies

| Strategy | Behavior |
|----------|---------|
| `random` | Uniform random selection (re-rolls each draw) |
| `weighted` | Probability proportional to `item.weight`; weight 0 = never drawn |
| `sequential` | Items drawn in insertion order |
| `shuffle` | Pool shuffled once at init; drawn sequentially; recycle reshuffles |

### Content Sources

| Type | Description |
|------|-------------|
| `inline` | Items embedded in game schema |
| `file` | JSON file relative to game directory (`fs.readFileSync`) |
| `bundled` | Items from a registered `ContentPack` (expansion packs) |

### Test Count

**64 new tests** (content-system subsystem)  
**592 total passing tests** (all subsystems combined)

### Notable Decisions

- **Pre-loaded items pattern**: `ContentPool(config, items[])` — constructor receives ready data; I/O is the loader's job
- **Pre-filters at construction**: `ContentPoolConfig.filters` applied once; `getAll()` and total count reflect the filtered pool
- **noRepeat=true / recyclable=true defaults**: Most games need both; opt-out is explicit
- **Shuffle ≠ random**: Shuffle guarantees each item drawn once before any repeat; random re-rolls each draw
- **Tag filter = any-match**: Item passes if it has at least one of the specified tag values
- **ContentSection uses `pools` array**: Consistent with typed schema patterns; `id` field names the pool
- **Fully standalone**: Zero imports from event-system, turn-system, object-models, or interpreter

---

## Phase 3.3 — Asset System
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/asset-system/` subsystem:

- **`types.ts`** — Core type definitions: `AssetType`, `AssetDeclaration`, `AssetVariant`, `ResolvedAsset`, `ResolvedAssetVariant`, `AssetManifest`, `PreloadManifest`
- **`asset-resolver.ts`** — `AssetResolver` class: URL resolution (external vs relative), base URL priority chain, recursive fallback resolution (max depth 3, circular-safe), variant resolution, type filtering, preload manifest generation
- **`schema-integration.ts`** — Zod schemas: `AssetVariantSchema`, `AssetDeclarationSchema`, `AssetManifestSchema`; parse helpers `parseAssetManifest` / `safeParseAssetManifest`
- **`index.ts`** — Public API
- **`__tests__/asset-system.test.ts`** — 45 comprehensive tests
- **`README.md`** — Subsystem documentation
- **`DECISIONS.md`** — 10 design decisions with rationale

### Schema Extension (Non-Breaking)

- Updated `schema-engine/schema.ts`: Added `AssetsSchema` (alias for `AssetManifestSchema`) and optional `assets:` field to `GamePackageSchema`
- All existing V2 game packages without an `assets:` section continue to work unchanged

### URL Resolution Priority

| Priority | Source | Example |
|---------|--------|---------|
| 1 (highest) | External URL in `src` | `https://cdn.example.com/img.png` → used as-is |
| 2 | `manifest.baseUrl` | `/games/trivia/assets` + `logo.png` |
| 3 | `options.publicUrlBase` | Runtime-provided URL base |
| 4 | `options.gameDir` | Disk path for local development |
| 5 (lowest) | No base | Relative path left as-is |

### Asset Types Supported

`image`, `audio`, `video`, `font`, `json`

### Variant Conditions Supported

`dark`, `light`, `mobile`, `desktop`, `small`, `large`

### Test Count

**45 new tests** (asset-system subsystem)  
**768 total tests** (all subsystems combined, 2 pre-existing failures in presentation-system unrelated to this work)

### Notable Decisions

- **Pure resolution**: `AssetResolver` is stateless after construction — index built once, resolution is deterministic
- **Manifest baseUrl takes precedence**: Game authors can lock down their asset URL in the schema; runtime options are fallbacks
- **Max fallback depth 3**: Prevents infinite loops from circular references without requiring explicit cycle detection
- **Polymorphic fallback field**: Accepts both asset IDs and external URLs — runtime disambiguates by checking asset index then URL prefix
- **No file existence checking**: Keeps the resolver decoupled from filesystem; existence validation belongs in the Phase 5 CLI validator
- **Zero imports from other V2 subsystems**: Fully standalone, no circular import risk
