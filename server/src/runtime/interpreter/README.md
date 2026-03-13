# Interpreter

The Interpreter bridges V2 declarative game packages and the V1 kernel. `DeclarativeGameModule` implements the `GameModule` interface so any YAML-defined game package runs inside the existing room/session infrastructure without modification.

---

## What It Does

`DeclarativeGameModule` wires the V2 runtime subsystems together (`StateManager`, `PhaseMachine`, `InputCollector`, `ProjectionEngine`) and exposes the resulting behavior through the V1 `GameModule` contract. From the kernel's perspective, a declarative game is indistinguishable from a hand-written V1 module. There is no game-specific logic anywhere in this subsystem — all behavior is driven by the loaded `GamePackage`.

---

## Public API

Import only from `interpreter/index.ts`.

### `DeclarativeGameModule`

```ts
import { DeclarativeGameModule } from '../interpreter/index.js';

const module = new DeclarativeGameModule(definition, gamePackage);
// Optional: pass a TimerImpl for testing
const module = new DeclarativeGameModule(definition, gamePackage, timerImpl);
```

**Constructor parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `definition` | `GameDefinition` | V1-compatible metadata (id, name, min/max players) — used for catalog display |
| `gamePackage` | `GamePackage` | Fully validated V2 game package from `loadGamePackage()` |
| `timerImpl` | `TimerImpl?` | Optional timer override for testing (same interface as `PhaseMachine`) |

**Implements `GameModule` interface:**

```ts
module.definition                                   // GameDefinition
module.setup(players, ctx)                          // Called by kernel to start a game
module.getPhaseState(roomId)                        // → PhaseState (for reconnects)
module.getPublicState(roomId)                       // → Record<string, unknown>
module.getPrivateState(roomId, playerId)            // → Record<string, unknown>
module.handleInput(roomId, playerId, type, payload) // → { accepted, reason? }
module.teardown(roomId)                             // Called when room is destroyed
```

---

## Usage Example

```ts
import { DeclarativeGameModule } from '../interpreter/index.js';
import { loadGamePackage } from '../schema-engine/index.js';

// Load and validate a game package from YAML
const gamePackage = loadGamePackage('./games/word-blitz/game.yaml');

// Create the game definition (V1 catalog entry)
const definition: GameDefinition = {
  id: gamePackage.manifest.id,
  name: gamePackage.manifest.name,
  minPlayers: gamePackage.manifest.min_players,
  maxPlayers: gamePackage.manifest.max_players,
  description: gamePackage.manifest.description ?? '',
};

// Instantiate the module — no game-specific code here
const gameModule = new DeclarativeGameModule(definition, gamePackage);

// Register with the V1 game registry (unchanged from V1 pattern)
registerGame(gameModule);

// From this point on, the kernel drives the game via GameModule interface:
// kernel calls gameModule.setup(players, ctx) → game starts
// kernel calls gameModule.handleInput(roomId, playerId, 'text_submit', { value: 'hello' })
// kernel calls gameModule.teardown(roomId) → room destroyed
```

---

## How It Orchestrates Subsystems

```
handleInput(roomId, playerId, type, payload)
  → InputCollector.submit(playerId, value)     validate & track submission
  → PhaseMachine.submitInput(...)              store to StateManager, check completion

setup(players, ctx)
  → new StateManager(pkg.state_model, playerIds)
  → new ProjectionEngine(pkg.state_model)
  → new PhaseMachine(pkg.phases, stateManager, {
      onPhaseChange → setupInputCollector → ctx.broadcastPhase / broadcastPrivateState
      onGameEnd     → ctx.broadcastGameOver
      onAction      → handleAction (score_round, content_draw, etc.)
    })
  → phaseMachine.start(initialPhaseId)

getPublicState / getPrivateState
  → stateManager.snapshot()
  → projectionEngine.project(snapshot, audience)
```

---

## Handled vs. Delegated Actions

`PhaseMachine` delegates unknown actions to `onAction`. `DeclarativeGameModule.handleAction` handles:

| Action | Status |
|--------|--------|
| `score_round` | Phase 1 stub — logs, scoring engine ready in Phase 4 |
| `content_draw` | Phase 1 no-op — content system is Phase 3 |
| `shuffle_and_merge` | Phase 1 no-op — Phase 3 |
| unknown | `ctx.log.warn` |

---

## Tests

**36 tests** in `__tests__/interpreter.test.ts`.

```bash
npx vitest run server/src/runtime/interpreter
```

Covers: `setup()` game start flow, `handleInput()` validation and routing, `getPhaseState()` / `getPublicState()` / `getPrivateState()` correctness, `teardown()` cleanup, phase transitions driven end-to-end through the phase machine, and action handling stubs.

---

## Dependencies

**Imports FROM:**
- `../../games/game-module.js` — `GameModule` interface (V1 contract)
- `../../games/game-context.js` — `GameContext` interface (V1 kernel callbacks)
- `@boredless/shared` — `Player`, `PhaseState`, `GameDefinition`, `ServerMessageType`, `RoomStatus`
- `../schema-engine/index.js` — `GamePackage`, `PhaseAction`, `PhaseNode` types
- `../state-manager/index.js` — `StateManager`
- `../phase-machine/index.js` — `PhaseMachine`, `TimerImpl`
- `../interaction-primitives/index.js` — `InputCollector`, `createPrimitive`
- `../visibility/index.js` — `ProjectionEngine`, `Audience`
