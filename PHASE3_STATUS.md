# Phase 3 Status: File Restructure + Auto-Discovery ✅

## What Was Done

### 1. games/ Directory Created
Full self-contained game structure at repo root:
```
games/
  bluff-battle/
    manifest.yaml           ← YAML metadata (validated at server startup)
    types.ts                ← BB-specific types (moved from shared)
    index.ts                ← Exports createModule, DisplayComponent, PhoneComponent
    server/
      index.ts              ← Canonical BB game module
      prompts.ts
      scoring.ts
    display/
      BBDisplay.tsx
    phone/
      BBPhone.tsx
  village/
    manifest.yaml
    types.ts                ← Village-specific types (moved from shared)
    index.ts
    server/
      index.ts
      resolution.ts
      roles.ts
    display/
      VillageDisplay.tsx
    phone/
      VillagePhone.tsx
      roleInfo.ts
  tsconfig.json             ← Games type-checking config with path aliases
```

### 2. Manifest Schema + Validation
- `server/src/games/manifest-schema.ts` — Zod schema for YAML manifests
- YAML packages installed in server workspace
- Invalid manifests fail loudly at startup

### 3. Auto-Discovery
**Server**: `server/src/games/auto-discover.ts`
- Scans `games/` directory at startup
- Loads + validates YAML manifests
- Dynamic imports game code modules
- Falls back to manual registry if games/ not found

**Display + Phone**: `import.meta.glob` in registry files
- `display/src/games/registry.ts` — globs `/games/*/index.ts` for DisplayComponent
- `phone/src/games/registry.ts` — globs `/games/*/index.ts` for PhoneComponent

### 4. Switch Statements Eliminated
Both `display/src/screens/GameScreen.tsx` and `phone/src/screens/GameScreen.tsx`
now use the auto-discovered registry instead of switch statements.

### 5. Path Aliases Added
- `@display/*` → `./src/*` (display project)
- `@phone/*` → `./src/*` (phone project)
- `@game-platform/*` → `../server/src/games/*` (games project)
- All three vite.configs and tsconfigs updated

### 6. Types Migration
- BB-specific types moved to `games/bluff-battle/types.ts`
- Village-specific types moved to `games/village/types.ts`
- Original types remain in shared until Phase 5 cleanup

## What Was NOT Done (by design)

### Still Using GAME_CATALOG
- `phone/src/screens/LobbyScreen.tsx` still uses `GAME_CATALOG` from shared
- `phone/src/lib/gameIcons.tsx` still uses `GameId` enum
- GAME_CATALOG removal is deferred to Phase 5

### Server Game Files
- `server/src/games/bluff-battle/` and `village/` still exist for backward compat
- Tests (`integration.test.ts`, `e2e.test.ts`) import from these paths
- These will be cleaned up in Phase 5

## Test Status
- All 94 non-e2e tests: ✅ PASS
- E2E tests: 150 pass, 3 timeout failures (pre-existing timer flakiness, not related to Phase 3)
- All 5 tsconfig `npx tsc --noEmit` checks: ✅ PASS
