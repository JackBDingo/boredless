# Turn & Initiative System

Manages player ordering, active player tracking, and turn progression declaratively. Game schemas declare a `turn_model` type; the `TurnManager` interprets it at runtime with zero game-specific code.

## What It Does

- Tracks who can currently act based on the declared turn model
- Advances turns through the turn order with wrap-around detection
- Fires events (`turn_start`, `turn_skip`, `round_complete`, etc.) via callback
- Handles player elimination and skip-this-round mechanics
- Supports optional direction reversal (UNO-style)
- Provides schema helpers (Zod) for validating `turn_model` YAML declarations

## Public API

### `TurnManager`

```ts
import { TurnManager } from '../turn-system/index.js';
import type { TurnModel, TurnManagerOptions, TurnEvent } from '../turn-system/index.js';

const model: TurnModel = { type: 'round_robin', reverseAllowed: false };
const tm = new TurnManager(model, ['alice', 'bob', 'carol'], {
  onTurnEvent: (e: TurnEvent) => console.log(e),
  shuffle: false,
});
```

**Methods:**

| Method | Returns | Description |
|--------|---------|-------------|
| `getState()` | `TurnState` | Immutable snapshot of current turn state |
| `getActivePlayerIds()` | `string[]` | Who can currently act |
| `isPlayerActive(id)` | `boolean` | Can this player act right now? |
| `getRemainingPlayers()` | `string[]` | Non-eliminated players in turn order |
| `advanceTurn()` | `void` | Move to next turn (model-specific) |
| `skipPlayer(id)` | `void` | Skip a player for this round |
| `eliminatePlayer(id)` | `void` | Permanently remove player from turn order |
| `reverseDirection()` | `void` | Reverse turn order (requires `reverseAllowed: true`) |
| `resetRound()` | `void` | Clear skipped set, reset index, increment round |
| `destroy()` | `void` | Cleanup (no-op; provided for API consistency) |

### Turn Models

| Model | Who Acts | `advanceTurn` behavior |
|-------|----------|----------------------|
| `simultaneous` | All non-eliminated | Increments round, fires `round_complete` |
| `round_robin` | One player at a time | Cycles through order; wraps = new round |
| `free_form` | All non-eliminated | No-op |
| `priority_queue` | First in queue | Advances position; end of queue = round_complete |
| `elimination` | All remaining | No-op (eliminations drive game) |

### Schema Integration

```ts
import { FullTurnModelSchema, turnModelFromYaml } from '../turn-system/index.js';

// Validate YAML input
const parsed = FullTurnModelSchema.safeParse({ type: 'round_robin', timeout: 30 });

// Convert to TurnModel (handles seconds → ms, sets defaults)
const model = turnModelFromYaml(parsed.data);
```

## Usage Example

```ts
// Blackjack-style: players act in round_robin, dealer is last
const tm = new TurnManager(
  { type: 'round_robin' },
  ['player1', 'player2', 'dealer'],
  { onTurnEvent: (e) => emitToRoom(e) }
);

// player1 hits → advance to player2
tm.advanceTurn();

// player2 busts → skip them
tm.skipPlayer('player2');  // advances to dealer

// Dealer plays → advance (wraps around, fires round_complete)
tm.advanceTurn();

// Check state
const state = tm.getState();
// { model: 'round_robin', activePlayerIds: ['player1'], round: 2, ... }
```

## Tests

**65 tests** covering all five turn models, events, edge cases, schema integration, and multi-game validation.

```bash
cd server && npx vitest run src/runtime/turn-system/__tests__/turn-system.test.ts
```

## Dependencies

- No imports from other subsystems (standalone)
- `zod` for schema validation (direct dependency)
- Types only: no runtime coupling to Schema Engine, State Manager, or Phase Machine

## YAML Declaration

```yaml
turn_model:
  type: round_robin       # required: simultaneous | round_robin | free_form | priority_queue | elimination
  timeout: 30             # optional: seconds per turn (caller manages actual timer)
  skip_on_timeout: true   # optional: skip player on timeout (default: true)
  reverse_allowed: false  # optional: allow direction reversal (default: false)
```
