# Phase 4 Review: Client Contracts

**Date:** 2026-03-09
**Reviewer:** Jack Vincent (automated Opus-level audit)
**Verdict:** PASS WITH ISSUES

---

## Summary

Phase 4 delivered its core promise: standardized `DisplayProps` and `PhoneProps` interfaces, the `submitInput` abstraction, store isolation for game components, and a generic game-over screen. The implementation is clean, architecturally sound, and demonstrably correct — tsc passes on all 5 projects, both Vite builds succeed, and all 125 non-e2e tests pass.

Two Phase 3 critical bugs (Village directory naming, Vite alias cross-contamination) were also fixed as prerequisites, which is appreciated.

The remaining issues are a missing `winnerTeamDisplay` on the Village server, some minor type safety shortcuts, and a handful of carryover items from earlier phases. None are blocking for Phase 5.

---

## Spec Compliance

| Phase 4 Requirement | Status | Notes |
|---|---|---|
| Define `DisplayProps` interface | ✅ | `display/src/games/types.ts` — canonical, imports from `@boredless/shared` |
| Define `PhoneProps` interface | ✅ | `phone/src/games/types.ts` — canonical, imports from `@boredless/shared` |
| `DisplayProps.phase` | ✅ | `PhaseState` from shared |
| `DisplayProps.publicState` | ✅ | `Record<string, unknown>` |
| `DisplayProps.players: PlayerInfo[]` (NEW) | ✅ | Added — built from `PublicPlayerState` in GameScreen |
| `DisplayProps.scores: ScoreEntry[]` | ✅ | Present |
| `DisplayProps.timerMs: number \| null` (NEW) | ✅ | Added — sourced from `useRoomStore` |
| `DisplayProps.useGameEvent` | ✅ | `GameEventHook` from shared |
| `PhoneProps.phase` | ✅ | `PhaseState` from shared |
| `PhoneProps.publicState` (NEW) | ✅ | `Record<string, unknown>` — wired via PHASE_CHANGED subscription |
| `PhoneProps.privateState` | ✅ | `Record<string, unknown>` |
| `PhoneProps.myPlayer: PlayerInfo` (NEW) | ✅ | Added — built from `playerId` + room player list |
| `PhoneProps.scores: ScoreEntry[]` (NEW) | ✅ | Added — wired via SCORE_UPDATE subscription |
| `PhoneProps.timerMs: number \| null` (NEW) | ✅ | Added — sourced from `useGameStore` |
| `PhoneProps.submitInput` (NEW) | ✅ | `(inputType: string, data: unknown) => void` — abstracts WS construction |
| `PhoneProps.useGameEvent` | ✅ | `GameEventHook` from shared |
| Refactor display components to canonical type | ✅ | Both BBDisplay and VillageDisplay accept `DisplayProps` |
| Refactor phone components to canonical type | ✅ | Both BBPhone and VillagePhone accept `PhoneProps` |
| Games call `submitInput()` not WS messages | ✅ | BB: `submitInput('text', ...)`, `submitInput('vote', ...)` / Village: `submitInput('night_action', ...)`, `submitInput('vote', ...)` |
| Platform hydrates props from game state | ✅ | Both GameScreens build all props from stores and pass them |
| Store isolation (games don't import stores) | ✅ | Zero hits — verified via grep |
| `PlayerInfo` type in shared | ✅ | `packages/shared/src/types/game.ts` — exported |
| `GameEventHook` centralized in shared | ✅ | Was duplicated in 4 files (Phase 2 issue) — now defined once in shared |
| `winnerTeamDisplay` on `GameOverState` | ✅ | Optional field added to shared type |
| Game-over screen generic | ✅ | No hardcoded "villagers"/"Werewolves" text, no game-specific icons |
| Phone subscribes to PHASE_CHANGED for publicState | ✅ | `setPublicState(m.gamePublicState)` in useEffect |
| Phone subscribes to SCORE_UPDATE for scores | ✅ | `setScores(m.scores)` in useEffect |
| Phone game store has `publicState` and `scores` | ✅ | Both fields present with setters |
| Village server SETS `winnerTeamDisplay` | ❌ | **Missing** — see Issue #1 |

**Score: 27/28 requirements met.**

---

## Drift Report

### CRITICAL — None

### MAJOR

| # | Issue | Severity | Details |
|---|---|---|---|
| 1 | Village server doesn't set `winnerTeamDisplay` | MAJOR | The `GameOverState` type has the optional `winnerTeamDisplay?: string` field (good), and the display's GameScreen correctly falls back to capitalizing `winnerTeam` if it's absent (good). But the Village server's `endGame()` at line 601 doesn't pass `winnerTeamDisplay` in the `broadcastGameOver()` call. The game-over screen will show "Villagers" or "Werewolves" (auto-capitalized from `winnerTeam`), which is *acceptable* but the spec's intent was for games to set a proper display label like "The Village" or "The Werewolves". |

### MINOR

| # | Issue | Severity | Details |
|---|---|---|---|
| 2 | `as never` cast in phone GameScreen | MINOR | Line 61: `phaseType: PhaseType.GAME_OVER as never`. `PhaseType.GAME_OVER` exists in the enum — this cast is unnecessary and obscures intent. Should be `phaseType: PhaseType.GAME_OVER`. |
| 3 | `inputType as InputType` cast in submitInput | MINOR | Line 71: `inputType: inputType as InputType`. The `submitInput` function takes `inputType: string` (correct for game-facing API) but casts to `InputType` enum when constructing the WS message. This is inherently unsafe — if a game passes an invalid string, it won't be caught. Consider validating against the enum or leaving as string (the server validates anyway). |
| 4 | `data as Record<string, unknown>` cast in submitInput | MINOR | Line 72: `payload: data as Record<string, unknown>`. Same pattern — game passes `unknown`, platform casts. The server should validate, but a runtime check here would be safer. |
| 5 | VillageDisplay ignores `players`, `scores`, `timerMs` props | MINOR | VillageDisplay destructures only `phase`, `publicState`, and `useGameEvent` from `DisplayProps`. It renders its own player grid from `publicState.players` instead of using the platform-provided `players: PlayerInfo[]`. Not a bug — Village's public state has richer player data (alive/dead status, elimination highlighting) — but it creates an inconsistency. |
| 6 | BBPhone ignores `publicState`, `myPlayer`, `scores` props | MINOR | BBPhone destructures only `phase`, `privateState`, `timerMs`, `submitInput`, and `useGameEvent`. The newly-added `publicState`, `myPlayer`, and `scores` props are not used. Infrastructure-first — correct but not yet battle-tested. |
| 7 | VillagePhone ignores `publicState`, `myPlayer`, `scores` props | MINOR | Same as #6. Village phone component only uses `phase`, `privateState`, `timerMs`, `submitInput`. |
| 8 | Server-side VillageRole import split | MINOR | Village server imports `VillageRole` from `@boredless/shared` (line 12), while Village phone imports from `../types.js`. Two independent enum declarations with the same values. Phase 3 carryover — shared copy should be removed in Phase 5. |
| 9 | `BB_MAX_ANSWER_LENGTH` imported from shared in game component | MINOR | `BBPhone.tsx` imports `BB_MAX_ANSWER_LENGTH` from `@boredless/shared`. Game-specific constant in platform's shared package. Should move to `games/bluff-battle/` in Phase 5. |

---

## Build Verification

### TypeScript Compilation

| Project | `tsc --noEmit` | Result |
|---|---|---|
| `packages/shared` | ✅ | Clean, zero errors |
| `server` | ✅ | Clean, zero errors |
| `display` | ✅ | Clean, zero errors |
| `phone` | ✅ | Clean, zero errors |
| `games` | ✅ | Clean, zero errors |

### Vite Builds

| Project | Build | Result |
|---|---|---|
| `display` | ✅ | 270 kB JS, 23 kB CSS, 620ms |
| `phone` | ✅ | 275 kB JS, 23 kB CSS, 651ms |

### Tests

| Suite | Result |
|---|---|
| Non-e2e tests | ✅ **125/125 passing** (13 test files, 411ms) |
| E2e tests | ⏭️ Skipped (timer-dependent, not Phase 4's responsibility) |

**New test files added in Phase 4:**
- `games/manifest-schema.test.ts` — 16 tests for YAML manifest validation ✅
- `games/registry.test.ts` — 14 tests for client registry lookup logic ✅
- `server/src/games/create-game-context.test.ts` — GameContext factory tests ✅

These address Phase 3 review's call for tests on manifest validation and client registry lookup.

---

## Store Isolation Verification

```bash
$ grep -rn "useConnectionStore\|useGameStore\|useRoomStore" games/
# (no output — zero matches)

$ grep -rn "@phone/store\|@display/store" games/
# (no output — zero matches)

$ grep -rn "import.*from.*store" games/
# (no output — zero matches)

$ grep -rn "ClientMessageType\|ServerMessageType" games/*/phone/*.tsx games/*/display/*.tsx
# (no output — zero matches)
```

**PASS.** Game components have zero imports of platform stores, zero imports of message type enums. Store isolation is complete.

Game *server* modules do import `InputType` and `ServerMessageType` from `@boredless/shared` (for `handleInput` dispatch and `PRIVATE_STATE` sends). This is expected — server game modules need to know input types and message types to function. The isolation requirement applies to *client* game components.

---

## Phase 3 Issues — Resolution Status

| Phase 3 Issue | Status | Notes |
|---|---|---|
| Village directory naming mismatch (CRITICAL) | ✅ **Fixed** | Renamed to `games/village-of-shadows/` |
| Vite alias cross-contamination (CRITICAL) | ✅ **Fixed** | Registries now glob `games/*/display/*.tsx` and `games/*/phone/*.tsx` separately instead of barrel `index.ts` |
| Game types not removed from shared | ⚪ Not addressed | Phase 5 scope |
| YAML manifests decorative | ⚪ Not addressed | Phase 5 scope |
| Old server game modules (duplication) | ✅ **Fixed** | `server/src/games/bluff-battle/` and `server/src/games/village/` removed. Fallback eliminated — auto-discovery fails fast. |
| Zero tests for Phase 3 new code | ✅ **Fixed** | Manifest schema tests (16) and registry tests (14) added |
| Game-specific constants in shared | ⚪ Not addressed | Phase 5 scope |
| `GameEventHook` type duplicated | ✅ **Fixed** | Centralized in `packages/shared/src/types/game.ts` |

**4 of 8 Phase 3 issues resolved.** Remaining 4 are explicitly Phase 5 scope.

---

## Architecture Assessment

### What's Excellent

1. **Clean contract enforcement.** Both `DisplayProps` and `PhoneProps` are defined exactly once in canonical type files, imported from `@boredless/shared` types. Game components explicitly accept the canonical type via `import type { DisplayProps } from '@display/games/types'`. The TypeScript compiler enforces conformance.

2. **submitInput abstraction.** Phone game components call `submitInput('text', { answer })` and `submitInput('vote', { answerId })` — zero knowledge of `ClientMessageType`, `InputType`, or WebSocket message structure. The platform's GameScreen constructs the full WS message internally. Clean separation.

3. **Generic game-over screen.** Zero game-specific references. Uses `winnerTeamDisplay` fallback → capitalized `winnerTeam`. Trophy icon is generic. Scoreboard component is reusable. This will work for any future game without modification.

4. **Store isolation is complete.** Game components are pure functions of their props. They don't reach into platform stores. They receive everything they need as props. This is exactly what the refactor set out to achieve.

5. **Glob-based discovery fixed correctly.** The Vite cross-alias issue from Phase 3 was solved elegantly — separate directory globs for display and phone instead of barrel re-exports. No need for cross-aliases.

### What's Adequate

1. **VillageDisplay manages its own player rendering.** It ignores the platform-provided `players: PlayerInfo[]` and renders from `publicState.players`. This works because Village's public state has richer player data (elimination highlighting, role reveal). But it means the `PlayerInfo[]` contract is partially aspirational — games that need more than `{playerId, playerName, playerColor, isAlive}` will bypass it.

2. **New props are not yet consumed by existing games.** `publicState`, `myPlayer`, and `scores` are wired into PhoneProps but neither BBPhone nor VillagePhone uses them. This is infrastructure-first development — correct, but means the props haven't been battle-tested yet.

### What Needs Attention

1. **`winnerTeamDisplay` not set by Village server.** The type is defined, the display code handles it, but the server doesn't provide it. When Village ends, the game-over screen will show "Villagers" or "Werewolves" (auto-capitalized from `winnerTeam`), which is *acceptable* but the spec's intent was for games to set a proper display label like "The Village" or "The Werewolves". Easy fix — one line in the server's `endGame()`.

---

## Recommendations

### Before Phase 5

1. **Set `winnerTeamDisplay` in Village server** (Easy fix):
   ```ts
   // games/village-of-shadows/server/index.ts, endGame()
   state.ctx.broadcastGameOver({
     winnerId: null,
     winnerName: null,
     winnerTeam: winTeam,
     winnerTeamDisplay: winTeam === 'villagers' ? 'The Village' : 'The Werewolves',
     finalScores: [],
     gameId: GameId.VILLAGE_OF_SHADOWS,
   });
   ```

2. **Remove `as never` cast** in phone GameScreen line 61 — unnecessary since `PhaseType.GAME_OVER` is a valid enum member.

### During Phase 5

3. **Remove game-specific types from shared** — `packages/shared/src/types/bluff-battle.ts`, `village.ts`, and the `VillageRole` enum from `packages/shared/src/enums.ts`. Village server should import `VillageRole` from its local `types.ts`.

4. **Move `BB_MAX_ANSWER_LENGTH` to game-local constants** — currently in `packages/shared/src/constants.ts`, imported by `BBPhone.tsx`.

5. **Move game-specific `PhaseType` values** — `BB_SUBMIT`, `BB_VOTING`, `VOS_NIGHT`, etc. should live in game packages, not the shared `PhaseType` enum. This is the hardest Phase 5 task.

6. **Move game-specific `InputType` values** — `NIGHT_ACTION` is Village-specific.

7. **Make manifest data functional** — either games read config from manifests (phase durations, player limits) or manifests are removed. Two sources of truth is a maintenance hazard.

---

## Conclusion

Phase 4 is a solid delivery. The core contract — standardized props interfaces, store isolation, submitInput abstraction, and generic game-over screen — is complete and well-implemented. Both games accept the canonical types. Client game components have zero platform store imports. The `submitInput` pattern cleanly separates game logic from WebSocket concerns.

The single meaningful gap is Village's `endGame()` not setting `winnerTeamDisplay`, which is a one-line fix. Everything else is minor type safety polish or Phase 5 scope.

The Phase 3 critical bugs (directory naming, Vite aliases) were properly resolved, old duplicated server modules were cleaned up, and test coverage was added for manifest validation and registry lookup.

**Phase 5 can proceed.** Fix `winnerTeamDisplay` first (30 seconds of work), then tackle the game-specific cleanup in shared.
