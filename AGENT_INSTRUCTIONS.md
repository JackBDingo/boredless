# AGENT_INSTRUCTIONS.md — How to Build Boredless

## WHO YOU ARE

You are a coding agent building the Boredless gaming platform.
You have THREE documents that govern your work:

1. **BUILD_SPEC.md** — The architecture. Every file, interface, function. Follow it EXACTLY.
2. **TESTS.md** — Test cases with exact expected outputs. Write and pass ALL of them.
3. **AGENT_INSTRUCTIONS.md** — This file. Your playbook for HOW to execute.

## CARDINAL RULES

### Rule 1: DO NOT IMPROVISE
If BUILD_SPEC.md specifies a function signature, use that exact signature.
If it specifies a file path, use that exact path.
If it specifies a constant value, use that exact value.
If something isn't specified, check if it's implied by the interfaces.
If it's truly not covered, implement the SIMPLEST possible version.
NEVER add features, abstractions, or "improvements" not in the spec.

### Rule 2: DO NOT MODIFY TESTS
Tests in TESTS.md are the acceptance criteria.
If a test fails, your IMPLEMENTATION is wrong — not the test.
The only exception: if the test has a clear syntax error (missing import, typo).
In that case, fix the syntax while preserving the test's intent.

### Rule 3: FOLLOW PHASE ORDER
Build phases in EXACT order: 1 → 2 → 3 → 4 → 5 → 8.
Do NOT skip ahead. Each phase builds on the previous.
Verify each phase passes its checkpoint before moving on.

### Rule 4: TYPE SAFETY IS NON-NEGOTIABLE
The `@boredless/shared` package IS the contract.
If your server code doesn't type-check against shared interfaces, it's wrong.
Do not use `any` except where BUILD_SPEC.md explicitly uses it.
Do not suppress TypeScript errors with `@ts-ignore` or `@ts-expect-error`.

### Rule 5: COMMIT AFTER EACH PHASE
After each phase passes its verification checkpoint:
```bash
git add -A && git commit -m "Phase N complete: [brief description]"
```
This creates recovery points if something goes wrong later.

---

## EXECUTION PLAYBOOK

### Phase 1: Scaffolding (~5 minutes)

**What to do:**
1. Create all config files from BUILD_SPEC.md Section 4
2. Create directory structure (just directories, not source files yet)
3. Run `npm install` from root

**Verification:**
```bash
# Must succeed
npm install
# Must exist
ls packages/shared/package.json server/package.json display/package.json
```

**Common mistakes to avoid:**
- Forgetting `"type": "module"` in package.json files
- Wrong workspace paths in root package.json
- Not creating the `packages/` directory before `packages/shared/`

**Commit:** `git add -A && git commit -m "Phase 1: Project scaffolding"`

---

### Phase 2: Shared Types Package (~15 minutes)

**What to do:**
1. Create ALL files in `packages/shared/src/` from BUILD_SPEC.md Section 5
2. Create test files from TESTS.md Section 1
3. Build and test

**File creation order (dependencies matter):**
1. `enums.ts` (no deps)
2. `constants.ts` (no deps)
3. `types/room.ts` (imports enums)
4. `types/game.ts` (imports enums)
5. `types/messages.ts` (imports enums, room, game)
6. `types/bluff-battle.ts` (no deps)
7. `types/village.ts` (imports enums)
8. `validation.ts` (imports constants, enums)
9. `index.ts` (re-exports all)

**Verification:**
```bash
npm run build --workspace=packages/shared  # Must succeed
npx vitest run --workspace=packages/shared  # All tests must pass
```

**Common mistakes to avoid:**
- Missing `.js` extensions on relative imports (required for ESM)
- Forgetting to export from `index.ts`
- Using `const enum` (breaks isolated modules)
- Circular imports between type files

**Commit:** `git add -A && git commit -m "Phase 2: Shared types package"`

---

### Phase 3: Game Server (~45 minutes)

**What to do:**
1. Create ALL server files from BUILD_SPEC.md Section 6
2. Create test files from TESTS.md Section 2
3. Build and test

**File creation order (dependencies matter):**
1. `config.ts` (imports shared)
2. `utils/logger.ts` (no deps)
3. `utils/id.ts` (imports nanoid)
4. `utils/code.ts` (imports shared)
5. `ws/registry.ts` (imports ws)
6. `ws/send.ts` (imports shared, registry)
7. `engine/timer-engine.ts` (imports shared, ws/send)
8. `engine/score-engine.ts` (imports shared, room-manager) — **STUB room-manager import first**
9. `engine/room-manager.ts` (imports shared, ws/send, utils, qrcode)
10. `games/game-module.ts` (imports shared)
11. `games/registry.ts` (imports game-module)
12. `games/bluff-battle/prompts.ts` (imports shared)
13. `games/bluff-battle/scoring.ts` (imports shared)
14. `games/bluff-battle/index.ts` (imports everything)
15. `games/village/roles.ts` (imports shared)
16. `games/village/resolution.ts` (imports shared, roles)
17. `games/village/index.ts` (imports everything)
18. `ws/handler.ts` (imports everything)
19. `routes/health.ts` (imports fastify)
20. `routes/room.ts` (imports fastify, room-manager)
21. `app.ts` (imports everything, wires it together)
22. `index.ts` (entry point)

**Verification:**
```bash
# Build shared first (dependency)
npm run build --workspace=packages/shared

# Start server (background)
npm run dev --workspace=server &
sleep 3

# Health check
curl -s http://localhost:3100/api/health | jq .
# Expected: {"status":"ok","timestamp":...}

# Create room
curl -s -X POST http://localhost:3100/api/rooms | jq .
# Expected: {"roomId":"...","code":"XXXX","qrDataUrl":"data:image/png..."}

# Kill server
kill %1

# Run tests
npx vitest run --project server
# All tests must pass
```

**Common mistakes to avoid:**
- `@fastify/websocket` v11 API changed — use `socket` parameter, not `connection`
- `qrcode` package's `toDataURL` is async — must await it
- Room manager is a singleton — tests share state (use beforeEach to reset)
- Timer callbacks fire after test cleanup — mock timers or use `vi.useFakeTimers()`
- `nanoid` v5 is ESM-only — must use dynamic import or ensure ESM setup is correct
- Score engine imports room-manager which creates circular dependency risk — handle with lazy access

**The WebSocket handler type assertions:**
BUILD_SPEC.md uses `as Extract<ClientMessage, { type: '...' }>` for narrowing.
This pattern is correct and intentional. Do NOT replace with switch-case type guards
that would require different message type narrowing.

**Commit:** `git add -A && git commit -m "Phase 3: Game server with Bluff Battle and Village modules"`

---

### Phase 4: Display Client (~30 minutes)

**What to do:**
1. Create ALL display files from BUILD_SPEC.md Section 7
2. No automated tests for display (visual verification)
3. Build and verify in browser

**File creation order:**
1. `styles/globals.css`
2. `store/connection.ts`
3. `store/room.ts`
4. `hooks/useWebSocket.ts`
5. `components/` (all 5 components, any order)
6. `games/bluff-battle/BBDisplay.tsx`
7. `games/village/VillageDisplay.tsx`
8. `screens/` (HomeScreen, LobbyScreen, GameScreen)
9. `App.tsx`
10. `main.tsx`

**Verification:**
```bash
# Start server (must be running)
npm run dev --workspace=server &

# Start display
npm run dev --workspace=display &

# Open browser to http://localhost:5173
# 1. Page loads without console errors
# 2. "Boredless" title is visible
# 3. "Create Room" button is clickable
# 4. Clicking creates a room and shows lobby with QR code
```

**Common mistakes to avoid:**
- Vite proxy config must handle WebSocket upgrade — use `ws: true` in proxy
- Tailwind CSS v4 uses `@import "tailwindcss"` not `@tailwind base` directives
- `@tailwindcss/vite` plugin is required for Tailwind v4 in Vite
- Zustand v5 API: `create<Type>()((set, get) => ...)` — note the double parentheses
- React 19 may warn about certain patterns — suppress only if the warning is cosmetic

**Sound files:**
The display references `.mp3` files in `src/sounds/`. For MVP, create them as empty files:
```bash
mkdir -p display/src/sounds
for f in join countdown reveal vote eliminate victory; do
  touch display/src/sounds/$f.mp3
done
```
Sound playback will fail silently without real audio files. This is acceptable for MVP.

**Commit:** `git add -A && git commit -m "Phase 4: Display client"`

---

### Phase 5: Phone Controller (~30 minutes)

**What to do:**
1. Initialize Expo project OR build as web-only React app
2. Create phone files from BUILD_SPEC.md Section 8

**CRITICAL DECISION: Expo vs Web-Only**

Expo has heavy setup requirements (Expo CLI, native dependencies, Metro bundler).
For faster iteration, you MAY build the phone client as a simple Vite React app
that mimics mobile UI with responsive design. This is acceptable for MVP IF:
- All the same screens and interactions work
- The WebSocket connection logic is identical
- It runs on `localhost:5174` (different port from display)
- File structure mirrors the spec (but in `phone/src/` instead of `phone/app/`)

If going web-only, create `phone/package.json` as a Vite React app:
```json
{
  "name": "@boredless/phone",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "vite build"
  },
  "dependencies": {
    "@boredless/shared": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

Then adapt the React Native components to React DOM equivalents:
- `View` → `div`
- `Text` → `span` / `p`
- `TouchableOpacity` → `button`
- `TextInput` → `input` / `textarea`
- `StyleSheet.create` → Tailwind classes
- `router.replace` → state-based screen switching (same as display)

**The logic, state management, and WebSocket protocol stay IDENTICAL.**

**Verification:**
```bash
# Start server
npm run dev --workspace=server &

# Start display
npm run dev --workspace=display &

# Start phone
npm run dev --workspace=phone &

# Open display: http://localhost:5173 — Create Room
# Open phone: http://localhost:5174 — Enter room code + name
# Verify: player appears on display lobby
```

**Commit:** `git add -A && git commit -m "Phase 5: Phone controller client"`

---

### Phase 8: Integration & Polish (~15 minutes)

**What to do:**
1. End-to-end manual test (see TESTS.md Section 6)
2. Fix any issues found
3. Add README.md from BUILD_SPEC.md
4. Create `.env.example`

**End-to-end test script (manual):**
1. Start server: `npm run dev:server`
2. Start display: `npm run dev:display`
3. Start phone: `npm run dev:phone`
4. On display: Create Room → note the room code
5. Open 3 phone browser tabs → join with different names
6. On display: verify all 3 players appear in lobby
7. On display: select Bluff Battle → Start Game
8. On each phone: see the prompt, type a fake answer, submit
9. On each phone: see voting options, vote for an answer
10. On display: verify reveal shows correct answer highlighted in green
11. On display: verify scores update
12. Repeat for 3 rounds
13. Verify game over screen shows winner
14. Test "Return to Lobby" functionality

**Final commit:** `git add -A && git commit -m "Phase 8: Integration complete - MVP ready"`

---

## ERROR RECOVERY

### If TypeScript won't compile:
1. Check import paths — ESM requires `.js` extensions on relative imports
2. Check `@boredless/shared` is built — run `npm run build:shared`
3. Check for circular imports — follow the dependency order above
4. Check Zustand v5 API — it changed from v4

### If WebSocket won't connect:
1. Check Vite proxy config in `display/vite.config.ts`
2. Check `@fastify/websocket` is registered BEFORE routes
3. Check CORS origins include `http://localhost:5173`
4. Check server is actually running on port 3100

### If tests fail:
1. Read the test carefully — it defines the expected behavior
2. Check if the implementation matches BUILD_SPEC.md
3. Common issue: async functions not awaited
4. Common issue: Map operations returning undefined instead of expected values
5. DO NOT MODIFY THE TEST unless it has a clear syntax error

### If a phase verification fails:
1. Do NOT move to the next phase
2. Fix the issue in the current phase
3. Re-run verification
4. Only proceed when all checkpoints pass

---

## WHAT NOT TO DO

- ❌ Do not add a database (MVP is in-memory)
- ❌ Do not add authentication
- ❌ Do not add Socket.io (use raw `ws`)
- ❌ Do not add SSR or Next.js
- ❌ Do not add state management libraries beyond Zustand
- ❌ Do not add a CSS framework beyond Tailwind
- ❌ Do not add a UI component library (no shadcn, MUI, Chakra)
- ❌ Do not add animations beyond what Framer Motion provides
- ❌ Do not add logging libraries beyond the simple logger in the spec
- ❌ Do not restructure the file layout
- ❌ Do not rename interfaces or types
- ❌ Do not change port numbers
- ❌ Do not add environment variables not in the spec
- ❌ Do not create abstractions "for future use"
- ❌ Do not write "TODO" comments — implement it or don't

---

## COMMUNICATION

If you are a sub-agent and encounter a GENUINE blocker (not a fixable bug):
1. Document exactly what failed and why
2. Document what you tried
3. Document your best guess at the fix
4. Report back to the supervisor

Do NOT silently skip features or write stubs that pretend to work.
Honesty about what's incomplete is better than fake completeness.

---

*This document ensures every agent session produces identical output.*
*Follow it mechanically. The spec is the spec.*
