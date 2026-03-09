# Phase 3 Review: File Restructure + YAML Manifests + Auto-Discovery

**Date:** 2026-03-09
**Reviewer:** Jack Vincent (automated audit)
**Verdict:** Partially delivered. The structural scaffolding is in place — `games/` directory, manifests, auto-discovery, switch elimination — but several critical contract items were skipped, there's a runtime-breaking naming mismatch, and the YAML manifests are decorative rather than functional. The foundation is directionally correct but needs non-trivial follow-up.

**tsc --noEmit:** CLEAN across all 5 tsconfigs (shared, server, display, phone, games) ✅
**Tests:** 94/94 non-e2e passing ✅

---

## Summary

Phase 3 set out to restructure game files into self-contained packages, create YAML manifests as the source of truth for game metadata, build auto-discovery so the platform needs zero game-specific imports, and clean game-specific types out of the shared package.

What actually shipped:
- ✅ `games/` directory with proper structure (server/, display/, phone/, types.ts, index.ts, manifest.yaml)
- ✅ YAML manifests exist and are validated by Zod at startup
- ✅ Server auto-discovery works and loads game modules from `games/`
- ✅ Client registries use `import.meta.glob` — no game-specific imports in GameScreen
- ✅ tsc passes clean on all 5 projects
- ✅ 94/94 tests pass
- ⚠️ Manifests are ignored at runtime — games still pull metadata from `GAME_CATALOG`
- ⚠️ Game-specific types NOT removed from shared (contract violation)
- ⚠️ Game-specific enums/constants NOT extracted from shared
- ❌ Directory naming mismatch will break Village client rendering at runtime
- ❌ Vite alias gap means cross-package game imports will fail at build time
- ❌ Zero tests for the core new code (manifest validation, auto-discovery)

---

## 1. Claim Verification

### Claim 1: `games/` directory structure ✅

**Verified.** Both games have the expected structure:

```
games/
├── bluff-battle/
│   ├── manifest.yaml
│   ├── types.ts
│   ├── index.ts
│   ├── server/index.ts, prompts.ts, scoring.ts
│   ├── display/BBDisplay.tsx
│   └── phone/BBPhone.tsx
├── village/
│   ├── manifest.yaml
│   ├── types.ts
│   ├── index.ts
│   ├── server/index.ts, roles.ts, resolution.ts
│   ├── display/VillageDisplay.tsx
│   └── phone/VillagePhone.tsx, roleInfo.ts
└── tsconfig.json
```

Clean, self-contained packages. Each `index.ts` re-exports `createModule`, `DisplayComponent`, and `PhoneComponent`. Good.

### Claim 2: YAML manifests ⚠️ (Exists but not functional)

Manifests exist and contain game metadata (id, name, description, minPlayers, maxPlayers, phases with durations, scoring). A Zod schema at `server/src/games/manifest-schema.ts` validates them at startup.

**However:** The manifests are not the source of truth. Games still pull their `definition` from `GAME_CATALOG`:

```ts
// games/bluff-battle/server/index.ts
readonly definition: GameDefinition = GAME_CATALOG.find(g => g.id === GameId.BLUFF_BATTLE)!;
```

Phase durations come from shared constants (`BB_SUBMIT_TIME_SECONDS`, `VOS_NIGHT_TIME_SECONDS`, etc.), not from the YAML `phases.submission.duration` values. The manifest is validated but its data is never consumed. It's documentation, not configuration.

**Spec says:** "extract from GAME_CATALOG + shared constants into YAML"
**Reality:** Duplicated into YAML but originals remain authoritative.

### Claim 3: Auto-discovery ✅ (Server works, clients have bugs)

**Server:** `auto-discover.ts` scans `games/`, reads+validates YAML, dynamically imports each game's `createModule()`. If auto-discovery fails, `app.ts` falls back to manual registration of the old `server/src/games/` modules. This is robust.

**Display/Phone:** `import.meta.glob` discovers game components from `../../games/*/index.ts`. The registries use a dual-registration pattern (directory name + underscore variant) and getter fallback (underscore → hyphen conversion). Clever but has a fatal flaw — see Issue #1.

### Claim 4: Switch statements eliminated ✅

Confirmed. Zero game-specific imports in `display/src/screens/GameScreen.tsx` or `phone/src/screens/GameScreen.tsx`. Both use registry lookups:

```tsx
const DisplayComponent = gameId ? getDisplayComponent(gameId) : undefined;
const PhoneComponent = gameId ? getPhoneComponent(gameId) : undefined;
```

No `switch`, no `case`, no `if (gameId === 'bluff_battle')`. Clean.

### Claim 5: tsconfig paths updated ✅

All projects have proper path aliases:
- `@display/*`, `@phone/*`, `@game-platform/*`, `@boredless/shared` in display, phone, and games tsconfigs
- `games/tsconfig.json` includes paths for all three app contexts

**However:** Vite configs are incomplete — see Issue #2.

### Claim 6: Tests 94/94 pass, tsc clean ✅

Independently verified:
- `tsc --noEmit` clean on all 5 projects (shared, server, display, phone, games)
- 94/94 non-e2e tests pass (11 test files, 386ms)

---

## 2. Issues Table

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | **Critical** | Village directory name mismatch breaks client lookup | `games/village/` vs `village_of_shadows` GameId |
| 2 | **Critical** | Vite alias gap — cross-package imports will fail at build | `display/vite.config.ts`, `phone/vite.config.ts` |
| 3 | **High** | Game-specific types not removed from shared (contract violation) | `packages/shared/src/types/bluff-battle.ts`, `village.ts` |
| 4 | **High** | YAML manifests are decorative — not consumed at runtime | `games/*/manifest.yaml`, `server/src/games/auto-discover.ts` |
| 5 | **High** | Zero tests for auto-discovery and manifest validation | — |
| 6 | **Medium** | Game-specific constants/enums remain in shared | `packages/shared/src/constants.ts`, `enums.ts` |
| 7 | **Medium** | Old server game modules not removed (full duplication) | `server/src/games/bluff-battle/`, `server/src/games/village/` |
| 8 | **Medium** | Props interface mismatch — VillageDisplay missing `scores` | `games/village/display/VillageDisplay.tsx` |
| 9 | **Low** | Game-specific content in platform code | `phone/src/lib/gameIcons.tsx`, `display/src/screens/GameScreen.tsx` |
| 10 | **Low** | Manifest ID uses hyphens, GameId enum uses underscores — confusing | `manifest.yaml` vs `enums.ts` |
| 11 | **Low** | `@game-types` Vite alias configured but unused | `display/vite.config.ts`, `phone/vite.config.ts` |
| 12 | **Info** | `as unknown as Record<string, unknown>` double-casts still present | 4 locations in game modules |

---

## 3. Detailed Issue Analysis

### Issue #1: Village Directory Name Mismatch (Critical)

The Village game directory is `games/village/` but its manifest ID is `village-of-shadows` and the `GameId` enum value is `village_of_shadows`.

The client registries register by **directory name**:
```
Map: "village" → VillageDisplay
Map: "village" → VillageDisplay  (underscore variant of "village" is still "village")
```

But `room.selectedGameId` is `"village_of_shadows"`. The getter logic:
1. Look up `"village_of_shadows"` → not found
2. Try `"village-of-shadows"` (underscore→hyphen) → not found
3. Return `undefined`

**Result:** Village of Shadows components will never load on the display or phone. The game will show a blank/fallback screen. This is a runtime bug that tsc can't catch because the glob types use type assertions.

**Fix:** Either rename the directory to `village-of-shadows` or add manifest-based ID registration in the client registries.

### Issue #2: Vite Alias Gap (Critical)

Display's `vite.config.ts` only has `@display` alias. Phone's only has `@phone`. But both glob-import `games/*/index.ts` which re-exports components from both contexts:

```ts
// games/bluff-battle/index.ts
export { BBDisplay as DisplayComponent } from './display/BBDisplay.js';
export { BBPhone as PhoneComponent } from './phone/BBPhone.js';
```

With `eager: true`, Vite resolves ALL exports. When display builds:
1. Imports `games/bluff-battle/index.ts`
2. Resolves `BBPhone` from `./phone/BBPhone.js`
3. `BBPhone` imports `@phone/store/connection`
4. `@phone` is not aliased in display's Vite config → **build failure**

The same happens in reverse: phone build will fail resolving `@display/components/Timer`.

This passes `tsc --noEmit` because `games/tsconfig.json` has ALL path aliases. But TypeScript checking ≠ Vite bundling. The actual build will break.

**Fix:** Either:
- Add cross-aliases to both Vite configs (`@phone` in display, `@display` in phone)
- Split the glob pattern to only import the relevant component (e.g., `games/*/display/index.ts` vs `games/*/phone/index.ts`)
- Use lazy imports instead of `eager: true`

### Issue #3: Game Types Not Removed from Shared (High)

The spec explicitly says: "Remove game-specific types from shared package."

Still present and exported:
- `packages/shared/src/types/bluff-battle.ts` — `BBPublicState`, `BBPrivateState`, `BBPrompt`, `BBAnswerOption`, etc.
- `packages/shared/src/types/village.ts` — `VillagePublicState`, `VillagePrivateState`, `VillageRole` (imported from enums), etc.
- Both exported from `packages/shared/src/index.ts`

These types are now duplicated in `games/*/types.ts`. The Village version even has its own copy of the `VillageRole` enum (independent from `packages/shared/src/enums.ts`). This creates a drift risk — two copies of the same types with no enforcement that they stay in sync.

Currently nothing in `display/src/` or `phone/src/` imports the shared versions (they import from `games/*/types.ts` via relative paths), so the shared copies are dead code. But they're still exported and could confuse future developers.

### Issue #4: Manifests Are Decorative (High)

The auto-discovery reads and validates manifests, but the manifest data is never used:
- `manifest.id` is logged but not used for registration (the server uses `mod.definition.id` from `GAME_CATALOG`)
- Phase durations in YAML are ignored; games use shared constants
- `manifest.minPlayers`/`manifest.maxPlayers` are ignored; `GameDefinition` from `GAME_CATALOG` is used

The manifest validation succeeds but is effectively a no-op. If a manifest has wrong values, nothing breaks. If a manifest is removed but the game code remains, auto-discovery would fail but the fallback loads the old server modules.

This defeats the purpose of "extract from GAME_CATALOG + shared constants into YAML." The extraction happened but the originals weren't deprecated.

### Issue #5: Zero Test Coverage for New Code (High)

No tests exist for:
- `manifest-schema.ts` — Zod schema validation (malformed YAML, missing fields, invalid types)
- `auto-discover.ts` — directory scanning, module loading, error handling
- Client registries — component registration, lookup with name normalization
- Fallback behavior — what happens when auto-discovery fails

This is the core new functionality of Phase 3. The 94 tests are all pre-existing. The gap is especially concerning given the naming mismatch bug (#1) which would have been caught by even basic tests.

### Issue #6: Game-Specific Constants/Enums in Shared (Medium)

The spec says to extract constants into YAML. Still in shared:
- `BB_ROUNDS_DEFAULT`, `BB_SUBMIT_TIME_SECONDS`, `BB_VOTE_TIME_SECONDS`, etc.
- `VOS_ROLE_REVEAL_TIME_SECONDS`, `VOS_NIGHT_TIME_SECONDS`, etc.
- `PhaseType.BB_SUBMIT`, `PhaseType.BB_VOTING`, `PhaseType.VOS_NIGHT`, etc.
- `VillageRole` enum
- `InputType.NIGHT_ACTION` (game-specific)
- `GameId.BLUFF_BATTLE`, `GameId.VILLAGE_OF_SHADOWS`

Moving ALL of these is arguably Phase 5 scope ("platform should have ZERO game-specific references"), but the timing constants at minimum were supposed to move into manifests per Phase 3 spec.

### Issue #7: Full Module Duplication (Medium)

The old game modules remain at `server/src/games/bluff-battle/` and `server/src/games/village/` (prompts, scoring, roles, resolution — all duplicated). These serve as the manual fallback in `app.ts`:

```ts
if (!autoDiscovered) {
    gameRegistry.register(bluffBattleModule);
    gameRegistry.register(villageModule);
}
```

This means the game logic exists in TWO places. Any bug fix must be applied to both. The old copies don't have `createModule()` factories, so they export singleton instances (`bluffBattleModule`, `villageModule`). These singletons could cause state leakage between rooms if the fallback path is ever used in production.

### Issue #8: Props Interface Mismatch (Medium)

The registry defines:
```ts
export interface DisplayProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
  scores: ScoreEntry[];
  useGameEvent: GameEventHook;
}
```

But `VillageDisplay` uses its own interface without `scores`:
```ts
interface VillageDisplayProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
  useGameEvent: GameEventHook;
}
```

This compiles because `import.meta.glob` type assertions are loose. At runtime Village gets a `scores` prop it ignores. Not a crash, but it signals that `DisplayProps` isn't actually enforced — games define whatever props they want.

### Issue #9: Game-Specific Platform Code (Low)

Two files in platform code still contain game-specific references:

1. `phone/src/lib/gameIcons.tsx` — hardcoded icons for `BLUFF_BATTLE` and `VILLAGE_OF_SHADOWS` (has default fallback)
2. `display/src/screens/GameScreen.tsx` — game-over section has `winnerTeam === 'villagers'` / `'Werewolves win!'` text

These were supposed to be eliminated per the Phase 5 spec ("platform should have ZERO game-specific references"), but Phase 3 should have at least flagged them.

---

## 4. Architecture Quality

### What's Good

1. **Self-contained game packages** — The `games/` structure is clean and would scale well to additional games. Each game owns its types, server logic, and client components.

2. **GameModule contract** — The `GameModule` interface is well-designed. `createModule()` factory pattern is correct (avoids singleton state leakage). The `GameContext` API properly isolates games from platform internals.

3. **Auto-discovery pattern** — Server-side discovery (scan dir → validate YAML → dynamic import) is the right approach. The fallback to manual registration is a reasonable safety net during migration.

4. **Switch elimination** — GameScreen components are genuinely game-agnostic now. The registry pattern with `ComponentType<Props>` is clean React.

5. **Games import platform via path aliases** — `@game-platform/game-module.js` is better than relative `../../../` paths. Games reference the platform's public API, not its internals.

### What's Concerning

1. **Two sources of truth** — `GAME_CATALOG` + shared constants vs. `manifest.yaml`. Neither is deprecated. Future developers won't know which to update.

2. **Full code duplication** — `server/src/games/` still has complete copies of both game modules. This will inevitably drift.

3. **Client-side discovery uses directory names for ID resolution** — This is brittle. The manifest has an `id` field but the client registries can't read YAML (they use `import.meta.glob` on `.ts` files). The normalization logic (hyphen↔underscore) is a hack that breaks when directory names don't match game IDs.

---

## 5. Edge Cases

### Malformed Manifest

Handled correctly. `manifest-schema.ts` uses Zod's `.parse()` which throws on validation failure. `auto-discover.ts` catches this per-game and continues to the next game. If all manifests fail, the fallback in `app.ts` kicks in. **Good.**

### Game Module Import Failure

Handled. `auto-discover.ts` wraps the dynamic import in try/catch. Failed imports are logged and skipped. If all fail, fallback triggers. **Good.**

### Missing Manifest File

Handled. `readFileSync` will throw, caught by the per-game try/catch. **Good.**

### Missing `createModule()` Export

Partially handled. `auto-discover.ts` checks `typeof mod.createModule === 'function'` and throws if not. This is caught and the game is skipped. **Good.**

### Village Fallback Behavior

The server fallback works: `villageModule` (the old singleton at `server/src/games/village/index.ts`) registers as `village_of_shadows` via its `definition.id`. The handler looks up by `GameId.VILLAGE_OF_SHADOWS` = `'village_of_shadows'`. Match. Server-side Village works in fallback mode. But the client-side bug persists regardless of which server path is used.

---

## 6. Contract Drift (vs. REFACTOR_PLAN.md)

| Spec Item | Status | Notes |
|---|---|---|
| Create `games/` directory at repo root | ✅ | Clean structure |
| Move all game files (server + display + phone + types + tests) | ⚠️ | Files **copied**, not moved. Old `server/src/games/` copies remain |
| Create `manifest.yaml` per game | ✅ | Both manifests present with metadata |
| Extract from GAME_CATALOG + shared constants into YAML | ❌ | Duplicated, not extracted. GAME_CATALOG and constants still authoritative |
| Add `manifest-schema.ts` with Zod validation | ✅ | Schema validates at startup |
| Install `yaml` + `zod` deps | ✅ | Both in package.json |
| Create `index.ts` entry per game | ✅ | Exports createModule, DisplayComponent, PhoneComponent |
| Build auto-discovery for server | ✅ | Works with fallback |
| Build auto-discovery for clients (`import.meta.glob`) | ⚠️ | Built but has naming/alias bugs (Issues #1, #2) |
| Kill switch statements in GameScreen | ✅ | Both GameScreens use registry |
| **Remove game-specific types from shared package** | ❌ | Still present, still exported |
| Update tsconfig paths for all projects | ✅ | All tsconfigs have correct paths |

**3 of 11 items incomplete.** The incomplete items represent the core extraction promise of Phase 3.

---

## 7. Phase 2 Issues — Resolution Status

| Phase 2 Issue | Status |
|---|---|
| Zero test coverage for event bus | ⚪ Still no event bus tests |
| `GameEventHook` type duplicated in 4 files | ⚪ Still duplicated (now in `games/` copies too) |
| `Extract` uses string literal instead of enum | ⚪ Not addressed |
| `broadcastPrivateState` spec drift | ⚪ Spec not updated |
| No game loop tests | ⚪ Still no game loop tests |
| `as unknown as Record<string, unknown>` double-casts | ⚪ Still present in all game modules |

None of the Phase 2 recommendations were addressed. Not necessarily Phase 3's job, but worth tracking.

---

## 8. Recommendations

### Must Fix Before Phase 4

1. **Fix Village directory naming** (Critical): Rename `games/village/` to `games/village-of-shadows/` or update the client registries to use manifest IDs. The current setup will render a blank screen for Village games.

2. **Fix Vite aliases** (Critical): Add `@phone` alias to display's vite.config and `@display` alias to phone's vite.config. Alternatively, split the `index.ts` barrel exports so display-only globs don't pull in phone code and vice versa.

3. **Add tests for new code** (High): At minimum:
   - Manifest schema validation (valid, malformed, missing fields)
   - Auto-discovery (successful load, failed import, missing manifest, fallback behavior)
   - Client registry lookup (exact match, underscore/hyphen normalization, unknown game)

### Should Fix in Phase 3 Follow-up

4. **Remove game types from shared** (High): Delete `packages/shared/src/types/bluff-battle.ts` and `village.ts`. Remove their exports from `index.ts`. This was an explicit Phase 3 deliverable.

5. **Remove old server game modules** (Medium): Delete `server/src/games/bluff-battle/` and `server/src/games/village/` directories. Remove fallback imports from `app.ts`. The fallback was useful during development but shouldn't ship.

6. **Make manifests functional** (High): Either:
   - Have games read their metadata from the manifest (loaded by auto-discovery, passed to createModule)
   - Or delete the manifest duplication and keep GAME_CATALOG as the single source of truth
   - Don't maintain two sources that will inevitably drift

### Future Phases

7. **Standardize DisplayProps/PhoneProps** (Phase 4): Enforce via the registry interface, not local redefinition. All game display components should accept the same props contract.

8. **Extract game-specific enums from shared** (Phase 5): `PhaseType.BB_*`, `PhaseType.VOS_*`, `VillageRole`, game-specific `InputType` values, `GAME_CATALOG`, game icons, and timing constants should all move into game packages.

---

## Conclusion

Phase 3 made structural progress — the `games/` directory exists, the auto-discovery pipeline works server-side, switch statements are gone from GameScreen, and tsc/tests pass. The architectural direction is correct.

But the execution is incomplete. The three core extraction tasks (types out of shared, constants into YAML, old modules removed) were skipped. The YAML manifests exist but are never consumed. And two critical bugs (directory naming, Vite aliases) mean the client-side auto-discovery will fail at build and runtime.

The result is a codebase with more duplication than before Phase 3 started: game code exists in both `games/` and `server/src/games/`, types exist in both `games/*/types.ts` and `packages/shared/src/types/`, and metadata exists in both `manifest.yaml` and `GAME_CATALOG`. This is expected during a migration but the cleanup wasn't done.

**Recommended action:** Fix the two critical bugs (Issues #1, #2) and add tests for the new discovery code before moving to Phase 4. The extraction/cleanup items can be batched into a Phase 3.5 or folded into Phase 5, but they need to happen.
