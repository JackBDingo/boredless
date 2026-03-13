# State Manager

Authoritative game state storage for V2 declarative games. Replaces the per-game `this.states = new Map<string, GameState>()` pattern with a schema-driven, observable, visibility-aware state container.

One `StateManager` instance exists per room per game session.

---

## Public API

Import only from `state-manager/index.ts`.

### Class: `StateManager`

```ts
import { StateManager } from './runtime/state-manager/index.js';
import type { StateChangeEvent, StateChangeListener, StateSnapshot } from './runtime/state-manager/index.js';

const sm = new StateManager(stateModel, playerIds);
```

**Constructor:**
```ts
constructor(stateModel: StateModel, playerIds: string[])
```
Initializes all globals and per-player fields from schema defaults. `stateModel` is the `state_model` section of a validated `GamePackage`.

**Global state:**
```ts
sm.getGlobal(field: string): unknown
sm.setGlobal(field: string, value: unknown): void
sm.getGlobals(): Record<string, unknown>  // shallow copy
```

**Per-player state:**
```ts
sm.getPlayer(playerId: string, field: string): unknown
sm.setPlayer(playerId: string, field: string, value: unknown): void
sm.getPlayerState(playerId: string): Record<string, unknown>  // shallow copy
sm.getAllPlayerStates(): Map<string, Record<string, unknown>>  // shallow copies
sm.getPlayerIds(): string[]
```

**Per-team state (stub — Phase 2):**
```ts
sm.getTeam(teamId: string, field: string): unknown
sm.setTeam(teamId: string, field: string, value: unknown): void
```

**Bulk operations:**
```ts
sm.setPlayerAll(field: string, value: unknown): void     // same value for ALL players
sm.resetTransientState(): void                           // reset ALL fields to schema defaults
```

**Visibility projection:**
```ts
sm.getPublicState(): Record<string, unknown>             // public globals + public per-player fields
sm.getPrivateState(playerId: string): Record<string, unknown>  // all fields for player, public for others
```

**Change observation:**
```ts
const unsubscribe = sm.onChange((event: StateChangeEvent) => {
  // event.scope: 'global' | 'player' | 'team'
  // event.field, event.oldValue, event.newValue
  // event.playerId (if scope === 'player')
});
unsubscribe(); // stop listening
```

**Snapshot:**
```ts
const snap: StateSnapshot = sm.snapshot();
// snap.globals, snap.players, snap.teams — all deep copies, mutations do not affect live state
```

---

## Usage Example

```ts
import { loadGamePackage } from '../schema-engine/index.js';
import { StateManager } from '../state-manager/index.js';

const pkg = loadGamePackage('./games/my-game/game.yaml');
const sm = new StateManager(pkg.state_model, ['player-1', 'player-2', 'player-3']);

// Read schema defaults
sm.getGlobal('round');              // 0 (from state_model.globals.round.default)
sm.getPlayer('player-1', 'score'); // 0 (from state_model.per_player.score.default)

// Mutate state
sm.setGlobal('round', 1);
sm.setPlayer('player-1', 'score', 150);

// Reset all players' answer field before a new round
sm.setPlayerAll('answer', null);

// Get public state for display screen
const publicState = sm.getPublicState();
// { globals: { round: 1, ... }, players: { 'player-1': { score: 150 }, ... } }

// Get private state for player-1's phone
const privateState = sm.getPrivateState('player-1');
// Includes player-1's 'answer' field; other players only show 'score'

// Observe changes
sm.onChange((event) => {
  console.log(`${event.scope}.${event.field}: ${event.oldValue} → ${event.newValue}`);
});
```

---

## Tests

59 tests in `__tests__/state-manager.test.ts`.

```bash
npx vitest run server/src/runtime/state-manager
```

Covers: schema-driven initialization, get/set for all scopes, bulk operations, change events (subscribe, unsubscribe, multi-listener), visibility projection, snapshot isolation, edge cases (null defaults, missing sections, unknown player auto-registration).

---

## Dependencies

- **Imports from:** `../schema-engine/index.js` (types: `StateModel`, `StateField`)
- **Imports from:** `./types.js` (internal types only)
- **Imported by:** `phase-machine/`, `interpreter/`

See `DECISIONS.md` for detailed design rationale.
