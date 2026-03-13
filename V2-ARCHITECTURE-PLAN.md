# Boredless V2 — Declarative Game Runtime Architecture Plan

**Author:** Jack Vincent, Technical Cofounder  
**Date:** 2026-03-12  
**Status:** Planning — Pre-Implementation  
**Baseline:** v1.0 tag (commit 1dd462b)

---

## Executive Summary

Boredless V1 has a solid runtime kernel — rooms, sessions, timers, events, reconnects, authoritative state — but games are bespoke imperative modules (~500-900 lines each). V2 evolves the platform into a **declarative game operating system** where games are structured data packages interpreted by the runtime, not custom code that calls the runtime ad hoc.

The transformation is **not** a rewrite. It's an extraction: pull the patterns already embedded in 8 working games into reusable runtime primitives, then layer a declarative schema on top.

---

## Table of Contents

1. [Target Architecture](#1-target-architecture)
2. [Subsystem Decomposition](#2-subsystem-decomposition)
3. [Prioritized Build Plan](#3-prioritized-build-plan)
4. [Migration Strategy](#4-migration-strategy)
5. [Schema Design](#5-schema-design)
6. [Validation Strategy](#6-validation-strategy)
7. [Extension Model](#7-extension-model)
8. [Risk Analysis](#8-risk-analysis)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Anti-Drift Protocol](#10-anti-drift-protocol)
11. [Immediate Next Step](#11-immediate-next-step)

---

## 1. Target Architecture

### Conceptual Model

```
┌──────────────────────────────────────────────┐
│              GAME PACKAGE (data)             │
│  manifest · schema · phases · rules          │
│  content · assets · presentation · extensions│
└──────────────┬───────────────────────────────┘
               │ loaded & validated by
┌──────────────▼───────────────────────────────┐
│            RUNTIME KERNEL (code)             │
│                                              │
│  ┌─────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Schema  │ │ Phase    │ │ Interaction  │  │
│  │ Engine  │ │ Machine  │ │ Primitives   │  │
│  └────┬────┘ └────┬─────┘ └──────┬───────┘  │
│       │           │              │           │
│  ┌────▼────┐ ┌────▼─────┐ ┌─────▼────────┐  │
│  │Visibility│ │ Event   │ │  Scoring /   │  │
│  │Projection│ │ System  │ │  Victory     │  │
│  └────┬────┘ └────┬─────┘ └──────┬───────┘  │
│       │           │              │           │
│  ┌────▼────┐ ┌────▼─────┐ ┌─────▼────────┐  │
│  │ Object  │ │ Content  │ │ Presentation │  │
│  │ Models  │ │ System   │ │ / Theming    │  │
│  └─────────┘ └──────────┘ └──────────────┘  │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │   Extension Sandbox (custom code)   │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 Display    Phones     Spectators
 (TV)      (Players)   (Observers)
```

### Key Architectural Principles

1. **Runtime interprets games** — Games declare behavior; the kernel executes it.
2. **Declarative first, imperative escape hatch** — Most games are pure data. Complex games register typed extensions for specific subsystems.
3. **Forward compatible** — Schema versions are explicit. Old packages run on new runtimes.
4. **AI-authorable** — Structured, typed, validatable. No hidden magic.
5. **Hybrid migration** — V1 imperative modules coexist with V2 declarative packages during transition.

---

## 2. Subsystem Decomposition

### 2.1 Runtime Kernel (exists — needs evolution)

**Purpose:** Session lifecycle, room management, WebSocket transport, reconnects.

**Already owns:** Room CRUD, player join/leave/kick, display sessions, WS message routing, reconnect tokens.

**V2 additions:**
- Game package loader (replaces auto-discover.ts)
- Schema validation on load
- Hybrid dispatch: declarative interpreter OR legacy GameModule

**Boundaries:** Never contains game-specific logic. Delegates to subsystems.

---

### 2.2 Schema Engine (new)

**Purpose:** Load, validate, and provide typed access to game package definitions.

**Responsibilities:**
- Parse game packages (YAML/JSON)
- Validate against Zod schemas (evolved from ManifestSchema)
- Provide runtime access to typed game definition data
- Version negotiation (schema_version field)

**Not responsible for:** Executing game logic, rendering.

---

### 2.3 State Manager (new — replaces per-game state maps)

**Purpose:** Authoritative game state storage with structured typing.

**Responsibilities:**
- Initialize state from schema defaults
- Typed get/set: globals, per-player, per-team state
- State change events (observable, feeds Event System)
- Transient phase state that auto-clears on phase exit
- State snapshots for replay/debugging

**Not responsible for:** Deciding what to mutate (that's rules/events).

---

### 2.4 Phase Machine (exists as pattern — needs extraction)

**Purpose:** Orchestrate phase/state transitions as a graph.

**Currently:** Each game module has its own phase transition logic (switch statements, startRound(), advanceToVoting()). Zero reuse.

**V2 design:**
- Phase graph defined in game schema (nodes + edges + conditions)
- Phase types: timed, input_gate, conditional, loop, simultaneous
- Each phase node: duration, entry/exit actions, required inputs, transition conditions, visible screens
- Phase Machine evaluates transitions when conditions are met

---

### 2.5 Interaction Primitive Layer (new)

**Purpose:** Reusable, validated player input types.

**Currently:** Each game defines ad-hoc input handling. Blackjack has hit/stand/double/split. Village has vote/use_ability. WordCraft has place/swap/pass. No reuse.

**Standard primitives:**

| Primitive | Description | Example Games |
|-----------|-------------|---------------|
| choice | Pick one from options | Blackjack actions, menus |
| multi_choice | Pick multiple | Card selection |
| text_submit | Free text | Bluffalo fake answers |
| vote | Select player/option | Village, Bluffalo |
| tile_place | Place tiles on grid | WordCraft |
| card_play | Play from hand | CAH, poker |
| bet | Numeric wager | Texas Hold'em |
| target_player | Select another player | Werewolf, assassination |
| confirm | Acknowledge/continue | Round start |
| draw_canvas | Freeform drawing | Future drawing games |
| drag_sort | Reorder list | Ranking games |
| structured_message | Key-value payload | Trade/negotiation |

**Each primitive declares:** payload schema, valid actors, validation rules, timing behavior, resolution behavior. Games can register custom primitives.

---

### 2.6 Visibility & Projection System (partial — needs generalization)

**Purpose:** Control who sees what state.

**Currently:** getPublicState() + getPrivateState(playerId). Hardcoded per game.

**V2 audience scopes:**
- public — display + all players
- player:<id> — specific player
- team:<id> — team members
- role:<id> — players with role
- host — host only
- spectators — observers
- eliminated — dead players
- computed — dynamic from rule expression

**Projection operations:** redact, transform (e.g. show "?" for hidden cards), summarize.

State declarations include visibility annotations:
```yaml
state_model:
  per_player:
    hand:
      type: card_list
      visibility: player    # only visible to owner
    score:
      type: integer
      visibility: public
    role:
      type: role_ref
      visibility: player    # hidden until reveal phase
```

---

### 2.7 Event System (partial — needs declarative layer)

**Purpose:** Trigger-effect pairs that drive dynamic game behavior.

**Currently:** Platform events (PHASE_CHANGED etc.) + custom GAME_EVENT. Triggers and effects hardcoded in game modules.

**V2 declarative events:**
```yaml
events:
  - id: comeback_bonus
    trigger:
      type: score_threshold
      condition: "leader_score - player_score > 500"
    effect:
      type: score_modifier
      multiplier: 1.5
      target: trailing_player
      duration: 1_round
```

**Trigger types:** phase_start/end, timer_expire/threshold, input_received, all_inputs_received, player_eliminated, score_threshold, round_start/end, state_change, random_chance, host_action, content_depleted.

**Effect types:** state_mutation, score_modifier, timer_change, media_playback, announcement, phase_jump, content_inject, role_transform, rule_modifier, emit_event.

---

### 2.8 Scoring & Victory Engine (exists — needs schema-driven layer)

**Currently:** ScoreEngine handles per-player scores. Each game does its own scoring math.

**V2 additions:**
- Per-team scoring
- Score multipliers, streaks, hidden scores
- Declarative scoring formulas
- Victory conditions as schema:
```yaml
victory:
  type: highest_score_after_rounds
  rounds: 6
  tiebreak: most_correct_guesses
```

**Victory patterns:** highest_score, target_score, last_standing, team_objective, faction_parity, board_objective, narrative_endpoint, multi_condition.

---

### 2.9 Object Model System (new)

**Purpose:** First-class reusable game entities.

**Currently:** Each game invents its own. BoardCell[][] in WordCraft, Card/Hand in 4 different card games. Zero reuse.

**Built-in object types:**

| Type | Description | Used By |
|------|-------------|---------|
| board | 2D grid with cell types | WordCraft, Battleship |
| deck | Ordered collection, draw/shuffle/discard | All card games |
| hand | Player-owned card/tile collection | Card games, WC rack |
| zone | Named area (discard pile, community cards) | Poker |
| tile | Placeable piece with properties | WordCraft |
| card | Data with face/back, properties | All card games |
| marker | Position on board/track | Score tracks |
| pool | Unordered bag to draw from | Tile bags |

Each type: schema definition, standard operations, visibility rules.

---

### 2.10 Content System (partial — needs formalization)

**Purpose:** Separate game content from game logic.

**Currently:** CAH has cards.json. Bluffalo has prompts.ts. Others inline everything. No unified system.

**V2 design:**
- Content declared as typed pools in game schema
- Selection modes: random, weighted, sequential, filtered-by-tag
- Content packs as loadable bundles (expansion packs)
- Generated content provider interface (AI generation later)

```yaml
content:
  prompts:
    type: prompt_pool
    source: ./prompts.json
    selection: random_no_repeat
    schema:
      question: string
      answer: string
      difficulty: [easy, medium, hard]
```

---

### 2.11 Presentation & Theming System (needs design)

**Purpose:** Visual identity per game without custom code for every screen.

**Three-tier approach:**

**Tier 1 — Templated screens** (runtime provides):
Lobby, Instructions, Scoreboard, Final Results, Prompt display, Voting grid, Reveal sequence, Timer overlay, Role reveal, Elimination announcement.

**Tier 2 — Themed rendering** (data-driven):
```yaml
presentation:
  theme:
    accent: amber
    background: dark
    typography: serif
    motion: smooth
    sound_profile: tense
```

**Tier 3 — Custom renderers** (extension code):
For specialized UI (WordCraft board, poker table, battle grid). Register custom React components; runtime provides typed data; renderer provides layout.

**Multi-surface:** Each screen can have separate declarations for display (TV), phone, spectator.

---

### 2.12 Turn & Initiative System (new)

**Purpose:** Manage who acts when.

**Currently:** Each game manages turn order internally.

**V2 turn models:** round_robin, simultaneous, priority_queue, team_alternating, interrupt.
**Turn order generation:** random, seated, score-based, role-priority.
Runtime tracks active players, manages skip/timeout.

---

### 2.13 Rule Evaluator (new)

**Three layers:**

1. **Built-in rule types** — Common patterns: min_word_length, max_bet, must_connect_to_existing
2. **Rule expressions** — Formula language for conditions: "player.score >= 121", "placed_tiles.length >= 1 AND all_tiles_in_line"
3. **Extension evaluators** — Typed functions for complex rules (dictionary validation, poker hand evaluation), declared in schema

---

### 2.14 Extension Sandbox

**Purpose:** Safe escape hatch for games exceeding declarative capability.

**Extension points:** custom renderers, interaction widgets, rule evaluators, object behaviors, content generators, scoring functions.

**Constraints:**
- Declared in game schema (no hidden imports)
- Receive typed copies of state, not references
- Cannot access engine internals
- Isolated per game
- Runtime remains authoritative — extensions advise, runtime decides

---

## 3. Prioritized Build Plan

### Sequencing Rationale

Order determined by dependency chains and leverage — what unlocks the most capability while keeping the system working throughout.

```
Phase 0: Foundation (Schema Engine + State Manager)
    ↓
Phase 1: Core Interpreter (Phase Machine + Interaction Primitives)
    ↓
Phase 2: Advanced Systems (Events + Visibility + Object Models)
    ↓
Phase 3: Content & Presentation
    ↓
Phase 4: Intelligence (Rules + Extensions + AI Authoring)
    ↓
Phase 5: Full Migration + Polish
```

---

### Phase 0 — Foundation (Week 1-2)

**Goal:** Game state lives in the runtime, not in game modules. Game definitions are validated data.

#### 0.1 Schema Engine
- Design top-level game package schema (Zod)
- Evolve ManifestSchema into full GamePackageSchema
- Package loader: YAML → parse → validate → return typed GamePackage
- Schema versioning: schema_version field with migration support

#### 0.2 State Manager
- Design StateManager class (replaces per-game `states = new Map<>()`)
- Typed state access: get('globals.turn_number'), getPlayer(id, 'score')
- State initialization from schema defaults
- State change events (observable)
- Transient phase state that auto-clears on phase exit

#### 0.3 Hybrid Loader
- Modify auto-discover.ts: detect V2 packages (has schema_version in manifest)
- V2 packages → declarative interpreter; V1 packages → legacy GameModule
- Both types coexist in same runtime

---

### Phase 1 — Core Interpreter (Week 2-4)

**Goal:** A declarative game can progress through phases and accept player input without custom code.

#### 1.1 Phase Machine
- Design phase graph schema (nodes, edges, conditions)
- Implement PhaseMachine class
- Phase types: timed, input_gate, conditional, loop
- Entry/exit actions (state mutations via State Manager)
- Timer integration (reuse existing TimerEngine)
- Auto-advance on timer expiry or condition met

#### 1.2 Interaction Primitives
- Define primitive registry with Zod schemas per type
- Implement: choice, text_submit, vote, confirm (covers Bluffalo)
- Input validation against primitive schema
- Input routing: check whose turn, check valid phase
- Input collection: track submissions, detect "all submitted"

#### 1.3 Declarative Game Interpreter
- DeclarativeGameModule — implements GameModule interface
- Loads game package → State Manager + Phase Machine
- Routes handleInput() to Interaction Primitives
- Generates getPublicState() and getPrivateState() from State Manager projections
- **Milestone:** Bluffalo-equivalent runs entirely from YAML

---

### Phase 2 — Advanced Systems (Week 4-6)

**Goal:** Support hidden information, dynamic events, reusable game objects.

#### 2.1 Visibility & Projection
- Audience scope system: public, player, team, role, host, spectator, eliminated
- State annotations: each field gets a visibility declaration
- Projection engine: given state + audience → visible state
- Redaction and transformation operations

#### 2.2 Event System (Declarative)
- Trigger registry (phase events, timer events, state changes)
- Effect executor (state mutations, score mods, media cues, announcements)
- Event declarations in game schema
- Event ordering and priority

#### 2.3 Object Models
- Generic object type system: deck, hand, board, pool, tile
- Standard operations per type (shuffle, draw, place, move)
- Object state integrated with State Manager
- Visibility per object (face-down cards, hidden hands)

#### 2.4 Turn & Initiative
- Turn model declarations: round_robin, simultaneous, priority_queue
- Active player tracking in State Manager
- Skip/timeout handling

---

### Phase 3 — Content & Presentation (Week 6-8)

**Goal:** Content is separable from logic. Games can be themed visually.

#### 3.1 Content System
- Content pool schema and loader
- Selection strategies: random, weighted, sequential, filtered
- Content sourcing: inline, local file, bundled
- Content pack interface (expansion packs)

#### 3.2 Presentation System
- Tier 1: Templated screen library (lobby, prompt, vote, reveal, scores, results)
- Tier 2: Per-game theme declarations
- Theme injection into display/phone components
- Multi-surface screen declarations

#### 3.3 Asset References
- Asset manifest in game package (images, audio, video refs)
- Asset resolution and preloading

---

### Phase 4 — Intelligence (Week 8-10)

**Goal:** Complex game rules work declaratively. Extension model is clean. AI generation path is open.

#### 4.1 Rule Evaluator
- Built-in rule types for common patterns
- Expression language for conditions and arithmetic
- Rule composition (AND/OR chains)

#### 4.2 Extension Model
- Extension declaration schema
- Custom renderer registration (React components)
- Custom rule evaluator registration (typed functions)
- Custom interaction widget registration
- Extension isolation (no engine internal access)

#### 4.3 Scoring & Victory (Declarative)
- Scoring formulas in schema
- Multiple score tracks
- Victory condition evaluation
- Tiebreak rules

#### 4.4 AI Authoring Foundation
- Game package introspection API
- Template game packages (party, card, board, hidden-role)
- Schema documentation generation

---

### Phase 5 — Full Migration & Polish (Week 10-12)

**Goal:** All V1 games migrated. Platform is production-ready.

#### 5.1 Migrate All V1 Games (simplest → most complex)
1. Bluffalo — pure declarative (zero extensions)
2. Cards Against Humanity — + content packs
3. Village of Shadows — + role system + visibility
4. Blackjack — + deck/hand objects + dealer extension
5. Cribbage — + card objects + scoring extension
6. Texas Hold'em — + bet primitive + hand evaluator extension
7. Battleship — + board object + placement rules
8. WordCraft — + board/tile objects + dictionary extension + custom renderer

#### 5.2 Remove Legacy Code
- Remove V1 GameModule implementations (or keep as compat shim)
- Remove per-game state management and phase logic
- Clean up unused imports and types

#### 5.3 Tooling
- boredless validate <package> — CLI validation
- boredless scaffold <template> — starter package generator
- boredless test <package> — headless simulation

---

## 4. Migration Strategy

### Principles
1. **No big bang.** V1 and V2 coexist during migration.
2. **Outside-in.** Migrate simple games first, complex games last.
3. **Keep playing.** All games remain playable at every step.
4. **Extract, don't invent.** Pull patterns from existing games into the runtime.

### Hybrid Runtime

```
auto-discover.ts (modified)
  ├── V1 game (no schema_version) → load as GameModule (legacy path)
  └── V2 game (has schema_version) → load as GamePackage (declarative interpreter)
```

DeclarativeGameModule implements GameModule. From the kernel's perspective, both are identical.

### What to Extract vs Build New

**Extract from existing games:**
- Phase transition patterns → Phase Machine
- Card/deck logic (4 card games) → Object Model
- Board logic (3 board games) → Object Model
- Input patterns → Interaction Primitives

**Build new:**
- Schema Engine (no equivalent exists)
- State Manager (currently ad-hoc per game)
- Visibility Projection (currently manual per game)
- Declarative Event System
- Rule Evaluator
- Content System

---

## 5. Schema Design

### Top-Level Game Package Structure

```yaml
# game.yaml

schema_version: "2.0"

manifest:
  id: bluffalo
  name: Bluffalo
  description: "Players write fake answers. Everyone votes. Fools win."
  version: "1.0.0"
  author: Boredless
  tags: [party, bluffing, writing]
  players: { min: 3, max: 8 }
  estimated_minutes: { min: 10, max: 20 }
  icon: swords
  accent_color: violet

state_model:
  globals:
    round: { type: integer, default: 0 }
    total_rounds: { type: integer, default: 6 }
    current_prompt: { type: content_ref, pool: prompts }
  per_player:
    score: { type: integer, default: 0, visibility: public }
    submission: { type: string, default: null, visibility: private }
    vote: { type: string, default: null, visibility: private }

turn_model:
  type: simultaneous

phases:
  instructions:
    type: timed
    duration: 8s
    screen:
      display: template:instructions
      phone: template:instructions
    on_exit:
      - action: advance
        to: prompt_reveal

  prompt_reveal:
    type: timed
    duration: 5s
    on_enter:
      - action: content_draw
        pool: prompts
        target: globals.current_prompt
    screen:
      display: template:prompt
    on_exit:
      - action: advance
        to: submit_lie

  submit_lie:
    type: input_gate
    duration: 30s
    input:
      primitive: text_submit
      target: per_player.submission
      required: all_players
    screen:
      display: template:waiting
      phone: template:text_input
    on_complete:
      - action: advance
        to: vote

  vote:
    type: input_gate
    duration: 20s
    on_enter:
      - action: shuffle_and_merge
        sources: [per_player.submission, globals.current_prompt.answer]
        target: globals.answer_list
    input:
      primitive: choice
      options: globals.answer_list
      target: per_player.vote
      required: all_players
    on_complete:
      - action: advance
        to: reveal

  reveal:
    type: timed
    duration: 10s
    on_enter:
      - action: score_round
        formulas:
          correct_guess: 100
          fooled_player: 50
    on_exit:
      - action: conditional
        condition: "globals.round < globals.total_rounds"
        then: { advance_to: prompt_reveal }
        else: { advance_to: final_scores }

  final_scores:
    type: timed
    duration: 10s
    screen:
      display: template:final_results
      phone: template:final_results

content:
  prompts:
    type: prompt_pool
    source: ./prompts.json
    schema:
      question: string
      answer: string
    selection: random_no_repeat

presentation:
  theme:
    accent: violet
    background: dark
    typography: rounded
    motion: playful

victory:
  type: highest_score
  after: all_rounds
  tiebreak: most_correct_guesses

scoring:
  correct_guess: 100
  fooled_player: 50
```

### Schema Domains Summary

| Domain | Purpose | Required? |
|--------|---------|-----------|
| manifest | Identity, metadata, compatibility | Yes |
| state_model | Typed game state (globals, per-player, per-team) | Yes |
| turn_model | Initiative/turn structure | Yes |
| phases | Phase graph with transitions | Yes |
| content | Content pools and selection | Conditional |
| presentation | Theming and screen config | Yes |
| scoring | Score formulas and patterns | Yes |
| victory | Win conditions | Yes |
| events | Dynamic triggers and effects | Optional |
| roles | Role definitions (hidden-role games) | Optional |
| teams | Team definitions | Optional |
| objects | Game entity declarations (boards, decks) | Optional |
| rules | Legality and resolution rules | Optional |
| extensions | Custom code registrations | Optional |
| authoring | Metadata for tooling and AI | Optional |

---

## 6. Validation Strategy

### Four Layers

**1. Schema validation (Zod)** — Structural correctness at load time
- All required fields present, types match, references resolve

**2. Semantic validation** — Logical correctness
- Phase graph is connected (no orphan nodes, all reachable from start)
- Input primitives reference valid state targets
- Scoring formulas reference valid state fields

**3. Runtime validation** — Correctness during execution
- State mutations stay within declared types
- Input payloads match primitive schemas
- Extension functions return expected types

**4. Package validation CLI** — Pre-load checking
- boredless validate game.yaml — schema + semantic checks
- boredless simulate game.yaml --players 4 — dry-run with synthetic inputs

### Schema Evolution
- schema_version field in every package
- Backward compat: runtime supports loading older versions
- Migration scripts for version bumps
- New runtime features don't break old packages

### Error Reporting
All validation errors include:
- Path to problematic field (phases.submit_lie.input.primitive)
- What was expected vs what was found
- Suggested fix when possible

---

## 7. Extension Model

### Philosophy

Extensions are **declared escape hatches**, not backdoors. The runtime maintains authority. Extensions provide specialized capability that the declarative system can't express.

### Extension Types

**Custom Renderers:**
```yaml
extensions:
  renderers:
    wordcraft_board:
      display: ./display/WCDisplay.tsx
      phone: ./phone/WCPhone.tsx
      props_schema:
        board: board_ref
        rack: hand_ref
```

**Custom Rule Evaluators:**
```yaml
extensions:
  rules:
    validate_word:
      module: ./server/dictionary.ts
      function: isValidWord
      input: { word: string }
      output: boolean
```

**Custom Interaction Widgets:**
```yaml
extensions:
  interactions:
    tile_placer:
      phone: ./phone/TilePlacer.tsx
      payload_schema:
        tiles: array_of_tile_placement
      validator: ./server/validate_placement.ts
```

### Isolation Guarantees
1. Sandboxed per game — no cross-game access
2. Receive copies of state, not references
3. Results validated against declared output schemas
4. Cannot call engine APIs directly
5. All declared in manifest — no dynamic loading

---

## 8. Risk Analysis

**Risk 1: Over-Generalization**  
Building a "game engine for everything" too abstract to use.  
*Mitigation:* Every abstraction justifies itself against ≥2 existing games. Single-game needs → extension, not primitive.

**Risk 2: Under-Generalization**  
Schema designed only for current 8 games, can't express future ones.  
*Mitigation:* Validate schema against hypothetical games (heist, negotiation, dating show, escape room) during design. Extension model is the safety valve.

**Risk 3: Phase Machine Complexity**  
Phase graph abstraction becomes harder than imperative code.  
*Mitigation:* Most games use linear/loop patterns. Complex patterns (branching, concurrent) are opt-in. Start simple, add complexity only when a real game needs it.

**Risk 4: Performance Regression**  
Declarative interpretation slower than direct TypeScript.  
*Mitigation:* Game logic operates at ms-scale. Performance not a concern for turn-based social games at this layer.

**Risk 5: Migration Breaks Working Games**  
Migrating V1 games introduces regressions.  
*Mitigation:* v1.0 tag exists. Hybrid runtime allows incremental migration. Each migrated game gets full playtest before imperative version is removed.

**Risk 6: Expression Language Scope Creep**  
Rule expression language grows into an ad-hoc programming language.  
*Mitigation:* Strict feature budget. If a rule can't be expressed in the formula language, it becomes an extension function. No control flow in expressions.

**Risk 7: Presentation Lock-In**  
Templated screens force all games to look identical.  
*Mitigation:* Three-tier approach. Templates for common screens, themes for identity, custom renderers for unique UI. No game is forced into templates alone.

**Risk 8: Schema Churn**  
Schema changes frequently, breaking games.  
*Mitigation:* Schema versioning from day one. Breaking changes bump version. Migration utilities provided.

---

## 9. Acceptance Criteria

### Global Criteria (Every Phase)
- [ ] All existing V1 games still work (run test suite after every change)
- [ ] No new TypeScript compilation errors
- [ ] All new code has integration tests
- [ ] New subsystems have clear module boundaries (no circular imports)
- [ ] No game-specific code in runtime (no `if gameId === ...`)

---

### Phase 0 Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| P0-1 | Schema Engine loads and validates a game YAML | Unit test: valid file passes, invalid rejects with field path |
| P0-2 | State Manager initializes state from schema defaults | Unit test: 4-player game state correctly initialized |
| P0-3 | State Manager supports typed get/set for globals/per-player | Unit test: get/set operations with type checking |
| P0-4 | State change events fire on mutation | Unit test: subscribe → mutate → receive event |
| P0-5 | Hybrid loader distinguishes V1 from V2 packages | Integration test: V1 game + V2 stub both load |
| P0-6 | V1 games unchanged and playable | Manual playtest: start and complete one V1 game |

---

### Phase 1 Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| P1-1 | Phase Machine processes timed phases with auto-advance | Unit test: 3-phase linear game progresses correctly |
| P1-2 | Phase Machine handles input_gate phases | Unit test: phase advances when all inputs received |
| P1-3 | input_gate respects timeout with fill_missing_with_default | Unit test: timer expires, missing inputs filled, phase advances |
| P1-4 | Interaction primitives validate payloads | Unit test: valid vote accepted, malformed rejected with reason |
| P1-5 | DeclarativeGameModule implements GameModule interface | Integration test: kernel cannot distinguish V1 from V2 |
| P1-6 | Bluffalo-equivalent game runs from pure YAML | End-to-end: create room, join 3+ players, play full game |
| P1-7 | Phase transitions fire correct WebSocket messages | Integration test: client receives PHASE_CHANGED with correct data |

---

### Phase 2 Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| P2-1 | Visibility projection hides role from other players | Unit test: getPrivateState returns redacted role for non-owner |
| P2-2 | Declarative events fire on state change trigger | Unit test: score threshold event fires when condition met |
| P2-3 | Deck object: create, shuffle, draw, discard | Unit test: 52-card deck full operation cycle |
| P2-4 | Board object: create grid, place/remove tiles | Unit test: 15x15 board with tile placement and validation |
| P2-5 | Hand object: deal, draw, play, visibility | Unit test: deal 5 cards, verify only owner sees hand |
| P2-6 | Turn system manages round-robin with skip on timeout | Unit test: 4-player rotation, skip when timeout fires |
| P2-7 | Village-complexity game expressible in schema | Design review: complete Village of Shadows schema draft |

---

### Phase 3 Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| P3-1 | Content pool loads from JSON, draws without repeats | Unit test: draw all prompts, verify no duplicates |
| P3-2 | Content filtered by tag correctly | Unit test: filter by difficulty=hard, only hard prompts returned |
| P3-3 | Templated screens render for all standard phases | Visual test: lobby, scoreboard, results screens |
| P3-4 | Theme system applies per-game colors/typography | Visual test: two games with different themes look distinct |
| P3-5 | Assets referenced in schema preload on game start | Integration test: image + audio referenced in manifest load |
| P3-6 | Zero-code trivia game playable (content + schema only) | End-to-end: new game from schema alone, fully playable |

---

### Phase 4 Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| P4-1 | Built-in rules evaluate correctly | Unit test: min_word_length, max_bet, must_connect_existing |
| P4-2 | Expression language evaluates conditions and formulas | Unit test: score comparisons, arithmetic, boolean AND/OR |
| P4-3 | Custom renderer extension loads and receives typed props | Integration test: WordCraft board renders via extension |
| P4-4 | Custom rule evaluator callable from schema rules | Integration test: dictionary validation works via extension |
| P4-5 | Extension isolation: cannot import engine internals | Static analysis: extension imports limited to declared types |
| P4-6 | Victory conditions evaluate correctly | Unit test: highest_score, target_score, last_standing all work |
| P4-7 | Game package introspection API returns capabilities | Unit test: list primitives used, validate schema, list extensions |
| P4-8 | Template game package generates and passes validation | CLI test: scaffold party template → validate → load → start |

---

### Phase 5 Acceptance Criteria

| ID | Criterion | Verification Method |
|----|-----------|-------------------|
| P5-1 | All 8 games migrated to V2 declarative format | End-to-end: each game playable via declarative interpreter |
| P5-2 | No imperative GameModule implementations remain | Code search: zero files with `class.*implements GameModule` |
| P5-3 | CLI validate command works correctly | CLI test: valid package passes, invalid package fails with path |
| P5-4 | CLI scaffold command generates working starter | CLI test: scaffold + validate + load + start game |
| P5-5 | No performance degradation | Timing test: game start < 500ms, input processing < 50ms |
| P5-6 | All existing tests still pass | Test suite: zero regressions from V1 test suite |

---

## 10. Anti-Drift Protocol

### Purpose

Sub-agents doing implementation work tend to drift: taking shortcuts, collapsing abstractions, hardcoding what should be declarative, or solving problems in the wrong layer. This protocol prevents that.

---

### Rule 1: Schema Is Source of Truth

**Every game behavior must trace back to the game schema.**

If a sub-agent adds logic not driven by schema data, it's drift. Exception: extension functions, which must still be declared in the schema.

**Checkpoint question:** "If I deleted the TypeScript and only had the YAML, could I understand what this game does?"

---

### Rule 2: Subsystem Boundaries Are Non-Negotiable

**Each subsystem has a defined interface. No reaching across boundaries.**

```
State Manager   → accessed via StateManager API only, never direct Map access
Phase Machine   → driven by phase graph, not ad-hoc method calls
Visibility      → projection functions, not manual state filtering per game
Event System    → trigger/effect declarations, not hardcoded callbacks
Scoring Engine  → scoring engine API, not direct state mutation
```

**Checkpoint question:** "Am I importing from inside another subsystem, or only from its public API?"

---

### Rule 3: No Game-Specific Code in Runtime

**The kernel, Phase Machine, State Manager, and all subsystems are game-agnostic.**

If there's a `if (gameId === 'wordcraft')` anywhere in runtime code, it's drift. Game-specific behavior belongs in:
- The game schema (declarative)
- Extension functions (declared in schema, isolated per game)

**Checkpoint question:** "Would this code still make sense if WordCraft didn't exist?"

---

### Rule 4: Primitives Before Extensions

**Before creating an extension, verify the behavior can't be expressed with existing primitives + rules.**

Extensions are the escape hatch, not the default path. Each extension should be justified by a concrete limitation of the declarative system.

**Checkpoint question:** "What would I need to add to the declarative system to avoid this extension?"

---

### Rule 5: Test Against Multiple Games

**Every new subsystem feature must validate against at least 2 existing games.**

If a feature only works for one game, it's probably too specific.

**Checkpoint question:** "Does this work for Bluffalo AND Blackjack?" (or whichever two are relevant to the feature)

---

### Rule 6: Schema Version Discipline

**Breaking schema changes bump the version. Non-breaking changes don't.**

A breaking change causes a valid V2.0 package to fail on the new runtime. Adding optional fields is non-breaking. Changing field semantics is breaking.

---

### Rule 7: File Structure Per Subsystem

**Each subsystem lives in its own directory with a clear public API. No dumping grounds.**

```
server/src/runtime/
  schema-engine/
    index.ts          (public API)
    loader.ts
    validator.ts
  state-manager/
    index.ts          (public API)
    state-manager.ts
    projector.ts
  phase-machine/
    index.ts          (public API)
    phase-machine.ts
    graph.ts
  interaction-primitives/
    index.ts          (public API)
    registry.ts
    primitives/
      choice.ts
      text-submit.ts
      vote.ts
  visibility/
    index.ts
    projector.ts
  event-system/
    index.ts
    trigger-registry.ts
    effect-executor.ts
  scoring/           (evolve existing score-engine.ts)
  turn-system/
  object-models/
  content-system/
  rule-evaluator/
  extension-sandbox/
  interpreter/       (DeclarativeGameModule — ties everything together)
    index.ts
```

If a file grows past 300 lines, decompose it. No god files.

---

### Agent Briefing Template (MANDATORY HEADER FOR ALL V2 AGENTS)

Every sub-agent spawned for V2 work must receive this at the top of their task:

```
## V2 Architecture Constraints (NON-NEGOTIABLE)

1. Read /Users/jack/Development/boredless/V2-ARCHITECTURE-PLAN.md in full before starting.

2. Game logic lives in game schema (YAML/JSON), NOT in runtime TypeScript.

3. Subsystem boundaries: import only from a subsystem's public index.ts, never from its internals.

4. No game-specific code in runtime. Zero `if (gameId === ...)` in any runtime file.

5. Test every new feature against at least 2 existing games.

6. Extension functions must be declared in the game schema — no dynamic loading.

7. All V1 games must still work after your changes. Run the test suite before committing.

8. New files go in the correct subsystem directory under server/src/runtime/.

9. If you're uncertain whether something belongs in the declarative layer or an extension:
   - Try to express it in schema first
   - If it requires control flow logic, it's an extension evaluator
   - If it requires custom UI, it's a custom renderer extension
   - Document your decision in a DECISIONS.md file in the subsystem directory

10. Before finishing, verify:
    - No circular imports
    - No TypeScript compilation errors
    - At least one integration test for the new capability
    - The feature works for at least 2 different game types
```

---

### Architecture Review Checklist (Weekly or Post-Phase)

Run this review before merging each phase:

- [ ] Subsystem boundaries intact? (no cross-subsystem internal imports)
- [ ] Game-specific code leaking into runtime? (grep for game IDs in runtime code)
- [ ] Extensions justified? (could the declarative system be extended instead?)
- [ ] Schema still expresses hypothetical future games? (heist, negotiation, escape room)
- [ ] All V1 games still playable?
- [ ] New subsystem has integration tests?
- [ ] DECISIONS.md files written for non-obvious choices?

---

## 11. Immediate Next Step

### Recommendation: Phase 0.1 — Schema Engine

**Why first:** Everything else depends on it. You can't build the Phase Machine without knowing the phase graph schema. You can't build the State Manager without knowing the state_model schema. The schema defines the contract for every other subsystem.

**Concrete first task:**

1. Create `server/src/runtime/schema-engine/`
2. Define `GamePackageSchema` in Zod — start with manifest + state_model + phases (simplified)
3. Build the package loader: YAML → parse → validate → return typed `GamePackage`
4. Create a test game package: `games/_test-v2/game.yaml` (simple 3-phase game)
5. Modify `auto-discover.ts` to detect V2 packages (has `schema_version` field) and route them to the declarative interpreter stub

**What NOT to do in this task:**
- Don't implement the Phase Machine yet
- Don't implement the State Manager yet
- Don't migrate any existing games yet
- Don't design the full schema with all domains — schema expands as subsystems are built

**Agent time estimate:** 2-3 days.

**Second task:** State Manager (depends on schema state_model definition from 0.1).

**Third task:** Hybrid loader integration test (V1 game + V2 stub both load, both start).

Once Phase 0 is complete, we have the foundation to build Phase 1: a declarative game that actually runs.

---

## Appendix A: Hypothetical Game Validation

To ensure the schema is not over-fitted to current games, these games should be expressible:

| Game Concept | Key Mechanics | Schema Challenge |
|-------------|---------------|-----------------|
| Heist game | Roles, timed phases, team success/fail | Roles + team scoring + conditional victory |
| Dating show parody | Elimination voting, hidden preference, reveal | Elimination + hidden state + dramatic reveals |
| Murder mystery | Clue distribution, accusation, investigation | Content pools + hidden info + structured messaging |
| Negotiation game | Player-to-player trades, binding agreements | Structured message primitive + contract rules |
| Drawing game | Canvas input, voting on drawings | Draw primitive + media handling |
| Auction game | Bidding, budget management, simultaneous bids | Bet primitive + simultaneous resolution |
| Reality TV betrayal | Alliances, secret votes, immunity | Dynamic teams + hidden voting + immunity rules |
| Escape room | Puzzle solving, timed, shared discovery | Content sequencing + collaborative input + state puzzles |

Each of these should be expressible using schema + extensions without runtime changes.

---

## Appendix B: V1 → V2 Pattern Mapping

| V1 Pattern | V2 Equivalent |
|-----------|---------------|
| `class XModule implements GameModule` | DeclarativeGameModule interprets game package |
| `this.states = new Map<string, GameState>()` | StateManager per room |
| `switch(phase) { case 'voting': ... }` | Phase Machine graph traversal |
| `handleInput(roomId, playerId, type, payload)` | Interaction Primitive routing + validation |
| `getPublicState()` / `getPrivateState()` | Visibility projection from State Manager |
| `ctx.startTimer(phase, duration, callback)` | Phase node duration + on_exit actions |
| `ctx.addPoints(playerId, points)` | Scoring engine via score_round action |
| `ctx.broadcastPhase(...)` | Automatic on phase transition |
| Custom deck/card logic per game | Object Model deck/hand types |
| Custom board logic per game | Object Model board type |

---

*This document is the architectural north star for Boredless V2. Implementation is phased, tested, and reviewed against these specifications. When in doubt, refer to the Anti-Drift Protocol.*
