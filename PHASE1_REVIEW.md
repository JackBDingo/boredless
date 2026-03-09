# Phase 1 Review: GameContext Injection

**Date:** 2026-03-09
**Reviewer:** Jack Vincent (automated audit)
**Verdict:** Solid foundation with a handful of issues worth addressing before Phase 2.

---

## Summary

Phase 1 is ~90% correct. The core architecture — GameContext interface, factory, injection at game start — is clean and well-structured. Both games use ctx consistently and no engine internals leak into game modules. Types compile clean, all 54 tests pass.

There are deliberate spec deviations, one leaky import, and some test gaps worth flagging.

---

## 1. Contract Drift

### Spec vs Implementation — GameContext

| Spec method | Implemented? | Notes |
|---|---|---|
| `roomId` | ✅ | |
| `startTimer()` | ✅ | |
| `stopTimer()` | ✅ | |
| `getTimerRemaining()` | ✅ | |
| `sendToAll()` | ✅ | Typed as `ServerMessage` (stricter than spec's `object`) — good |
| `sendToPlayer()` | ⚠️ | **Parameter named `sessionId` not `playerId`** — see below |
| `sendToDisplay()` | ✅ | |
| `emit()` | ❌ | Missing — **intentionally deferred to Phase 2** per plan |
| `emitTo()` | ❌ | Missing — Phase 2 |
| `emitToDisplay()` | ❌ | Missing — Phase 2 |
| `initScores()` | ✅ | |
| `addPoints()` | ✅ | |
| `getScores()` | ✅ | |
| `broadcastScores()` | ✅ | |
| `clearScores()` | ✅ | |
| `getRoom()` | ✅ | Returns `Room \| undefined` (spec says `RoomData`) — acceptable, same type |
| `setRoomStatus()` | ✅ | |
| `getAllSessionIds()` | ✅ | |
| `getPlayerSessionIds()` | ❌ | **Missing from implementation** |
| `broadcastPhase()` | ❌ | **Missing from implementation** |
| `broadcastPrivateState()` | ❌ | **Missing from implementation** |
| `broadcastGameOver()` | ❌ | **Missing from implementation** |
| `log.info/error/warn` | ✅ | |

**Extra method not in spec:**
- `getScore(playerId)` — added in implementation, not in spec. Useful (used by BB's reveal logic at `bluff-battle/index.ts:336`). **Should be added to the spec.**

### Missing high-level helpers

The spec defines `broadcastPhase()`, `broadcastPrivateState()`, and `broadcastGameOver()` as part of GameContext. These are **not implemented**. Instead, both games manually construct and send `PHASE_CHANGED`, `PRIVATE_STATE`, and `GAME_OVER` messages via `sendToAll`/`sendToPlayer`.

**Impact:** This works, but it means both games duplicate the broadcast patterns. Every game will have to re-implement the same `sendToAll({ type: PHASE_CHANGED, phase: ..., gamePublicState: ... })` boilerplate. The spec's approach of providing these as convenience methods on ctx would reduce duplication and ensure consistent message shapes.

**Recommendation:** Either implement `broadcastPhase`/`broadcastPrivateState`/`broadcastGameOver` as specified, or formally remove them from the spec. The current state is a drift that will compound as more games are added.

### `sendToPlayer` naming

- **Spec says:** `sendToPlayer(playerId: string, message: object)`
- **Implementation says:** `sendToPlayer(sessionId: string, message: ServerMessage)`

The parameter is named `sessionId` in the interface (`game-context.ts:21`) and the factory (`create-game-context.ts:43`), and games pass `player.sessionId` at every call site. This is technically correct (it works), but it violates the abstraction boundary: **game modules shouldn't need to know about session IDs at all.** The whole point of GameContext is to hide engine concepts like sessions from games.

Games should call `ctx.sendToPlayer(playerId, msg)` and the factory should resolve playerId → sessionId internally.

**Affected files:**
- `game-context.ts:21` — parameter name
- `create-game-context.ts:43` — implementation
- `bluff-battle/index.ts:88,223,270,310,371` — all call sites
- `village/index.ts:111,389,457,528` — all call sites

### Spec vs Implementation — GameModule

| Spec method | Implemented? | Notes |
|---|---|---|
| `setup(players, ctx)` | ✅ | |
| `handleInput(playerId, inputType, data)` | ⚠️ | Signature includes `roomId` as first param — spec doesn't |
| `handlePlayerDisconnect?()` | ❌ | Not in interface |
| `handlePlayerReconnect?()` | ❌ | Not in interface |
| `getState?()` | ❌ | Not in interface — replaced by `getPhaseState`/`getPublicState`/`getPrivateState` |
| `teardown()` | ⚠️ | Takes `roomId` param — spec says no params |

The GameModule interface has **extra methods** not in the spec: `getPhaseState(roomId)`, `getPublicState(roomId)`, `getPrivateState(roomId, playerId)`, and `definition`.

The `roomId` parameter on `handleInput`, `getPhaseState`, `getPublicState`, `getPrivateState`, and `teardown` is a design smell. Since `setup()` already receives `ctx` (which includes `roomId`), the game module knows its room. The extra `roomId` params exist because both modules use a `Map<string, GameState>` pattern supporting multiple concurrent rooms per singleton module. This is pragmatic but deviates from the spec's model where each game instance maps 1:1 with a room.

**Recommendation:** This is a deliberate architectural choice (singleton modules vs per-room instances). Document it in the spec. The `roomId` threading is consistent across both games, so it's not a bug — it's a spec update needed.

---

## 2. Leaky Abstractions

### Engine imports in game modules

Both games import **only** from `@boredless/shared` and their own sibling files. No imports from `engine/`, `ws/`, or platform internals. ✅

**One exception:**
- `bluff-battle/index.ts:26` imports `generateId` from `../../utils/id.js`

This is a utility function (nanoid wrapper), not an engine internal. It's borderline — `generateId` is a generic utility, not game-platform coupling. But if the goal is "games import nothing from platform code," this should either:
1. Be moved to `@boredless/shared`, or
2. Be inlined in the game module (it's just `nanoid()`)

Village of Shadows doesn't need `generateId` (it doesn't generate answer IDs). So this is BB-specific.

### Session ID exposure

As noted above, games directly access `player.sessionId` to route messages. This leaks the session abstraction into game logic. Games shouldn't need to think about sessions — they should reference players by `playerId` and let the platform resolve routing.

---

## 3. Consistency

Both games follow the exact same patterns:

| Pattern | Bluff Battle | Village |
|---|---|---|
| Store ctx in game state | ✅ `state.ctx` | ✅ `state.ctx` |
| Init scores in setup | ✅ | ❌ (no scoring) |
| Set room status in setup | ✅ | ✅ |
| Broadcast GAME_STARTED in setup | ✅ | ✅ |
| Send private state per player | ✅ | ✅ |
| Start timer via ctx | ✅ | ✅ |
| Stop timer in teardown | ✅ | ✅ |
| Clear scores in teardown | ✅ | ❌ (Village never calls `initScores`) |
| Guard against double phase transitions | ✅ | ✅ |
| `as unknown as Record<string, unknown>` cast | ✅ | ✅ |

**One minor inconsistency:** BB's `teardown` calls `ctx.clearScores()` (`bluff-battle/index.ts:195`). Village's `teardown` does not (`village/index.ts:219`). This is correct behavior (Village doesn't use scores), but worth noting.

Both games use the `as unknown as Record<string, unknown>` double-cast to convert typed state objects to `Record<string, unknown>`. This is a code smell that appears at:
- `bluff-battle/index.ts:150,170`
- `village/index.ts:179,239`

**Recommendation:** Consider making `getPublicState` and `getPrivateState` generic on the GameModule interface, or accept the typed state objects directly. The double-cast works but isn't elegant.

---

## 4. Type Safety

### `tsc --noEmit` result: **CLEAN** ✅

Zero errors, zero warnings.

### `as any` usage in core files: **NONE** ✅

No `any` casts in `game-context.ts`, `create-game-context.ts`, `game-module.ts`, `bluff-battle/index.ts`, or `village/index.ts`.

### `as any` in tests: **4 occurrences** (acceptable)

- `integration.test.ts:50,59,105,114` — casting return values of `getPublicState`/`getPrivateState` to `any` for property access in assertions. Standard test pattern.

### Double-cast concern

The `as unknown as Record<string, unknown>` pattern (4 occurrences) is the only type gymnastics in production code. It's a consequence of the `Record<string, unknown>` return type on the GameModule interface being too loose for the actual typed state objects.

---

## 5. Test Coverage

### What's tested:
- ✅ BB setup initializes game state (phase, round, totalRounds)
- ✅ BB public state shape (gameId, totalRounds, totalPlayers)
- ✅ BB private state shape per player (gameId, hasSubmitted, hasVoted)
- ✅ BB teardown resets to default state
- ✅ Village setup assigns roles to all players
- ✅ Village public state shows all players alive

### What's NOT tested:
- ❌ **handleInput** — no tests for BB submission or voting flow through GameContext
- ❌ **Phase transitions** — no test advances BB past INSTRUCTIONS phase
- ❌ **Timer callbacks** — no test verifies timer-driven phase transitions
- ❌ **Score flow** — no test for addPoints/getScores/broadcastScores through ctx
- ❌ **Village night/day cycle** — no test for night actions or day votes
- ❌ **sendToAll/sendToPlayer** — no verification messages are actually sent (no mock/spy on ctx)
- ❌ **Reconnect flow** — handler.ts `handleRejoin` calls `getPhaseState`/`getPublicState`/`getPrivateState` but this isn't tested
- ❌ **Teardown during active game** — no test for teardown mid-round

The integration tests verify setup/state-reading but don't exercise the actual game loop. They're smoke tests, not behavior tests.

**Recommendation:** Add at minimum:
1. A test that submits answers, advances to voting, votes, and verifies reveal/scores
2. A test that verifies ctx.sendToAll is called with expected messages (mock the ctx)
3. A test for handleInput rejection cases (wrong phase, duplicate submission)

---

## 6. Dead Code

### Old direct engine imports: **NONE** ✅

Grepped for any direct imports of `room-manager`, `timer-engine`, `score-engine`, or `send` in game modules — clean.

### Unused code in create-game-context.ts: **NONE** ✅

Every method in the factory is used by at least one game.

### Game registry: **Clean** ✅

`registry.ts` is a simple Map wrapper, no game-specific code.

---

## 7. Handler Integration (`ws/handler.ts`)

- `createGameContext` is imported and called correctly at `handler.ts:176`
- Context is created fresh per game start (not cached) — correct
- `handleRejoin` at line `134-141` directly calls `gameModule.getPhaseState/getPublicState/getPrivateState` — this works but means the handler still knows about game state structure
- `handleReturnToLobby` at line `232` and `handleCloseRoom` at line `250` correctly call `gameModule.teardown(roomId)`

No issues here. The handler is a clean integration point.

---

## Issues Summary

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | **Medium** | `sendToPlayer` takes sessionId, leaking session concept into games | `game-context.ts:21`, all game call sites |
| 2 | **Medium** | `broadcastPhase`/`broadcastPrivateState`/`broadcastGameOver` missing from ctx — spec drift | `game-context.ts` |
| 3 | **Low** | `getPlayerSessionIds` missing from ctx (in spec) | `game-context.ts` |
| 4 | **Low** | `getScore(playerId)` added but not in spec | `game-context.ts:30` |
| 5 | **Low** | GameModule interface deviates from spec (extra methods, roomId params) | `game-module.ts` |
| 6 | **Low** | BB imports `generateId` from platform utils | `bluff-battle/index.ts:26` |
| 7 | **Low** | `as unknown as Record<string, unknown>` double-casts (4 occurrences) | BB & Village state methods |
| 8 | **Info** | `handlePlayerDisconnect`/`handlePlayerReconnect` not in GameModule interface | `game-module.ts` |
| 9 | **Info** | Test coverage is setup-only, no game loop tests | `integration.test.ts` |

---

## Recommendations

1. **Before Phase 2:** Fix `sendToPlayer` to accept `playerId` and resolve to sessionId internally in the factory. This is the biggest abstraction leak.
2. **Before Phase 2:** Either implement `broadcastPhase`/`broadcastPrivateState`/`broadcastGameOver` or update the spec to remove them. Don't leave the drift.
3. **During Phase 2:** Move `generateId` to `@boredless/shared` or inline it.
4. **Update the spec:** Document the singleton-module-with-roomId-params pattern as a deliberate choice.
5. **Add game loop tests:** At least one end-to-end round of BB (submit → vote → reveal → scores) with a mocked or real ctx.

---

## Conclusion

The architecture is sound. GameContext injection works, abstractions are mostly clean, types compile, tests pass. The main gap is `sendToPlayer(sessionId)` leaking session awareness into games — fix that and update the spec to match reality, and Phase 1 is solid enough to build Phase 2 on.
