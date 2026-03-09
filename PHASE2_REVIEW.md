# Phase 2 Review: Event Bus

**Date:** 2026-03-09
**Reviewer:** Jack Vincent (automated audit)
**Verdict:** Clean implementation. All core deliverables landed, types compile, tests pass. A few spec deviations worth tracking.

---

## Summary

Phase 2 delivers what it promised: `emit()`/`emitTo()`/`emitToDisplay()` on GameContext, `GAME_EVENT` message type in shared, Tier 1 platform event constants, and `useGameEvent` hooks wired into all four game components. Combined with the Phase 1 fixes (sendToPlayer → playerId, broadcast helpers), the platform's event infrastructure is solid.

No games actually emit or listen for custom events yet — the bus is infrastructure, ready for use. This is fine; games will adopt it as they need custom interactions (animations, reveals, etc.).

**tsc --noEmit:** CLEAN across all 4 tsconfigs (shared, server, display, phone)
**Tests:** 74/74 passing (10 test files, excluding e2e timing-dependent suite)

---

## 1. Contract Drift — GameContext

### Spec vs Implementation

| Spec method | Implemented? | Notes |
|---|---|---|
| `emit(event, data?)` | ✅ | Matches spec exactly |
| `emitTo(playerId, event, data?)` | ✅ | Takes `playerId` — correct (consistent with Phase 1 fix) |
| `emitToDisplay(event, data?)` | ✅ | Matches spec exactly |
| `broadcastPhase(phase, publicState)` | ✅ | Matches spec |
| `broadcastPrivateState(playerId, state)` | ⚠️ | **Signature differs** — see below |
| `broadcastGameOver(result)` | ✅ | Param named `finalState` (spec says `result`) — cosmetic |
| `getPlayerSessionIds(excludePlayerId?)` | ✅ | Was missing in Phase 1, now implemented |
| `sendToPlayer(playerId, message)` | ✅ | Fixed from Phase 1 — now takes `playerId`, resolves internally |

### `broadcastPrivateState` — Deliberate Improvement Over Spec

**Spec says:**
```ts
broadcastPrivateState(playerId: string, state: Record<string, unknown>): void;
```

**Implementation says:**
```ts
broadcastPrivateState(getState: (playerId: string) => Record<string, unknown>): void;
```

The spec's signature would require the game to loop over players and call it once per player. The implementation instead takes a callback and iterates internally — cleaner, less boilerplate, and the factory handles the playerId → sessionId resolution. This is a **good** deviation.

However, the spec should be updated to match reality. Both games use the callback pattern:
```ts
ctx.broadcastPrivateState(playerId => this.getPrivateState(roomId, playerId));
```

**Recommendation:** Update `REFACTOR_PLAN.md` to reflect the callback signature.

### Missing from Phase 1 — Now Fixed

The Phase 1 review flagged three issues that Phase 2 resolved:

1. ✅ `sendToPlayer` now takes `playerId` (was `sessionId`) — fixed in commit `00b4af9`
2. ✅ `broadcastPhase`/`broadcastPrivateState`/`broadcastGameOver` implemented
3. ✅ `getPlayerSessionIds` implemented
4. ✅ BB's `generateId` import from `../../utils/id.js` replaced with direct `import { nanoid } from 'nanoid'`
5. ✅ `getScore(playerId)` still present (extra method, not in spec but used by BB)

### Session ID Leak — Eliminated

Games no longer reference `player.sessionId` anywhere. All `sendToPlayer` calls use `player.id` (playerId). The `resolvePlayerSessionId` helper in the factory handles the mapping internally. ✅

```
$ grep -c "sessionId" server/src/games/bluff-battle/index.ts  → 0
$ grep -c "sessionId" server/src/games/village/index.ts       → 0
```

---

## 2. Shared Package Changes

### ServerMessageType.GAME_EVENT ✅

```ts
GAME_EVENT = 'game_event',
```

Added to the `ServerMessageType` enum with a JSDoc comment. Clean.

### GameEventMessage Interface ✅

```ts
export interface GameEventMessage {
  type: ServerMessageType.GAME_EVENT;
  event: string;
  data: unknown;
}
```

- `event` field for the custom event name ✅
- `data` field typed as `unknown` (platform doesn't interpret) ✅
- Added to the `ServerMessage` union type ✅

### PlatformEvent Constants (Tier 1) ✅

```ts
export const PlatformEvent = {
  PHASE_CHANGED:      'phase:changed',
  SCORE_UPDATED:      'score:updated',
  GAME_OVER:          'game:over',
  PLAYER_ELIMINATED:  'player:eliminated',
  TIMER_EXPIRED:      'timer:expired',
} as const;
```

All 5 Tier 1 events from the spec are present. Uses `as const` for literal types. A `PlatformEventName` type is also exported for type-safe event name references. Clean.

**Note:** These constants are defined but not yet used by any code. The platform handles these events via `ServerMessageType` (e.g., `PHASE_CHANGED`, `SCORE_UPDATE`, `GAME_OVER`) rather than the `PlatformEvent` names. This is fine — they exist as a reference vocabulary for games that might want to listen for platform events via the event bus in the future.

---

## 3. Client Hooks

### `useGameEvent` — Display ✅

**File:** `display/src/hooks/useGameEvent.ts`

```ts
export function useGameEvent(event: string, handler: (data: unknown) => void): void
```

- Uses `useRef` for handler stability (no re-subscription on every render) ✅
- Subscribes via `useConnectionStore.on(ServerMessageType.GAME_EVENT, ...)` ✅
- Filters by `event` name before invoking handler ✅
- Returns unsub from `useEffect` cleanup (no memory leak) ✅
- Dependencies: `[on, event]` — correct ✅

### `useGameEvent` — Phone ✅

**File:** `phone/src/hooks/useGameEvent.ts`

Identical implementation to display. Both hooks:
- Subscribe to the store's `on` with `ServerMessageType.GAME_EVENT`
- Filter by event name
- Use `handlerRef` for stable references
- Clean up on unmount

### Minor Issue: `Extract` Type Fragility

Both hooks cast the message:
```ts
const m = msg as Extract<ServerMessage, { type: 'game_event' }>;
```

This uses the string literal `'game_event'` instead of `ServerMessageType.GAME_EVENT`. It works because the enum resolves to that string, but if the enum value ever changed, the `Extract` would silently produce `never`. Using `{ type: ServerMessageType.GAME_EVENT }` would be safer.

### Type Duplication

The `GameEventHook` type alias is duplicated in 4 component files:
```ts
type GameEventHook = (event: string, handler: (data: unknown) => void) => void;
```

Files: `BBDisplay.tsx`, `VillageDisplay.tsx`, `BBPhone.tsx`, `VillagePhone.tsx`

This should be defined once in `@boredless/shared` and imported. Not a bug, but violates DRY and will compound as games are added.

---

## 4. Integration — GameScreen Wiring

### Display GameScreen ✅

```tsx
import { useGameEvent } from '../hooks/useGameEvent';
// ...
<BBDisplay phase={phase} publicState={gamePublicState} scores={scores} useGameEvent={useGameEvent} />
<VillageDisplay phase={phase} publicState={gamePublicState} useGameEvent={useGameEvent} />
```

The hook function itself is passed as a prop. Components receive it and can call it to subscribe. This is the pattern the spec describes.

### Phone GameScreen ✅

```tsx
import { useGameEvent } from '../hooks/useGameEvent';
// ...
<BBPhone phase={phase} privateState={privateState} useGameEvent={useGameEvent} />
<VillagePhone phase={phase} privateState={privateState} useGameEvent={useGameEvent} />
```

Same pattern. Clean.

### Components Receive But Don't Use Yet

All four game components destructure `useGameEvent` but alias it to `_useGameEvent` with an eslint disable comment:

```tsx
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BBDisplay({ phase, publicState, scores, useGameEvent: _useGameEvent }: BBDisplayProps) {
```

This is expected — the hook is wired up and available, but no game emits custom events yet. When BB adds `ctx.emit('bluff:reveal', ...)` on the server, the display component can immediately listen with `useGameEvent('bluff:reveal', ...)`.

---

## 5. Consistency with Phase 1 Fixes

### `emitTo` Uses `playerId` ✅

The factory's `emitTo` implementation:
```ts
emitTo(playerId, event, data) {
  const sessionId = resolvePlayerSessionId(playerId);
  if (sessionId) {
    sendToSession(sessionId, { type: ServerMessageType.GAME_EVENT, event, data: data ?? null });
  }
}
```

Consistent with the fixed `sendToPlayer` pattern — takes `playerId`, resolves internally. ✅

### Broadcast Helpers Used Consistently

Both games now use `ctx.broadcastPhase()` and `ctx.broadcastGameOver()` instead of manually constructing messages:

**Bluff Battle:**
- `broadcastPhase` used in: setup, startRound, startVoting, startReveal, showScores, broadcastState ✅
- `broadcastPrivateState` used in: setup, startRound, startVoting ✅
- `broadcastGameOver` used in: endGame ✅

**Village:**
- `broadcastPhase` used in: setup, startNight, resolveNightPhase, startDay, startVote, resolveVote, handleNightAction ✅
- `broadcastPrivateState` used in: setup, resolveNightPhase ✅
- `broadcastGameOver` used in: endGame ✅

### Village's Targeted Private State Sends

Village still uses `sendToPlayer` + `PRIVATE_STATE` in two places instead of `broadcastPrivateState`:

1. `startNight` (line 370-375) — sends to **alive players only**
2. `startVote` (line 492-497) — sends to **alive players only**

This is intentional: `broadcastPrivateState` sends to ALL active (non-removed) players, but Village only wants alive players to get updated night targets / vote targets. Dead players don't need the update.

**This is correct behavior**, but it highlights that `broadcastPrivateState` doesn't support filtering. A future enhancement could accept an optional filter, but this is outside Phase 2 scope.

### BB's Targeted Private State Sends

BB uses `sendToPlayer` + `PRIVATE_STATE` for individual player updates after submission (line 216) and after voting (line 260). This is correct — updating just the player who acted, not broadcasting to everyone. No issue.

---

## 6. Event Bus Factory Implementation

### `emit()` ✅

Sends to ALL session IDs (players + display) via `getAllSessionIds()`. Uses `data ?? null` to normalize undefined → null. Clean.

### `emitTo()` ✅

Resolves `playerId` to `sessionId`, sends if found, silently drops if player not found. Consistent with `sendToPlayer` pattern.

### `emitToDisplay()` ✅

Sends only to `room.displaySessionId` if present. Consistent with `sendToDisplay` pattern.

### Message Shape Consistency

All three emit methods produce:
```ts
{ type: ServerMessageType.GAME_EVENT, event, data: data ?? null }
```

This matches the `GameEventMessage` interface. The `data ?? null` normalization ensures the `data` field is always present (not `undefined`), which is clean for JSON serialization.

---

## 7. Test Coverage

### Event Bus Tests: **NONE** ❌

Zero test files reference `GAME_EVENT`, `emit`, `useGameEvent`, or `PlatformEvent`.

This is the biggest gap. At minimum, the following should be tested:

1. **Server-side:** `createGameContext` emit methods send correct `GAME_EVENT` messages to the right recipients
2. **Client-side:** `useGameEvent` hook subscribes, filters by event name, and cleans up on unmount
3. **Integration:** A game emitting an event → client hook receiving it (would need e2e infrastructure)

### Existing Tests: All Passing ✅

```
10 test files, 74 tests, 0 failures
packages/shared/src/constants.test.ts         — 4 tests  ✅
packages/shared/src/validation.test.ts         — 16 tests ✅
server/src/games/bluff-battle/prompts.test.ts  — 6 tests  ✅
server/src/games/bluff-battle/scoring.test.ts  — 5 tests  ✅
server/src/games/village/resolution.test.ts    — 11 tests ✅
server/src/games/village/roles.test.ts         — 11 tests ✅
server/src/engine/room-manager.test.ts         — 9 tests  ✅
server/src/integration.test.ts                 — 6 tests  ✅
server/src/utils/code.test.ts                  — 3 tests  ✅
server/src/utils/id.test.ts                    — 3 tests  ✅
```

### tsc --noEmit: **CLEAN** ✅

Zero errors across all four tsconfigs:
- `packages/shared/tsconfig.json` ✅
- `server/tsconfig.json` ✅
- `display/tsconfig.json` ✅
- `phone/tsconfig.json` ✅

---

## 8. Dead Code / Regressions

### No Regressions

All existing tests pass. The Phase 1 `sendToPlayer(sessionId)` → `sendToPlayer(playerId)` migration is complete with no call sites referencing `player.sessionId` in game modules.

### No Dead Code

The old manual broadcast patterns (constructing `PHASE_CHANGED` / `PRIVATE_STATE` / `GAME_OVER` messages directly in games via `sendToAll`) have been replaced with the convenience helpers except in the targeted Village cases described above. No orphaned utility functions.

### `generateId` Import Fixed

BB now imports `nanoid` directly instead of `../../utils/id.js`:
```ts
import { nanoid } from 'nanoid';
```

Phase 1 recommendation followed. ✅

---

## Issues Summary

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | **Medium** | Zero test coverage for event bus (emit/emitTo/emitToDisplay, useGameEvent hook) | — |
| 2 | **Low** | `broadcastPrivateState` signature deviates from spec (callback vs per-player) — better, but spec needs updating | `game-context.ts:52`, `REFACTOR_PLAN.md` |
| 3 | **Low** | `GameEventHook` type duplicated in 4 component files — should be in `@boredless/shared` | `BBDisplay.tsx`, `VillageDisplay.tsx`, `BBPhone.tsx`, `VillagePhone.tsx` |
| 4 | **Low** | `Extract<ServerMessage, { type: 'game_event' }>` uses string literal instead of enum — fragile | `display/src/hooks/useGameEvent.ts:30`, `phone/src/hooks/useGameEvent.ts:30` |
| 5 | **Info** | `broadcastGameOver` param named `finalState` (spec says `result`) — cosmetic | `game-context.ts:55` |
| 6 | **Info** | No games emit or listen for custom events yet — infrastructure only | All game modules |
| 7 | **Info** | `PlatformEvent` constants defined but unused by any code | `packages/shared/src/enums.ts` |
| 8 | **Info** | Village manually sends PRIVATE_STATE to alive-only players in 2 places (intentional, not a bug) | `village/index.ts:370-375,492-497` |

---

## Phase 1 Issues — Resolution Status

| Phase 1 Issue | Status |
|---|---|
| `sendToPlayer` takes sessionId | ✅ **Fixed** — now takes `playerId` |
| `broadcastPhase`/`broadcastPrivateState`/`broadcastGameOver` missing | ✅ **Fixed** — all implemented |
| `getPlayerSessionIds` missing | ✅ **Fixed** — implemented |
| `getScore(playerId)` not in spec | ⚪ Still present, still not in spec |
| GameModule roomId params (spec drift) | ⚪ Not addressed (Phase 2 scope doesn't include this) |
| BB imports `generateId` from platform utils | ✅ **Fixed** — uses `nanoid` directly |
| `as unknown as Record<string, unknown>` double-casts | ⚪ Still present (deferred to Phase 4) |
| No game loop tests | ⚪ Still no game loop tests |

---

## Recommendations

1. **Add event bus tests** (Medium priority): At minimum, unit test `createGameContext` emit methods with mocked `sendToSession`/`sendToSessions`. Verify correct message shape, correct recipient filtering (emitTo → one player, emitToDisplay → display only, emit → all).

2. **Export `GameEventHook` type from shared** (Low priority): Define once, import everywhere. Prevents drift when the signature changes.

3. **Use enum in Extract** (Low priority): Change `{ type: 'game_event' }` to `{ type: ServerMessageType.GAME_EVENT }` in both hooks.

4. **Update REFACTOR_PLAN.md** (Low priority): Sync `broadcastPrivateState` signature and `broadcastGameOver` param name with reality.

5. **Consider broadcastPrivateState filter option** (Future): Village's alive-only sends suggest a `broadcastPrivateState(getState, { filter?: (playerId) => boolean })` pattern could reduce manual loops.

---

## Conclusion

Phase 2 is complete and well-executed. The event bus infrastructure is in place — `emit`/`emitTo`/`emitToDisplay` on the server, `useGameEvent` on both clients, `GAME_EVENT` message type in shared, and Tier 1 constants defined. The Phase 1 fixes (playerId resolution, broadcast helpers) are fully integrated with no regressions.

The implementation is slightly better than the spec in places (callback-based `broadcastPrivateState`), and the hooks are properly structured with stable refs and cleanup. The main gap is test coverage for the new event bus code. The spec should be updated to match the improved signatures.

Solid foundation for Phase 3 (file restructure + auto-discovery).
