# CHECKLIST.md — Boredless Build Progress

## HOW TO USE THIS FILE

This is the single source of truth for build progress.
Check off items as they are completed. An agent starting fresh should:

1. Read this file to see what's done and what's next
2. Find the next unchecked item
3. Read the referenced document section for implementation details
4. Build it, verify it, check it off
5. Commit

**Reference documents (all in this repo):**
- `BUILD_SPEC.md` — Architecture, file paths, all source code
- `TESTS.md` — Test cases with exact expected outputs
- `AGENT_INSTRUCTIONS.md` — Execution playbook, common mistakes, error recovery
- `ERROR_CONTRACTS.md` — Error handling specifications

---

## PHASE 1: Scaffolding
> Reference: `BUILD_SPEC.md` Section 4, `AGENT_INSTRUCTIONS.md` Phase 1

- [ ] Create root `package.json` with workspaces (`BUILD_SPEC.md` Step 1.1)
- [ ] Create root `tsconfig.base.json` (`BUILD_SPEC.md` Step 1.2)
- [ ] Create `packages/shared/package.json` (`BUILD_SPEC.md` Step 2.1)
- [ ] Create `packages/shared/tsconfig.json` (`BUILD_SPEC.md` Step 2.2)
- [ ] Create `server/package.json` (`BUILD_SPEC.md` Step 3.1)
- [ ] Create `server/tsconfig.json` (`BUILD_SPEC.md` Step 3.2)
- [ ] Create `display/package.json` (`BUILD_SPEC.md` Step 4.1)
- [ ] Create `display/tsconfig.json` (`BUILD_SPEC.md` Step 4.2)
- [ ] Create `display/vite.config.ts` (`BUILD_SPEC.md` Step 4.3)
- [ ] Create `display/index.html` (`BUILD_SPEC.md` Step 4.4)
- [ ] Run `npm install` — must succeed with no errors
- [ ] `git commit -m "Phase 1: Project scaffolding"`

---

## PHASE 2: Shared Types Package
> Reference: `BUILD_SPEC.md` Section 5, `TESTS.md` Section 1
> File creation order: `AGENT_INSTRUCTIONS.md` Phase 2

- [ ] `packages/shared/src/enums.ts` — All enums (`BUILD_SPEC.md` Step 2.3)
- [ ] `packages/shared/src/constants.ts` — All constants (`BUILD_SPEC.md` Step 2.4)
- [ ] `packages/shared/src/types/room.ts` — Room/player types (`BUILD_SPEC.md` Step 2.5)
- [ ] `packages/shared/src/types/game.ts` — Game/phase types (`BUILD_SPEC.md` Step 2.6)
- [ ] `packages/shared/src/types/messages.ts` — WebSocket messages (`BUILD_SPEC.md` Step 2.7)
- [ ] `packages/shared/src/types/bluff-battle.ts` — BB-specific types (`BUILD_SPEC.md` Step 2.8)
- [ ] `packages/shared/src/types/village.ts` — Village-specific types (`BUILD_SPEC.md` Step 2.9)
- [ ] `packages/shared/src/validation.ts` — Zod schemas (`BUILD_SPEC.md` Step 2.10)
- [ ] `packages/shared/src/index.ts` — Re-exports everything (`BUILD_SPEC.md` Step 2.11)
- [ ] **VERIFY:** `npm run build --workspace=packages/shared` succeeds
- [ ] Write tests from `TESTS.md` Section 1 (validation.test.ts, constants.test.ts)
- [ ] **VERIFY:** All shared package tests pass
- [ ] `git commit -m "Phase 2: Shared types package"`

---

## PHASE 3: Game Server
> Reference: `BUILD_SPEC.md` Section 6, `TESTS.md` Section 2
> File creation order: `AGENT_INSTRUCTIONS.md` Phase 3

### Server Core
- [ ] `server/src/config.ts` (`BUILD_SPEC.md` Step 3.1)
- [ ] `server/src/utils/logger.ts` (`BUILD_SPEC.md` Step 3.2)
- [ ] `server/src/utils/id.ts` (`BUILD_SPEC.md` Step 3.3)
- [ ] `server/src/utils/code.ts` (`BUILD_SPEC.md` Step 3.4)

### WebSocket Infrastructure
- [ ] `server/src/ws/registry.ts` (`BUILD_SPEC.md` Step 3.5)
- [ ] `server/src/ws/send.ts` (`BUILD_SPEC.md` Step 3.6)

### Game Engine
- [ ] `server/src/engine/timer-engine.ts` (`BUILD_SPEC.md` Step 3.7)
- [ ] `server/src/engine/score-engine.ts` (`BUILD_SPEC.md` Step 3.8)
- [ ] `server/src/engine/room-manager.ts` (`BUILD_SPEC.md` Step 3.9)

### Game Module Interface
- [ ] `server/src/games/game-module.ts` (`BUILD_SPEC.md` Step 3.10)
- [ ] `server/src/games/registry.ts` (`BUILD_SPEC.md` Step 3.11)

### Bluff Battle
- [ ] `server/src/games/bluff-battle/prompts.ts` — 55 trivia prompts (`BUILD_SPEC.md` Step 3.12)
- [ ] `server/src/games/bluff-battle/scoring.ts` (`BUILD_SPEC.md` Step 3.13)
- [ ] `server/src/games/bluff-battle/index.ts` — Full game module (`BUILD_SPEC.md` Step 3.14)

### Village of Shadows
- [ ] `server/src/games/village/roles.ts` — Role distribution (`BUILD_SPEC.md` Step 3.15)
- [ ] `server/src/games/village/resolution.ts` — Night/win logic (`BUILD_SPEC.md` Step 3.16)
- [ ] `server/src/games/village/index.ts` — Full game module (`BUILD_SPEC.md` Steps 3.17–3.20)

### HTTP & WebSocket Routes
- [ ] `server/src/ws/handler.ts` (`BUILD_SPEC.md` Step 3.21)
- [ ] `server/src/routes/health.ts` (`BUILD_SPEC.md` Step 3.22)
- [ ] `server/src/routes/room.ts` (`BUILD_SPEC.md` Step 3.23)
- [ ] `server/src/app.ts` (`BUILD_SPEC.md` Step 3.24)
- [ ] `server/src/index.ts` (`BUILD_SPEC.md` Step 3.25)

### Server Verification
- [ ] **VERIFY:** Server starts without errors
- [ ] **VERIFY:** `curl http://localhost:3100/api/health` returns `{"status":"ok"}`
- [ ] **VERIFY:** `POST /api/rooms` returns roomId, code, qrDataUrl
- [ ] Write tests from `TESTS.md` Section 2 (all .test.ts files)
- [ ] **VERIFY:** All server tests pass
- [ ] Write integration tests from `TESTS.md` Section 3
- [ ] **VERIFY:** Integration tests pass
- [ ] `git commit -m "Phase 3: Game server"`

---

## PHASE 4: Display Client (TV)
> Reference: `BUILD_SPEC.md` Section 7, `AGENT_INSTRUCTIONS.md` Phase 4

### Stores & Hooks
- [ ] `display/src/styles/globals.css` (`BUILD_SPEC.md` Step 4.5)
- [ ] `display/src/store/connection.ts` (`BUILD_SPEC.md` Step 4.6)
- [ ] `display/src/store/room.ts` (`BUILD_SPEC.md` Step 4.7)
- [ ] `display/src/hooks/useWebSocket.ts` (`BUILD_SPEC.md` Step 4.8)

### Components
- [ ] `display/src/components/QRCode.tsx` (`BUILD_SPEC.md` Step 4.9)
- [ ] `display/src/components/PlayerList.tsx` (`BUILD_SPEC.md` Step 4.10)
- [ ] `display/src/components/Timer.tsx` (`BUILD_SPEC.md` Step 4.11)
- [ ] `display/src/components/Scoreboard.tsx` (`BUILD_SPEC.md` Step 4.12)
- [ ] `display/src/components/GameCard.tsx` (`BUILD_SPEC.md` Step 4.13)

### Screens
- [ ] `display/src/screens/HomeScreen.tsx` (`BUILD_SPEC.md` Step 4.14)
- [ ] `display/src/screens/LobbyScreen.tsx` (`BUILD_SPEC.md` Step 4.15)
- [ ] `display/src/screens/GameScreen.tsx` (`BUILD_SPEC.md` Step 4.16)

### Game Displays
- [ ] `display/src/games/bluff-battle/BBDisplay.tsx` (`BUILD_SPEC.md` Step 4.17)
- [ ] `display/src/games/village/VillageDisplay.tsx` (`BUILD_SPEC.md` Step 4.18)

### App Entry
- [ ] `display/src/App.tsx` (`BUILD_SPEC.md` Step 4.19)
- [ ] `display/src/main.tsx` (`BUILD_SPEC.md` Step 4.20)

### Display Verification
- [ ] **VERIFY:** `npm run dev:display` opens without console errors
- [ ] **VERIFY:** "Boredless" title renders
- [ ] **VERIFY:** "Create Room" button creates room and shows lobby
- [ ] **VERIFY:** QR code renders in lobby
- [ ] `git commit -m "Phase 4: Display client"`

---

## PHASE 5: Phone Controller
> Reference: `BUILD_SPEC.md` Section 8, `AGENT_INSTRUCTIONS.md` Phase 5
> NOTE: Can build as Expo OR web-only Vite app (see AGENT_INSTRUCTIONS.md)

### Stores
- [ ] `phone/` package setup (package.json, tsconfig, vite config)
- [ ] Phone connection store (`BUILD_SPEC.md` Step 5.4)
- [ ] Phone game store (`BUILD_SPEC.md` Step 5.5)

### Screens
- [ ] Join screen — code + name input (`BUILD_SPEC.md` Step 5.3)
- [ ] Lobby screen — waiting state (`BUILD_SPEC.md` Step 5.6)
- [ ] Game screen — router to game-specific UI (`BUILD_SPEC.md` Step 5.7)

### Game UIs
- [ ] Bluff Battle phone UI — submit + vote (`BUILD_SPEC.md` Step 5.8)
- [ ] Village phone UI — role reveal + night action + vote (`BUILD_SPEC.md` Step 5.9)
- [ ] Village role info helper (`BUILD_SPEC.md` Step 5.10)

### Phone Verification
- [ ] **VERIFY:** Phone app starts without errors
- [ ] **VERIFY:** Can enter room code and name
- [ ] **VERIFY:** Player appears in display lobby after joining
- [ ] `git commit -m "Phase 5: Phone controller"`

---

## PHASE 8: Integration & Polish
> Reference: `BUILD_SPEC.md` Section 9, `TESTS.md` Section 6

### End-to-End: Bluff Battle
- [ ] Create room on display
- [ ] 3+ players join from phone
- [ ] Start Bluff Battle
- [ ] All players submit fake answers
- [ ] All players vote
- [ ] Reveal shows correct answer highlighted green
- [ ] Scores update correctly
- [ ] Game completes after 3 rounds
- [ ] Game over screen shows winner

### End-to-End: Village of Shadows
- [ ] Start Village of Shadows (5+ players)
- [ ] All players see their roles on phone
- [ ] Night phase: werewolf/seer/doctor can act
- [ ] Night result shows who died (or no deaths)
- [ ] Day discussion timer works
- [ ] Vote phase: all players can vote
- [ ] Eliminated player is removed correctly
- [ ] Game ends with correct win condition

### Polish
- [ ] Return to lobby works after game over
- [ ] Create `README.md` (`BUILD_SPEC.md` Step 8.1)
- [ ] Create `.env.example` (`BUILD_SPEC.md` Step 8.3)
- [ ] `git commit -m "Phase 8: Integration complete - MVP ready"`

---

## STATUS

**Current Phase:** 1
**Last Completed:** None
**Blockers:** None
**Notes:** —
