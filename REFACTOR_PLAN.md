# Game Module Encapsulation Refactor

## Goal
Every game is fully self-contained in `games/<game-name>/`. The platform auto-discovers games by scanning the `games/` directory at startup — reading manifests, loading server modules, and registering client components. Adding a new game = drop a folder, implement the interface, restart. Zero platform code changes.

## Target Structure
```
games/
  bluff-battle/
    index.ts                 <- single entry: exports manifest, ServerModule, DisplayComponent, PhoneComponent
    manifest.yaml              <- metadata, timing, constants, icon, accent color
    types.ts                 <- BB-specific types (BBPublicState, BBPrivateState, etc.)
    server/
      index.ts               <- GameModule using injected GameContext
      prompts.ts
      prompts.test.ts
      scoring.ts
      scoring.test.ts
    display/
      BBDisplay.tsx
    phone/
      BBPhone.tsx
    assets/                  <- icons, sounds, images (optional)
  village/
    index.ts
    manifest.ts
    types.ts
    server/
      index.ts
      resolution.ts
      resolution.test.ts
      roles.ts
      roles.test.ts
    display/
      VillageDisplay.tsx
    phone/
      VillagePhone.tsx
      roleInfo.ts
    assets/
```

---

## Contracts

### 1. GameModule — Platform → Game (lifecycle hooks the platform calls)

```ts
export interface GameModule {
  // REQUIRED — called when game starts
  setup(players: Player[], ctx: GameContext): void;

  // REQUIRED — player submitted input
  handleInput(playerId: string, inputType: string, data: unknown): void;

  // OPTIONAL — player connection lifecycle
  handlePlayerDisconnect?(playerId: string): void;
  handlePlayerReconnect?(playerId: string): void;

  // OPTIONAL — platform requests current state (for reconnect/sync)
  getState?(playerId?: string): { public: unknown; private?: unknown };

  // OPTIONAL — game ending, clean up timers/state
  teardown?(): void;
}
```

The platform drives the game lifecycle:
| Call | When |
|---|---|
| `setup(players, ctx)` | Game starts — here are your players + your API |
| `handleInput(playerId, type, data)` | Player submitted something via phone |
| `handlePlayerDisconnect(playerId)` | Player dropped connection |
| `handlePlayerReconnect(playerId)` | Player reconnected |
| `getState(playerId?)` | Platform needs state for reconnect sync |
| `teardown()` | Game ending, clean up |

### 2. GameContext — Game → Platform (injected API the game calls)

Games NEVER import engine internals. They receive a `GameContext`:

```ts
export interface GameContext {
  roomId: string;

  // --- Timer ---
  startTimer(phaseType: string, durationMs: number, onExpire: () => void): void;
  stopTimer(): void;
  getTimerRemaining(): number | null;

  // --- Messaging (standard) ---
  sendToAll(message: object): void;
  sendToPlayer(playerId: string, message: object): void;
  sendToDisplay(message: object): void;

  // --- Event Bus (custom game events) ---
  emit(event: string, data?: unknown): void;                    // to ALL clients
  emitTo(playerId: string, event: string, data?: unknown): void; // to one player
  emitToDisplay(event: string, data?: unknown): void;            // to TV only

  // --- Scores ---
  initScores(playerIds: string[]): void;
  addPoints(playerId: string, points: number): void;
  getScores(): ScoreEntry[];
  broadcastScores(roundScores?: Map<string, number>): void;
  clearScores(): void;

  // --- Room ---
  getRoom(): RoomData;
  setRoomStatus(status: RoomStatus): void;
  getAllSessionIds(): string[];
  getPlayerSessionIds(excludePlayerId?: string): string[];

  // --- Phase Broadcasting ---
  broadcastPhase(phase: PhaseState, publicState: Record<string, unknown>): void;
  broadcastPrivateState(getState: (playerId: string) => Record<string, unknown>): void;
  broadcastGameOver(finalState: GameOverState): void;

  // --- Logging ---
  log: {
    info(...args: unknown[]): void;
    error(...args: unknown[]): void;
    warn(...args: unknown[]): void;
  };
}
```

### 3. Client Contracts — What game components receive

Games never touch WebSockets directly. The platform provides standardized props:

**Display (TV/shared screen):**
```ts
interface DisplayProps {
  phase: string;
  publicState: Record<string, unknown>;
  players: PlayerInfo[];
  scores: ScoreEntry[];
  timerMs: number | null;
  // Custom event listener — games define their own event vocabulary
  useGameEvent: (event: string, handler: (data: unknown) => void) => void;
}
```

**Phone (player controller):**
```ts
interface PhoneProps {
  phase: string;
  publicState: Record<string, unknown>;
  privateState: Record<string, unknown>;
  myPlayer: PlayerInfo;
  scores: ScoreEntry[];
  timerMs: number | null;
  // Send input back to game server — platform routes it
  submitInput: (type: string, data: unknown) => void;
  // Custom event listener
  useGameEvent: (event: string, handler: (data: unknown) => void) => void;
}
```

### 4. Event System

Two tiers of events flow through the platform:

**Tier 1 — Standard Events (platform handles automatically):**
- `phase:changed` — platform updates all clients, manages timer
- `score:updated` — platform broadcasts scoreboard
- `game:over` — platform triggers end flow, return to lobby
- `player:eliminated` — platform updates player status
- `timer:expired` — platform notifies game server

**Tier 2 — Custom Game Events (platform routes, doesn't interpret):**
```ts
// Server: game emits whatever it wants
ctx.emit('bluff:reveal', { playerId, wasBluffing: true, answer: '...' });
ctx.emit('village:vote-cast', { voterId, targetId });
ctx.emit('village:night-kill', { targetId, roleId });

// Client: game components listen for their own events
useGameEvent('bluff:reveal', (data) => {
  // animate the reveal card flip
});
```

Games define their own event vocabulary. The platform is a dumb pipe for custom events — it routes them to the right clients without interpreting them. New games can invent new interactions without touching platform code.

---

## Game Manifest (YAML)

Each game declares its metadata in a `manifest.yaml` at the game root. This is **data, not code** — human-readable, schema-validated at startup, and editable without recompiling.

```yaml
# games/bluff-battle/manifest.yaml
id: bluff-battle
name: Bluff Battle
tagline: Submit fake answers, vote for the real one
description: >
  Players write convincing fake answers to trivia questions.
  Everyone votes — fool the crowd, spot the truth, score big.
players:
  min: 3
  max: 12
estimatedMinutes: 15
icon: swords            # Lucide icon name
accentColor: indigo     # Tailwind color
categories: [bluffing, party, ai, trivia]
phases:
  instructions:
    duration: 10
  submission:
    duration: 60
  voting:
    duration: 30
  reveal:
    duration: 15
scoring:
  correct_answer: 1000
  fooled_player: 500
  fastest_vote: 250
```

### Runtime Validation

At startup, manifests are loaded and validated with a Zod schema:

```ts
// server/src/games/manifest-schema.ts
import { z } from "zod";

export const ManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  players: z.object({
    min: z.number().int().min(1),
    max: z.number().int().min(1),
  }),
  estimatedMinutes: z.number().positive(),
  icon: z.string(),
  accentColor: z.string(),
  categories: z.array(z.string()).optional(),
  phases: z.record(z.object({
    duration: z.number().positive(),  // seconds
  })),
  scoring: z.record(z.number()).optional(),
});

export type GameManifest = z.infer<typeof ManifestSchema>;
```

Invalid manifests fail loudly at startup — no silent fallbacks.

### Why YAML over TypeScript

- Manifests are **data declarations**, not logic — YAML is the natural fit
- Non-engineers (game designers, community) can create/edit manifests
- A future game editor UI can read/write YAML without touching TypeScript
- Schema validation gives full runtime type safety from the YAML boundary onward
- Hot-reloading a config file is trivial; recompiling TS is not

## Game Entry Point (index.ts)

Each game's root index.ts exports the code components. The manifest is loaded separately from YAML:
```ts
export { createModule } from "./server";           // factory: () => GameModule
export { BBDisplay as DisplayComponent } from "./display/BBDisplay";
export { BBPhone as PhoneComponent } from "./phone/BBPhone";
```

---

## Auto-Discovery

### Server (Node.js)
```ts
// server/src/games/auto-discover.ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { ManifestSchema } from './manifest-schema.js';

export async function discoverGames(): Promise<GameRegistration[]> {
  const gamesDir = join(__dirname, '../../../games');
  const entries = readdirSync(gamesDir, { withFileTypes: true });
  const games: GameRegistration[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const gameDir = join(gamesDir, entry.name);

    // Load and validate YAML manifest
    const rawYaml = readFileSync(join(gameDir, 'manifest.yaml'), 'utf-8');
    const manifest = ManifestSchema.parse(parseYaml(rawYaml));

    // Load code module
    const mod = await import(join(gameDir, 'index.ts'));
    games.push({
      manifest,
      createModule: mod.createModule,
    });
  }
  return games;
}
```

At startup in `app.ts`:
```ts
const games = await discoverGames();
for (const game of games) {
  gameRegistry.register(game);
}
// GAME_CATALOG is now generated from validated YAML manifests
```

### Client (Vite/React — build-time)
Vite uses `import.meta.glob` for zero-config discovery:
```ts
// Auto-import all game display components
const displayModules = import.meta.glob('/games/*/display/*.tsx', { eager: true });

// Auto-import all game phone components
const phoneModules = import.meta.glob('/games/*/phone/*.tsx', { eager: true });

// Auto-import all manifests (YAML loaded as raw text, parsed at runtime)
const manifests = import.meta.glob('/games/*/manifest.yaml', { as: 'raw', eager: true });
```

GameScreen resolves component from registry by gameId — no switch statement.

---

## Execution Phases

### Phase 1: GameContext API + Server Contracts ← IN PROGRESS (Agent 1)
- Create GameContext interface + factory (`create-game-context.ts`)
- Update GameModule interface with full lifecycle contract
- Refactor Bluff Battle server module to use ctx
- Refactor Village of Shadows server module to use ctx
- Wire injection at game start in handler.ts
- **No file moves, no client changes**

### Phase 2: Event Bus
- Add `emit()` / `emitTo()` / `emitToDisplay()` to GameContext
- Define standard platform events (Tier 1)
- Route custom game events (Tier 2) through WebSocket
- Add `useGameEvent` hook for client components
- Update display/phone components to use event listeners

### Phase 3: File Restructure + Auto-Discovery (Agent 2)
- Create `games/` directory at repo root
- Move all game files (server + display + phone + types + tests)
- Create `manifest.yaml` per game (extract from GAME_CATALOG + shared constants into YAML)
- Add `manifest-schema.ts` with Zod validation (install `yaml` + `zod` deps)
- Create `index.ts` entry per game (exports code only, not manifest)
- Build auto-discovery for server
- Build auto-discovery for clients (`import.meta.glob`)
- Kill switch statements in GameScreen
- Remove game-specific types from shared package
- Update tsconfig paths for all projects

### Phase 4: Client Contracts
- Define `DisplayProps` and `PhoneProps` interfaces
- Refactor display components to receive standardized props
- Refactor phone components to receive standardized props
- Games call `submitInput()` instead of building WebSocket messages
- Platform hydrates props from game state + phase info

### Phase 5: Cleanup & Validation
- Remove all game-specific imports from platform code
- Platform should have ZERO game-specific references
- Verify: drop a new empty game folder → platform discovers it
- Full test suite green across all packages

---

## Constraints
- Every commit must pass `tsc --noEmit` on all projects
- All tests must stay green
- Pure refactor — zero behavior changes
- Platform code should have ZERO game-specific references when done
- Games are sandboxed — they know about players and phases, not WebSockets, sessions, or rooms
