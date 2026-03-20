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

---

## Phase 3.2 — Presentation System
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/presentation-system/` subsystem:

- **`types.ts`** — Core type definitions: `ScreenTemplateType`, `ScreenLayout`, `ScreenComponent`, `AnimationConfig`, `ScreenDeclaration`, `GameTheme`, `PresentationConfig`, `ResolvedScreen`
- **`theme-engine.ts`** — `defaultTheme` (dark navy/indigo palette), `mergeTheme()` (deep-merge partial theme with defaults), `validateTheme()` (color format validation), `resolveThemeCSS()` (theme → CSS custom properties map); `DeepPartialGameTheme` for ergonomic partial theme input
- **`screen-resolver.ts`** — `resolveScreen()` (bind state paths to components, attach theme), `getScreensForSurface()` (filter by display/phone/both), `getScreenForPhase()` (match screen to phase with surface-specific priority)
- **`template-library.ts`** — `getDefaultTemplate()` for 10 template types (lobby, prompt, vote, reveal, scoreboard, results, timer, info, media, custom); returns deep-copied component arrays + layout defaults
- **`schema-integration.ts`** — Zod schemas for all types; `PresentationConfigSchema` with partial theme support; `parsePresentationConfig()` / `safeParsePresentationConfig()` helpers
- **`index.ts`** — Public API
- **`__tests__/presentation-system.test.ts`** — 70 comprehensive tests
- **`README.md`** — Subsystem documentation
- **`DECISIONS.md`** — 10 design decisions with rationale

### Schema Extension (Non-Breaking)

- Updated `schema-engine/schema.ts`: `PresentationSchema` now uses `PresentationConfigSchema` from presentation-system (was a simple `{ theme: { accent, background, typography, motion } }` stub)
- Made `presentation` optional in `GamePackageSchema` (was required) — games without custom presentation use template defaults
- Updated `games/_test-v2/game.yaml` to use new presentation format with `screens` array and proper theme colors
- Updated `schema-engine/__tests__/schema-engine.test.ts` inline fixture to use new `screens` format

### Template Types

| Template | Components | Default Layout |
|----------|-----------|----------------|
| `lobby` | player-list + text + button-group | centered |
| `prompt` | text + text + timer + input | stack |
| `vote` | text + button-group + timer | grid (2 cols) |
| `reveal` | text + player-list | centered |
| `scoreboard` | score-table + text | list |
| `results` | text + text + score-table + button-group | centered |
| `timer` | timer + text | fullscreen |
| `info` | text + text | centered |
| `media` | image | fullscreen |
| `custom` | (empty — game declares all) | stack |

### Test Count

**70 new tests** (presentation-system subsystem)
**725 total passing tests** (all subsystems combined)

### Notable Decisions

- **Partial theme at schema layer**: Schema accepts partial themes; `mergeTheme()` fills defaults at runtime — avoiding hostile validation for simple games declaring just their brand color
- **`resolveScreen` never throws**: Missing state bindings resolve to `undefined` (graceful empty state for clients), never crash the render pipeline
- **Screen matching priority**: surface-specific id wins (`play_display`), then exact phase id, then prefix fallback
- **Template defaults are copied**: `getDefaultTemplate()` returns deep copies to prevent shared-reference mutation bugs
- **CSS naming convention**: `--color-primary`, `--font-family`, `--spacing-unit`, `--border-radius` for client-side theme injection
- **No imports from other V2 subsystems**: Fully standalone presentation layer; wire-up at interpreter level

---

## Phase 4.1 — Rule Engine

**Date:** 2026-03-13  
**Commit:** feat(v2): Phase 4.1 — Rule Engine  
**Subsystem:** `server/src/runtime/rule-engine/`

### What Was Built

A declarative rule evaluation engine that lets game schemas define game logic as data (conditions, actions, and constraints) without writing TypeScript.

### Files Created

| File | Purpose |
|------|---------|
| `rule-engine/types.ts` | Type definitions: RuleDeclaration, RuleCondition, RuleAction, RuleContext, RuleResult, BuiltInRule |
| `rule-engine/expression-evaluator.ts` | Safe recursive descent parser — no eval(), no new Function() |
| `rule-engine/condition-evaluator.ts` | Evaluates RuleCondition trees (comparison, logical, expression, builtin) |
| `rule-engine/builtin-rules.ts` | Registry of 10 common game rule patterns |
| `rule-engine/rule-engine.ts` | Main RuleEngine class with evaluate/enable/disable/add/remove |
| `rule-engine/schema-integration.ts` | Zod schemas for YAML validation, parseRules/safeParseRules |
| `rule-engine/index.ts` | Public API |
| `rule-engine/__tests__/rule-engine.test.ts` | Comprehensive test suite |
| `rule-engine/README.md` | Subsystem documentation |
| `rule-engine/DECISIONS.md` | Architecture decision records |

### Capabilities

**Expression Language** (safe recursive descent parser):
- Field access: `globals.score`, `phase.name`, `$event.type`, `$players.count`
- Comparisons: `==`, `!=`, `>`, `<`, `>=`, `<=`
- Boolean operators: `&&`, `||`, `!`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- String methods: `.contains()`, `.startsWith()`, `.length`
- Array methods: `.includes()`, `.length`
- Ternary: `condition ? valueA : valueB`
- Parentheses grouping: `(a + b) * 2`
- Literals: numbers, strings (single/double quoted), booleans, null

**Condition Types:**
- `comparison` — compare field paths or literals with 8 operators including `contains` and `in`
- `and` / `or` / `not` — arbitrary nesting and composition
- `expression` — free-form expression string
- `builtin` — named rule from the built-in registry

**Built-in Rules:**
- `all_players_submitted`, `timer_expired`, `min_players`, `max_players`
- `score_reached`, `all_equal`, `majority_vote`, `last_standing`
- `round_limit`, `items_remaining`
- Custom built-ins via `registerBuiltIn(name, fn)`

**Action Types:**
- `set` — set state field to value
- `increment` — increment numeric field
- `emit` — emit named event
- `transition` — trigger phase transition
- `custom` — invoke registered handler

**RuleEngine Class:**
- `evaluate(context)` — evaluate all enabled rules sorted by priority
- `evaluateRule(id, context)` — evaluate a single rule
- `enable(id)` / `disable(id)` — toggle rules at runtime
- `addRule(rule)` / `removeRule(id)` — dynamic rule management
- `getRules()` — get all rules in priority order
- `registerCustomAction(name, handler)` — register custom action handlers

### Architecture Decisions

- **No eval()**: Full recursive descent parser for security (game schemas are user-authored)
- **Evaluate-not-execute**: Engine returns `RuleResult[]` — callers execute actions (no circular deps with StateManager/EventEngine/PhaseMachine)
- **Module-level builtin registry**: Built-ins registered at module load; `registerBuiltIn()` for extensions
- **Wildcard paths in built-ins**: `players.*.score` expands to array of values for any/all checks
- **Zod recursive schemas**: `z.lazy()` for `LogicalCondition.conditions` to support arbitrary nesting

See `DECISIONS.md` in the subsystem directory for full rationale.

### Test Count

**87 new tests** (rule-engine subsystem)  
**855 total tests** (all subsystems combined, 2 pre-existing failures in presentation-system unrelated to this work)

### Notable Design Patterns

- Rules are pure data in game YAML — zero game-specific TypeScript required for common patterns
- Priority system ensures deterministic evaluation order (higher number = evaluated first)
- `else` actions optional — allows rules to declare consequences for both outcomes
- `enabled` flag allows runtime toggling (e.g., disable winner check until minimum rounds played)

---

## Phase 4.2 — Extension System
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/extension-system/` subsystem:

- **`types.ts`** — Core type definitions: `ExtensionDeclaration`, `ExtensionCapabilities`, `RendererExtension`, `RuleExtension`, `InteractionExtension`, `LifecycleHookExtension`, `RuleExtensionContext`, `LifecycleContext`, `LoadedExtension`
- **`extension-registry.ts`** — `ExtensionRegistry` class: registration, unregister, clear, lookup by ID/componentType/ruleType/widgetType, lifecycle hook index (per-event array), full validation on registration
- **`extension-sandbox.ts`** — Isolation utilities: `createSandboxedContext()` (deep-freeze via JSON round-trip), `validateExtensionImports()` (static regex analysis, 13 blocked subsystem paths), `wrapRuleHandler()` (sync error catching + 100ms timeout), `wrapLifecycleHandler()` (async Promise.race timeout + error catching)
- **`schema-integration.ts`** — Zod schemas: `ExtensionTypeSchema`, `ExtensionDeclarationSchema`, `ExtensionsArraySchema`; `parseExtensions()` / `safeParseExtensions()` helpers
- **`index.ts`** — Public API
- **`__tests__/extension-system.test.ts`** — 81 comprehensive tests
- **`README.md`** — Subsystem documentation
- **`DECISIONS.md`** — 10 architecture decision records

### Schema Extension (Non-Breaking)

- Updated `schema-engine/schema.ts`: Replaced the old `ExtensionsSchema` stub (untyped object map) with `ExtensionsArraySchema` from extension-system — typed array of `ExtensionDeclaration` objects
- Added import of `ExtensionsArraySchema` to schema-engine
- `extensions:` field in `GamePackageSchema` is still optional — all existing V2 game packages continue to work unchanged

### Extension Types

| Type | Description | Registry Index |
|------|-------------|---------------|
| `renderer` | Custom React component type | By `componentType` |
| `rule` | Custom rule evaluate function | By `ruleType` |
| `interaction` | Custom player input widget | By `widgetType` |
| `lifecycle` | Game lifecycle callbacks | By hook name (array) |
| `composite` | Multiple capability types | All applicable indexes |

### Isolation Guarantees

1. State passed to extensions is deep-frozen via `JSON.parse(JSON.stringify())` + recursive `Object.freeze()`
2. `wrapRuleHandler()` catches all errors → returns `false` + logs
3. `wrapLifecycleHandler()` catches all errors + enforces 1000ms timeout via `Promise.race`
4. `validateExtensionImports()` statically detects imports from 13 blocked engine subsystems
5. One `ExtensionRegistry` per game room — extensions from different games never share a registry

### Test Count

**81 new tests** (extension-system subsystem)  
**991 total passing tests** (all subsystems combined)

### Notable Decisions

- **No dynamic module loading**: `entryPoint` stored in schema but unused at runtime — safe dynamic loading (Worker threads) is Phase 5+ work
- **Metadata-only renderers**: Server stores componentType + propsSchema; actual React components registered client-side
- **Array schema**: `extensions:` is an array of declarations, not an object map — cleaner Zod validation, consistent with `rules:` section
- **Global type name uniqueness**: Duplicate componentType/ruleType/widgetType rejected globally within a registry — loud failure over silent override
- **Static import validation**: Regex-based, designed for CLI validator use; runtime enforcement requires Worker threads (future work)

---

## Phase 4.4 — AI Authoring Foundation
*Date: 2026-03-13*

### What Was Built

Created `server/src/runtime/authoring-system/` — the data layer for AI-assisted game creation.

**New files:**
- `types.ts` — All type definitions (GameIntrospection, ComplexityScore, GameTemplate, CapabilityDoc, ValidationResult, etc.)
- `introspector.ts` — `introspect()` + `calculateComplexity()`: analyze parsed game.yaml and return structured metadata
- `validator.ts` — `validateGamePackage()`: deep semantic validation beyond Zod structural checks
- `template-library.ts` — `getTemplate()` + `getAvailableTemplates()`: 8 complete game scaffolds
- `capability-docs.ts` — `getCapabilityDocs()` + `generateSchemaReference()`: LLM-ready runtime documentation
- `index.ts` — Public API
- `__tests__/authoring-system.test.ts` — 46 tests
- `README.md`, `DECISIONS.md`

### Game Templates Included

| Type | Description | Complexity |
|------|-------------|------------|
| `minimal` | Bare minimum: lobby → play → end | simple |
| `party` | Quiplash-style submit + vote | moderate |
| `trivia` | Multiple choice, timed | moderate |
| `hidden-role` | Werewolf-style social deduction | moderate |
| `drawing` | Pictionary-style draw + guess | moderate |
| `word` | Letter-set word game | moderate |
| `card` | Deck/deal/play skeleton | moderate |
| `board` | Grid board game skeleton | moderate |

### Validation Checks

- Phase transitions reference existing phases
- No orphaned phases (unreachable via BFS from initial)
- At least one phase has player interaction
- Content pool references are valid
- Score track references in rules are valid
- Victory condition references valid track
- Extension types are built-in or declared

### Architecture Compliance

- Zero imports from runtime subsystems (pure data layer)
- No game-specific code
- No circular imports
- All functions are pure (no side effects)

### Test Count

**46 new tests** (authoring-system subsystem)
**1,037 total tests** (all subsystems combined, 0 failures)
