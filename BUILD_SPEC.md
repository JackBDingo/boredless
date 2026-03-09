# BUILD_SPEC.md — Boredless MVP

## DOCUMENT PURPOSE

This document is the SOLE source of truth for building Boredless MVP.
A coding agent (Sonnet 4.6) must be able to execute this document from top to bottom
without any additional context, conversation history, or human clarification.

Every file path, interface, dependency, API endpoint, data structure, and implementation
detail is specified explicitly. DO NOT deviate. DO NOT improvise. DO NOT add features
not described here. Follow this document mechanically.

---

## TABLE OF CONTENTS

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Repository Structure](#3-repository-structure)
4. [Phase 1: Project Scaffolding](#4-phase-1-project-scaffolding)
5. [Phase 2: Shared Types Package](#5-phase-2-shared-types-package)
6. [Phase 3: Game Server](#6-phase-3-game-server)
7. [Phase 4: Display Client (TV)](#7-phase-4-display-client-tv)
8. [Phase 5: Phone Controller Client](#8-phase-5-phone-controller-client)
9. [Phase 6: Game Module — Bluff Battle](#9-phase-6-game-module-bluff-battle)
10. [Phase 7: Game Module — Village of Shadows](#10-phase-7-game-module-village-of-shadows)
11. [Phase 8: Integration & Polish](#11-phase-8-integration-and-polish)
12. [Appendix A: Complete API Reference](#12-appendix-a-complete-api-reference)
13. [Appendix B: WebSocket Message Reference](#13-appendix-b-websocket-message-reference)
14. [Appendix C: Content Banks](#14-appendix-c-content-banks)
15. [Appendix D: Environment & Deployment](#15-appendix-d-environment-and-deployment)

---

## 1. PROJECT OVERVIEW

### What Is Boredless

A multi-device social gaming platform where:
- A TV/laptop (shared display) shows public game state
- Players join from phones as controllers with private state
- A backend server runs ALL game logic authoritatively
- Games are pluggable modules on a reusable engine

### MVP Scope

- Room creation with short codes and QR join
- Lobby system with host controls
- Real-time WebSocket synchronization
- 2 complete games:
  1. **Bluff Battle** — text input + anonymous voting + reveal scoring
  2. **Village of Shadows** — hidden roles + night/day phases + elimination voting
- Reconnect handling with grace period
- No user accounts, no authentication, no database (in-memory for MVP)
- No drawing/canvas features (Sketch Attack deferred)

### Key Architectural Decisions

1. **Server-authoritative**: ALL game state lives on the server. Clients are dumb renderers.
2. **No SSR framework**: Vite React SPA for display, React Native Expo for phone.
3. **WebSocket-first**: All real-time communication over WebSocket. REST only for room creation/join.
4. **Monorepo**: All packages in one repo with npm workspaces.
5. **TypeScript everywhere**: Server, clients, shared types — all TypeScript.

---

## 2. TECHNOLOGY STACK

### Server
- **Runtime**: Node.js >= 20
- **Language**: TypeScript 5.x
- **HTTP Framework**: Fastify 5.x
- **WebSocket**: ws 8.x (raw WebSocket, NOT Socket.io)
- **Build**: tsx (for development), tsup (for production build)
- **Testing**: Vitest
- **QR Generation**: qrcode (npm package, server-side generation as data URL)

### Display Client (TV/Shared Screen)
- **Framework**: React 19
- **Build**: Vite 6
- **Styling**: Tailwind CSS 4
- **Animations**: Framer Motion 12
- **Sound**: Howler.js 2.x
- **State Management**: Zustand 5
- **Testing**: Vitest + React Testing Library

### Phone Controller Client
- **Framework**: React Native 0.76+ via Expo SDK 52
- **Navigation**: Expo Router
- **Styling**: NativeWind (Tailwind for React Native)
- **State Management**: Zustand 5
- **Testing**: Jest + React Native Testing Library
- **Web fallback**: Expo Web (so browser join also works)

### Shared Types Package
- **Language**: TypeScript 5.x
- **Build**: tsup
- **Purpose**: Type definitions, enums, constants, validation schemas shared across all packages

### Development Tools
- **Monorepo**: npm workspaces
- **Linting**: ESLint 9 (flat config)
- **Formatting**: Prettier 3
- **Git hooks**: None for MVP (keep it simple)

### Exact Dependency Versions (pin these)

```json
{
  "server": {
    "fastify": "^5.0.0",
    "ws": "^8.18.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/cors": "^10.0.0",
    "qrcode": "^1.5.4",
    "nanoid": "^5.0.0",
    "tsx": "^4.19.0",
    "tsup": "^8.3.0",
    "vitest": "^2.1.0",
    "typescript": "^5.6.0"
  },
  "display": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "framer-motion": "^12.0.0",
    "howler": "^2.2.4",
    "@types/howler": "^2.2.12",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0"
  },
  "shared": {
    "zod": "^3.23.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0"
  }
}
```

---

## 3. REPOSITORY STRUCTURE

```
boredless/
├── package.json                    # Root workspace config
├── tsconfig.base.json              # Shared TS config
├── .gitignore
├── .prettierrc
├── eslint.config.js
├── README.md
├── PRD.md
├── BUILD_SPEC.md
│
├── packages/
│   └── shared/                     # @boredless/shared
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       └── src/
│           ├── index.ts            # Re-exports everything
│           ├── types/
│           │   ├── room.ts         # Room, Player, Session types
│           │   ├── game.ts         # Game engine types
│           │   ├── messages.ts     # All WebSocket message types
│           │   ├── bluff-battle.ts # Bluff Battle specific types
│           │   └── village.ts      # Village of Shadows specific types
│           ├── constants.ts        # All magic numbers, timeouts, limits
│           ├── enums.ts            # All enums
│           └── validation.ts       # Zod schemas for inputs
│
├── server/                         # @boredless/server
│   ├── package.json
│   ├── tsconfig.json
│   ├── tsup.config.ts
│   └── src/
│       ├── index.ts                # Entry point — starts Fastify
│       ├── config.ts               # Server configuration
│       ├── app.ts                  # Fastify app factory
│       ├── routes/
│       │   ├── room.ts             # POST /api/rooms, GET /api/rooms/:code
│       │   └── health.ts           # GET /api/health
│       ├── ws/
│       │   ├── handler.ts          # WebSocket connection handler
│       │   ├── registry.ts         # Session-to-WebSocket mapping
│       │   └── send.ts             # Type-safe message sending helpers
│       ├── engine/
│       │   ├── room-manager.ts     # Room lifecycle (create, join, leave, close)
│       │   ├── phase-engine.ts     # Phase state machine
│       │   ├── timer-engine.ts     # Server-authoritative timers
│       │   ├── visibility.ts       # Public/private state filtering
│       │   ├── score-engine.ts     # Score tracking
│       │   └── input-handler.ts    # Input validation and routing
│       ├── games/
│       │   ├── registry.ts         # Game module registry
│       │   ├── game-module.ts      # GameModule interface (abstract)
│       │   ├── bluff-battle/
│       │   │   ├── index.ts        # BluffBattleModule implementation
│       │   │   ├── phases.ts       # Phase definitions
│       │   │   ├── scoring.ts      # Scoring logic
│       │   │   └── prompts.ts      # Prompt bank (50+ prompts)
│       │   └── village/
│       │       ├── index.ts        # VillageModule implementation
│       │       ├── phases.ts       # Phase definitions
│       │       ├── roles.ts        # Role definitions and distribution
│       │       └── resolution.ts   # Night resolution logic
│       └── utils/
│           ├── id.ts               # ID generation (nanoid)
│           ├── code.ts             # Room code generation
│           └── logger.ts           # Structured logging
│
├── display/                        # @boredless/display
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx                # React entry
│       ├── App.tsx                 # Router/layout
│       ├── store/
│       │   ├── connection.ts       # WebSocket connection store
│       │   └── room.ts             # Room state store
│       ├── hooks/
│       │   ├── useWebSocket.ts     # WebSocket connection hook
│       │   └── useSound.ts         # Sound effect hook
│       ├── screens/
│       │   ├── HomeScreen.tsx       # Create room
│       │   ├── LobbyScreen.tsx      # QR code + player list
│       │   ├── GameSelectScreen.tsx  # Game catalog
│       │   └── GameScreen.tsx       # Active game (delegates to game components)
│       ├── games/
│       │   ├── bluff-battle/
│       │   │   ├── BBDisplay.tsx        # Main Bluff Battle display component
│       │   │   ├── BBPromptPhase.tsx    # Show prompt
│       │   │   ├── BBWaitingPhase.tsx   # Waiting for submissions
│       │   │   ├── BBVotingPhase.tsx    # Show answers for voting
│       │   │   ├── BBRevealPhase.tsx    # Reveal correct + who fooled whom
│       │   │   └── BBScoreboard.tsx     # Round/final scores
│       │   └── village/
│       │       ├── VillageDisplay.tsx       # Main Village display component
│       │       ├── VillageNightPhase.tsx    # Night phase display
│       │       ├── VillageDayPhase.tsx      # Day phase display
│       │       ├── VillageVotePhase.tsx     # Voting display
│       │       ├── VillageRevealPhase.tsx   # Elimination reveal
│       │       └── VillageEndPhase.tsx      # Game over display
│       ├── components/
│       │   ├── QRCode.tsx           # QR code display
│       │   ├── PlayerList.tsx       # Player avatars/names
│       │   ├── Timer.tsx            # Countdown timer
│       │   ├── Scoreboard.tsx       # Generic scoreboard
│       │   └── GameCard.tsx         # Game selection card
│       ├── sounds/                  # Sound effect files (.mp3)
│       │   ├── join.mp3
│       │   ├── countdown.mp3
│       │   ├── reveal.mp3
│       │   ├── vote.mp3
│       │   ├── eliminate.mp3
│       │   └── victory.mp3
│       └── styles/
│           └── globals.css          # Tailwind imports + custom styles
│
└── phone/                          # @boredless/phone (Expo)
    ├── package.json
    ├── tsconfig.json
    ├── app.json                    # Expo config
    ├── babel.config.js
    ├── metro.config.js
    ├── nativewind-env.d.ts
    └── app/                        # Expo Router file-based routing
        ├── _layout.tsx             # Root layout
        ├── index.tsx               # Join screen (enter code + name)
        ├── lobby.tsx               # Waiting in lobby
        ├── game.tsx                # Active game (delegates to game components)
        ├── components/
        │   ├── Button.tsx          # Styled button
        │   ├── TextInput.tsx       # Styled text input
        │   ├── Timer.tsx           # Countdown display
        │   ├── RoleCard.tsx        # Private role display
        │   └── VoteOption.tsx      # Voting button
        ├── games/
        │   ├── bluff-battle/
        │   │   ├── BBPhone.tsx         # Main BB phone component
        │   │   ├── BBSubmitPhase.tsx    # Text input for fake answer
        │   │   ├── BBVotePhase.tsx      # Vote selection
        │   │   ├── BBWaitPhase.tsx      # Waiting state
        │   │   └── BBResultPhase.tsx    # Round results on phone
        │   └── village/
        │       ├── VillagePhone.tsx         # Main Village phone component
        │       ├── VillageRolePhase.tsx     # See your role
        │       ├── VillageNightPhase.tsx    # Night action (role-specific)
        │       ├── VillageDayPhase.tsx      # Discussion phase
        │       ├── VillageVotePhase.tsx     # Vote to eliminate
        │       └── VillageDeadPhase.tsx     # Spectator view
        └── store/
            ├── connection.ts       # WebSocket + session store
            └── game.ts            # Game state store
```

---

## 4. PHASE 1: PROJECT SCAFFOLDING

### Step 1.1: Root package.json

Create `package.json` in the repository root:

```json
{
  "name": "boredless",
  "private": true,
  "workspaces": [
    "packages/*",
    "server",
    "display",
    "phone"
  ],
  "scripts": {
    "dev": "npm run dev --workspace=server & npm run dev --workspace=display",
    "dev:server": "npm run dev --workspace=server",
    "dev:display": "npm run dev --workspace=display",
    "dev:phone": "npm run dev --workspace=phone",
    "build": "npm run build --workspace=packages/shared && npm run build --workspace=server && npm run build --workspace=display",
    "build:shared": "npm run build --workspace=packages/shared",
    "test": "npm run test --workspaces --if-present",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "eslint": "^9.0.0",
    "prettier": "^3.4.0",
    "typescript": "^5.6.0"
  }
}
```

### Step 1.2: tsconfig.base.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Step 1.3: .gitignore

```
node_modules/
dist/
.expo/
.turbo/
*.tsbuildinfo
.env
.env.local
.DS_Store
coverage/
```

### Step 1.4: .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### Step 1.5: eslint.config.js

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '.expo/**'],
  },
);
```

---

## 5. PHASE 2: SHARED TYPES PACKAGE

### Purpose

This package defines EVERY type, enum, constant, and validation schema used across
server, display, and phone. It is the contract between all parts of the system.

### Step 2.1: packages/shared/package.json

```json
{
  "name": "@boredless/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.6.0"
  }
}
```

### Step 2.2: packages/shared/tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### Step 2.3: packages/shared/tsup.config.ts

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

### Step 2.4: packages/shared/src/enums.ts

```ts
// ============================================================
// ALL ENUMS — Used across the entire system
// ============================================================

/** Room lifecycle status */
export enum RoomStatus {
  WAITING_FOR_PLAYERS = 'waiting_for_players',
  IN_LOBBY = 'in_lobby',
  GAME_STARTING = 'game_starting',
  IN_GAME = 'in_game',
  GAME_ENDED = 'game_ended',
  CLOSED = 'closed',
}

/** Player connection status */
export enum PlayerStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  REMOVED = 'removed',
}

/** Device type for sessions */
export enum DeviceType {
  DISPLAY = 'display',
  PHONE = 'phone',
}

/** Who can see a piece of state */
export enum Visibility {
  PUBLIC = 'public',           // Display + all players
  ALL_PLAYERS = 'all_players', // All players but NOT display
  PLAYER = 'player',           // Single specific player
  HOST = 'host',               // Host only
}

/** Game IDs — one per game module */
export enum GameId {
  BLUFF_BATTLE = 'bluff_battle',
  VILLAGE_OF_SHADOWS = 'village_of_shadows',
}

/** Generic phase types used across games */
export enum PhaseType {
  // Shared phases
  LOBBY = 'lobby',
  INSTRUCTIONS = 'instructions',
  GAME_OVER = 'game_over',

  // Bluff Battle phases
  BB_PROMPT = 'bb_prompt',
  BB_SUBMIT = 'bb_submit',
  BB_VOTING = 'bb_voting',
  BB_REVEAL = 'bb_reveal',
  BB_SCORES = 'bb_scores',

  // Village of Shadows phases
  VOS_ROLE_REVEAL = 'vos_role_reveal',
  VOS_NIGHT = 'vos_night',
  VOS_NIGHT_RESULT = 'vos_night_result',
  VOS_DAY = 'vos_day',
  VOS_VOTE = 'vos_vote',
  VOS_VOTE_RESULT = 'vos_vote_result',
}

/** Input types that players can submit */
export enum InputType {
  TEXT = 'text',
  VOTE = 'vote',
  CONFIRM = 'confirm',
  NIGHT_ACTION = 'night_action',
}

/** Village of Shadows roles */
export enum VillageRole {
  VILLAGER = 'villager',
  WEREWOLF = 'werewolf',
  SEER = 'seer',
  DOCTOR = 'doctor',
}

/** WebSocket close codes */
export enum CloseCode {
  NORMAL = 1000,
  GOING_AWAY = 1001,
  ROOM_CLOSED = 4000,
  KICKED = 4001,
  INVALID_SESSION = 4002,
  ROOM_FULL = 4003,
}

/** Client-to-server message types */
export enum ClientMessageType {
  JOIN_ROOM = 'join_room',
  REJOIN = 'rejoin',
  JOIN_DISPLAY = 'join_display',
  SELECT_GAME = 'select_game',
  START_GAME = 'start_game',
  SUBMIT_INPUT = 'submit_input',
  KICK_PLAYER = 'kick_player',
  RETURN_TO_LOBBY = 'return_to_lobby',
  CLOSE_ROOM = 'close_room',
  PING = 'ping',
}

/** Server-to-client message types */
export enum ServerMessageType {
  ROOM_STATE = 'room_state',
  PLAYER_JOINED = 'player_joined',
  PLAYER_LEFT = 'player_left',
  PLAYER_KICKED = 'player_kicked',
  GAME_SELECTED = 'game_selected',
  GAME_STARTED = 'game_started',
  PHASE_CHANGED = 'phase_changed',
  TIMER_TICK = 'timer_tick',
  TIMER_EXPIRED = 'timer_expired',
  INPUT_ACCEPTED = 'input_accepted',
  INPUT_REJECTED = 'input_rejected',
  PRIVATE_STATE = 'private_state',
  SCORE_UPDATE = 'score_update',
  GAME_OVER = 'game_over',
  ROOM_CLOSED = 'room_closed',
  ERROR = 'error',
  PONG = 'pong',
  JOINED = 'joined',
}
```

### Step 2.5: packages/shared/src/constants.ts

```ts
// ============================================================
// ALL CONSTANTS — Magic numbers, timeouts, limits
// ============================================================

/** Room settings */
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1
export const MAX_PLAYERS_PER_ROOM = 12;
export const MIN_PLAYER_NAME_LENGTH = 1;
export const MAX_PLAYER_NAME_LENGTH = 16;

/** Reconnect settings */
export const RECONNECT_GRACE_PERIOD_MS = 30_000; // 30 seconds
export const HEARTBEAT_INTERVAL_MS = 5_000;      // Client pings every 5s
export const HEARTBEAT_TIMEOUT_MS = 15_000;       // Server drops after 15s no ping

/** Available player colors (hex values) */
export const PLAYER_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Sky
  '#F0B27A', // Peach
  '#AED6F1', // Light Blue
] as const;

/** Bluff Battle settings */
export const BB_MIN_PLAYERS = 3;
export const BB_MAX_PLAYERS = 8;
export const BB_ROUNDS_DEFAULT = 3;
export const BB_SUBMIT_TIME_SECONDS = 60;
export const BB_VOTE_TIME_SECONDS = 30;
export const BB_REVEAL_TIME_SECONDS = 10;
export const BB_SCORES_TIME_SECONDS = 8;
export const BB_INSTRUCTIONS_TIME_SECONDS = 10;
export const BB_MAX_ANSWER_LENGTH = 100;
export const BB_POINTS_CORRECT_ANSWER = 1000;    // Voting for the correct answer
export const BB_POINTS_FOOLED_PLAYER = 500;      // Each player fooled by your fake

/** Village of Shadows settings */
export const VOS_MIN_PLAYERS = 5;
export const VOS_MAX_PLAYERS = 10;
export const VOS_ROLE_REVEAL_TIME_SECONDS = 10;
export const VOS_NIGHT_TIME_SECONDS = 30;
export const VOS_NIGHT_RESULT_TIME_SECONDS = 8;
export const VOS_DAY_TIME_SECONDS = 120;         // 2 minutes discussion
export const VOS_VOTE_TIME_SECONDS = 30;
export const VOS_VOTE_RESULT_TIME_SECONDS = 8;

/** Server settings */
export const DEFAULT_PORT = 3100;
export const CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:8081'];

/** Timer tick interval */
export const TIMER_TICK_INTERVAL_MS = 1000;

/** Room inactivity timeout */
export const ROOM_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
```

### Step 2.6: packages/shared/src/types/room.ts

```ts
import { DeviceType, PlayerStatus, RoomStatus } from '../enums.js';

/** A player in a room */
export interface Player {
  id: string;             // nanoid
  name: string;
  color: string;          // hex color from PLAYER_COLORS
  status: PlayerStatus;
  isHost: boolean;
  sessionId: string;      // links to Session
  joinedAt: number;       // timestamp ms
  disconnectedAt: number | null;
}

/** A device session (display or phone) */
export interface Session {
  id: string;              // nanoid
  roomId: string;
  deviceType: DeviceType;
  playerId: string | null; // null for display sessions
  reconnectToken: string;  // nanoid, used for reconnect
  connected: boolean;
  lastSeenAt: number;      // timestamp ms
}

/** A room */
export interface Room {
  id: string;              // nanoid
  code: string;            // 4-char room code
  status: RoomStatus;
  hostPlayerId: string;
  displaySessionId: string | null;
  players: Player[];
  selectedGameId: string | null;
  createdAt: number;       // timestamp ms
  updatedAt: number;       // timestamp ms
}

/** Public room state sent to display */
export interface PublicRoomState {
  code: string;
  status: RoomStatus;
  players: PublicPlayerState[];
  selectedGameId: string | null;
  hostPlayerId: string;
}

/** Public player info (safe to show on display) */
export interface PublicPlayerState {
  id: string;
  name: string;
  color: string;
  status: PlayerStatus;
  isHost: boolean;
}

/** Room creation response */
export interface CreateRoomResponse {
  roomId: string;
  code: string;
  qrDataUrl: string;      // Base64 data URL of QR code
}

/** Room info response (for join page) */
export interface RoomInfoResponse {
  code: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  hostName: string;
}

/** Join response sent after successful WebSocket join */
export interface JoinResult {
  sessionId: string;
  playerId: string;
  reconnectToken: string;
  room: PublicRoomState;
}
```

### Step 2.7: packages/shared/src/types/game.ts

```ts
import { GameId, PhaseType, InputType } from '../enums.js';

/** Game definition metadata (for catalog display) */
export interface GameDefinition {
  id: GameId;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedMinutes: number;
  icon: string;            // emoji
}

/** Current phase state (sent to clients) */
export interface PhaseState {
  phaseType: PhaseType;
  roundNumber: number;
  totalRounds: number;
  timerRemainingMs: number | null;
  timerTotalMs: number | null;
}

/** Player input submitted from phone */
export interface PlayerInput {
  inputType: InputType;
  payload: Record<string, unknown>;
}

/** Score entry for a player */
export interface ScoreEntry {
  playerId: string;
  playerName: string;
  playerColor: string;
  score: number;
  roundScore: number;    // Points earned this round
}

/** Game over state */
export interface GameOverState {
  winnerId: string | null;     // null for team win
  winnerName: string | null;
  winnerTeam: string | null;   // For team-based games
  finalScores: ScoreEntry[];
  gameId: GameId;
}

/** Available game catalog entry */
export const GAME_CATALOG: GameDefinition[] = [
  {
    id: GameId.BLUFF_BATTLE,
    name: 'Bluff Battle',
    description: 'Submit fake answers, fool your friends, spot the truth. The best liars win!',
    minPlayers: 3,
    maxPlayers: 8,
    estimatedMinutes: 10,
    icon: '🎭',
  },
  {
    id: GameId.VILLAGE_OF_SHADOWS,
    name: 'Village of Shadows',
    description: 'Hidden roles. Secret actions. Trust no one. Will the village survive the night?',
    minPlayers: 5,
    maxPlayers: 10,
    estimatedMinutes: 15,
    icon: '🐺',
  },
];
```

### Step 2.8: packages/shared/src/types/messages.ts

```ts
import {
  ClientMessageType,
  ServerMessageType,
  GameId,
  InputType,
} from '../enums.js';
import { PublicRoomState, JoinResult } from './room.js';
import { PhaseState, ScoreEntry, GameOverState } from './game.js';

// ============================================================
// CLIENT → SERVER MESSAGES
// ============================================================

export interface JoinRoomMessage {
  type: ClientMessageType.JOIN_ROOM;
  roomCode: string;
  playerName: string;
  preferredColor: string | null;
}

export interface RejoinMessage {
  type: ClientMessageType.REJOIN;
  sessionId: string;
  reconnectToken: string;
}

export interface JoinDisplayMessage {
  type: ClientMessageType.JOIN_DISPLAY;
  roomId: string;
}

export interface SelectGameMessage {
  type: ClientMessageType.SELECT_GAME;
  gameId: GameId;
}

export interface StartGameMessage {
  type: ClientMessageType.START_GAME;
}

export interface SubmitInputMessage {
  type: ClientMessageType.SUBMIT_INPUT;
  inputType: InputType;
  payload: Record<string, unknown>;
}

export interface KickPlayerMessage {
  type: ClientMessageType.KICK_PLAYER;
  playerId: string;
}

export interface ReturnToLobbyMessage {
  type: ClientMessageType.RETURN_TO_LOBBY;
}

export interface CloseRoomMessage {
  type: ClientMessageType.CLOSE_ROOM;
}

export interface PingMessage {
  type: ClientMessageType.PING;
  timestamp: number;
}

/** Union of all client messages */
export type ClientMessage =
  | JoinRoomMessage
  | RejoinMessage
  | JoinDisplayMessage
  | SelectGameMessage
  | StartGameMessage
  | SubmitInputMessage
  | KickPlayerMessage
  | ReturnToLobbyMessage
  | CloseRoomMessage
  | PingMessage;

// ============================================================
// SERVER → CLIENT MESSAGES
// ============================================================

export interface RoomStateMessage {
  type: ServerMessageType.ROOM_STATE;
  room: PublicRoomState;
  phase: PhaseState | null;
  gamePublicState: Record<string, unknown> | null;
}

export interface PlayerJoinedMessage {
  type: ServerMessageType.PLAYER_JOINED;
  playerId: string;
  playerName: string;
  playerColor: string;
  playerCount: number;
}

export interface PlayerLeftMessage {
  type: ServerMessageType.PLAYER_LEFT;
  playerId: string;
  playerName: string;
  playerCount: number;
}

export interface PlayerKickedMessage {
  type: ServerMessageType.PLAYER_KICKED;
  playerId: string;
  playerName: string;
}

export interface GameSelectedMessage {
  type: ServerMessageType.GAME_SELECTED;
  gameId: GameId;
  gameName: string;
}

export interface GameStartedMessage {
  type: ServerMessageType.GAME_STARTED;
  gameId: GameId;
  phase: PhaseState;
  gamePublicState: Record<string, unknown>;
}

export interface PhaseChangedMessage {
  type: ServerMessageType.PHASE_CHANGED;
  phase: PhaseState;
  gamePublicState: Record<string, unknown>;
}

export interface TimerTickMessage {
  type: ServerMessageType.TIMER_TICK;
  remainingMs: number;
}

export interface TimerExpiredMessage {
  type: ServerMessageType.TIMER_EXPIRED;
  phaseType: string;
}

export interface InputAcceptedMessage {
  type: ServerMessageType.INPUT_ACCEPTED;
  inputType: InputType;
}

export interface InputRejectedMessage {
  type: ServerMessageType.INPUT_REJECTED;
  inputType: InputType;
  reason: string;
}

export interface PrivateStateMessage {
  type: ServerMessageType.PRIVATE_STATE;
  state: Record<string, unknown>;
}

export interface ScoreUpdateMessage {
  type: ServerMessageType.SCORE_UPDATE;
  scores: ScoreEntry[];
}

export interface GameOverMessage {
  type: ServerMessageType.GAME_OVER;
  result: GameOverState;
}

export interface RoomClosedMessage {
  type: ServerMessageType.ROOM_CLOSED;
  reason: string;
}

export interface ErrorMessage {
  type: ServerMessageType.ERROR;
  code: string;
  message: string;
}

export interface PongMessage {
  type: ServerMessageType.PONG;
  timestamp: number;
  serverTime: number;
}

export interface JoinedMessage {
  type: ServerMessageType.JOINED;
  result: JoinResult;
}

/** Union of all server messages */
export type ServerMessage =
  | RoomStateMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerKickedMessage
  | GameSelectedMessage
  | GameStartedMessage
  | PhaseChangedMessage
  | TimerTickMessage
  | TimerExpiredMessage
  | InputAcceptedMessage
  | InputRejectedMessage
  | PrivateStateMessage
  | ScoreUpdateMessage
  | GameOverMessage
  | RoomClosedMessage
  | ErrorMessage
  | PongMessage
  | JoinedMessage;
```

### Step 2.9: packages/shared/src/types/bluff-battle.ts

```ts
// ============================================================
// BLUFF BATTLE — Game-specific types
// ============================================================

/** A single prompt/question */
export interface BBPrompt {
  id: number;
  question: string;
  correctAnswer: string;
}

/** An answer option shown during voting (includes real + fakes) */
export interface BBAnswerOption {
  answerId: string;         // nanoid
  text: string;
  isCorrect?: boolean;      // Only revealed after voting
  submittedBy?: string;     // PlayerId, only revealed after voting
}

/** Public game state for display (what the TV shows) */
export interface BBPublicState {
  gameId: 'bluff_battle';
  currentPrompt: string | null;
  roundNumber: number;
  totalRounds: number;
  /** Available answers (during voting phase, no metadata) */
  answers: BBAnswerOption[];
  /** Submission count (during submit phase) */
  submittedCount: number;
  totalPlayers: number;
  /** Votes received count (during voting phase) */
  votedCount: number;
  /** Reveal data (during reveal phase) */
  revealData: BBRevealData | null;
}

/** Reveal data shown after voting */
export interface BBRevealData {
  correctAnswerId: string;
  answers: BBRevealAnswer[];
  roundScores: BBRoundScore[];
}

/** A revealed answer with metadata */
export interface BBRevealAnswer {
  answerId: string;
  text: string;
  isCorrect: boolean;
  submittedByPlayerId: string | null; // null for correct answer
  submittedByPlayerName: string | null;
  voterPlayerIds: string[];
  voterPlayerNames: string[];
}

/** Round score for one player */
export interface BBRoundScore {
  playerId: string;
  playerName: string;
  fooledCount: number;       // How many players voted for their fake
  foundCorrect: boolean;     // Did they vote for the real answer
  roundPoints: number;
  totalPoints: number;
}

/** Private state sent to individual player phones */
export interface BBPrivateState {
  gameId: 'bluff_battle';
  /** Current prompt (during submit phase) */
  prompt: string | null;
  /** Whether this player has submitted */
  hasSubmitted: boolean;
  /** Whether this player has voted */
  hasVoted: boolean;
  /** Their own answer (so they can see it) */
  ownAnswer: string | null;
  /** Answer options for voting (excludes their own) */
  voteOptions: BBAnswerOption[] | null;
}
```

### Step 2.10: packages/shared/src/types/village.ts

```ts
import { VillageRole } from '../enums.js';

// ============================================================
// VILLAGE OF SHADOWS — Game-specific types
// ============================================================

/** A player's role assignment */
export interface VillagePlayerRole {
  playerId: string;
  role: VillageRole;
  isAlive: boolean;
}

/** Public game state for display (what the TV shows) */
export interface VillagePublicState {
  gameId: 'village_of_shadows';
  dayNumber: number;
  /** Player statuses (alive/dead, but NOT their roles) */
  players: VillagePublicPlayer[];
  /** Last night's result message (e.g., "No one was killed" or "PlayerX was killed") */
  nightResultMessage: string | null;
  /** Last vote result */
  voteResultMessage: string | null;
  /** Eliminated player this round */
  eliminatedPlayerId: string | null;
  eliminatedPlayerName: string | null;
  eliminatedPlayerRole: VillageRole | null; // Revealed on elimination
  /** Vote tally (during/after vote phase) */
  votes: VillageVoteTally[] | null;
  /** Win state */
  winningTeam: 'villagers' | 'werewolves' | null;
  /** Night action submission counts (no details) */
  nightActionsSubmitted: number;
  nightActionsExpected: number;
}

/** Public player info (no role info!) */
export interface VillagePublicPlayer {
  playerId: string;
  playerName: string;
  playerColor: string;
  isAlive: boolean;
}

/** Vote tally entry */
export interface VillageVoteTally {
  targetPlayerId: string;
  targetPlayerName: string;
  voteCount: number;
  voterNames: string[];    // Revealed after vote
}

/** Private state sent to individual player */
export interface VillagePrivateState {
  gameId: 'village_of_shadows';
  role: VillageRole;
  isAlive: boolean;
  /** Seer: result of last inspection */
  seerResult: SeerInspectionResult | null;
  /** Whether this player has submitted their night action */
  hasActed: boolean;
  /** Whether this player has voted (day vote) */
  hasVoted: boolean;
  /** Werewolf: other werewolf player IDs (so they know teammates) */
  werewolfTeammates: string[];
  /** Night action targets (alive players they can target) */
  nightTargets: VillageNightTarget[] | null;
  /** Vote targets (alive players they can vote for) */
  voteTargets: VillageVoteTarget[] | null;
}

/** Seer inspection result */
export interface SeerInspectionResult {
  targetPlayerId: string;
  targetPlayerName: string;
  isWerewolf: boolean;
}

/** A potential night action target */
export interface VillageNightTarget {
  playerId: string;
  playerName: string;
}

/** A potential vote target */
export interface VillageVoteTarget {
  playerId: string;
  playerName: string;
}

/** Night resolution (internal server type, NOT sent to clients) */
export interface NightResolution {
  werewolfTargetId: string | null;
  seerTargetId: string | null;
  doctorTargetId: string | null;
  killedPlayerId: string | null;  // null if doctor saved
  killedPlayerName: string | null;
  seerResult: SeerInspectionResult | null;
}

/** Role distribution rules */
export interface RoleDistribution {
  playerCount: number;
  werewolves: number;
  seers: number;
  doctors: number;
  villagers: number;
}

/**
 * Role distribution table
 * Key: player count, Value: role counts
 */
export const ROLE_DISTRIBUTIONS: Record<number, RoleDistribution> = {
  5:  { playerCount: 5,  werewolves: 1, seers: 1, doctors: 1, villagers: 2 },
  6:  { playerCount: 6,  werewolves: 1, seers: 1, doctors: 1, villagers: 3 },
  7:  { playerCount: 7,  werewolves: 2, seers: 1, doctors: 1, villagers: 3 },
  8:  { playerCount: 8,  werewolves: 2, seers: 1, doctors: 1, villagers: 4 },
  9:  { playerCount: 9,  werewolves: 2, seers: 1, doctors: 1, villagers: 5 },
  10: { playerCount: 10, werewolves: 3, seers: 1, doctors: 1, villagers: 5 },
};
```

### Step 2.11: packages/shared/src/validation.ts

```ts
import { z } from 'zod';
import {
  MIN_PLAYER_NAME_LENGTH,
  MAX_PLAYER_NAME_LENGTH,
  ROOM_CODE_LENGTH,
  BB_MAX_ANSWER_LENGTH,
} from './constants.js';
import { InputType, ClientMessageType, GameId } from './enums.js';

/** Validate player name */
export const playerNameSchema = z
  .string()
  .min(MIN_PLAYER_NAME_LENGTH)
  .max(MAX_PLAYER_NAME_LENGTH)
  .trim();

/** Validate room code */
export const roomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .toUpperCase();

/** Validate Bluff Battle text submission */
export const bbSubmitSchema = z.object({
  inputType: z.literal(InputType.TEXT),
  payload: z.object({
    answer: z.string().min(1).max(BB_MAX_ANSWER_LENGTH).trim(),
  }),
});

/** Validate vote submission */
export const voteSchema = z.object({
  inputType: z.literal(InputType.VOTE),
  payload: z.object({
    answerId: z.string().min(1), // BB: answerId, VOS: playerId
  }),
});

/** Validate night action submission */
export const nightActionSchema = z.object({
  inputType: z.literal(InputType.NIGHT_ACTION),
  payload: z.object({
    targetPlayerId: z.string().min(1),
  }),
});

/** Validate confirm submission */
export const confirmSchema = z.object({
  inputType: z.literal(InputType.CONFIRM),
  payload: z.object({}),
});

/** Validate any player input */
export const playerInputSchema = z.discriminatedUnion('inputType', [
  bbSubmitSchema,
  voteSchema,
  nightActionSchema,
  confirmSchema,
]);

/** Client message validation schemas */
export const joinRoomSchema = z.object({
  type: z.literal(ClientMessageType.JOIN_ROOM),
  roomCode: roomCodeSchema,
  playerName: playerNameSchema,
  preferredColor: z.string().nullable(),
});

export const rejoinSchema = z.object({
  type: z.literal(ClientMessageType.REJOIN),
  sessionId: z.string().min(1),
  reconnectToken: z.string().min(1),
});

export const joinDisplaySchema = z.object({
  type: z.literal(ClientMessageType.JOIN_DISPLAY),
  roomId: z.string().min(1),
});

export const selectGameSchema = z.object({
  type: z.literal(ClientMessageType.SELECT_GAME),
  gameId: z.nativeEnum(GameId),
});

export const submitInputSchema = z.object({
  type: z.literal(ClientMessageType.SUBMIT_INPUT),
  inputType: z.nativeEnum(InputType),
  payload: z.record(z.unknown()),
});
```

### Step 2.12: packages/shared/src/index.ts

```ts
// Re-export everything
export * from './enums.js';
export * from './constants.js';
export * from './types/room.js';
export * from './types/game.js';
export * from './types/messages.js';
export * from './types/bluff-battle.js';
export * from './types/village.js';
export * from './validation.js';
```

---

## 6. PHASE 3: GAME SERVER

### Step 3.1: server/package.json

```json
{
  "name": "@boredless/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup",
    "start": "node dist/index.js",
    "test": "vitest"
  },
  "dependencies": {
    "@boredless/shared": "*",
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/websocket": "^11.0.0",
    "ws": "^8.18.0",
    "nanoid": "^5.0.0",
    "qrcode": "^1.5.4"
  },
  "devDependencies": {
    "@types/ws": "^8.5.0",
    "tsx": "^4.19.0",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

### Step 3.2: server/tsconfig.json

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

### Step 3.3: server/tsup.config.ts

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
});
```

### Step 3.4: server/src/config.ts

```ts
import { DEFAULT_PORT, CORS_ORIGINS } from '@boredless/shared';

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  baseUrl: string; // For QR code generation
}

export function getConfig(): ServerConfig {
  const port = parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.HOST ?? '0.0.0.0';
  const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : [...CORS_ORIGINS, baseUrl];

  return { port, host, corsOrigins, baseUrl };
}
```

### Step 3.5: server/src/utils/id.ts

```ts
import { nanoid } from 'nanoid';

/** Generate a unique ID (21 chars) */
export function generateId(): string {
  return nanoid();
}

/** Generate a short ID (10 chars) for reconnect tokens */
export function generateToken(): string {
  return nanoid(10);
}
```

### Step 3.6: server/src/utils/code.ts

```ts
import { ROOM_CODE_LENGTH, ROOM_CODE_CHARS } from '@boredless/shared';

/** Generate a random room code (4 uppercase chars/digits, no ambiguous chars) */
export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}
```

### Step 3.7: server/src/utils/logger.ts

```ts
/** Simple structured logger */
export const logger = {
  info(msg: string, data?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'info', msg, ...data, ts: Date.now() }));
  },
  warn(msg: string, data?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: 'warn', msg, ...data, ts: Date.now() }));
  },
  error(msg: string, data?: Record<string, unknown>) {
    console.error(JSON.stringify({ level: 'error', msg, ...data, ts: Date.now() }));
  },
};
```

### Step 3.8: server/src/ws/registry.ts

This manages the mapping between sessions and WebSocket connections.

```ts
import type { WebSocket } from 'ws';

/**
 * SessionRegistry maps session IDs to WebSocket connections.
 * This is the ONLY place that knows which socket belongs to which session.
 */
class SessionRegistry {
  /** sessionId → WebSocket */
  private sessions = new Map<string, WebSocket>();
  /** WebSocket → sessionId (reverse lookup) */
  private sockets = new Map<WebSocket, string>();

  /** Register a session-to-socket mapping */
  register(sessionId: string, ws: WebSocket): void {
    // Clean up old socket if session already had one
    const oldWs = this.sessions.get(sessionId);
    if (oldWs && oldWs !== ws) {
      this.sockets.delete(oldWs);
      if (oldWs.readyState === oldWs.OPEN) {
        oldWs.close();
      }
    }
    this.sessions.set(sessionId, ws);
    this.sockets.set(ws, sessionId);
  }

  /** Remove a session */
  unregister(ws: WebSocket): string | undefined {
    const sessionId = this.sockets.get(ws);
    if (sessionId) {
      this.sessions.delete(sessionId);
      this.sockets.delete(ws);
    }
    return sessionId;
  }

  /** Get socket for session */
  getSocket(sessionId: string): WebSocket | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get session ID for socket */
  getSessionId(ws: WebSocket): string | undefined {
    return this.sockets.get(ws);
  }

  /** Check if session has active connection */
  isConnected(sessionId: string): boolean {
    const ws = this.sessions.get(sessionId);
    return ws !== undefined && ws.readyState === ws.OPEN;
  }
}

export const sessionRegistry = new SessionRegistry();
```

### Step 3.9: server/src/ws/send.ts

```ts
import type { WebSocket } from 'ws';
import type { ServerMessage } from '@boredless/shared';
import { sessionRegistry } from './registry.js';
import { logger } from '../utils/logger.js';

/** Send a message to a specific session */
export function sendToSession(sessionId: string, message: ServerMessage): void {
  const ws = sessionRegistry.getSocket(sessionId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** Send a message to multiple sessions */
export function sendToSessions(sessionIds: string[], message: ServerMessage): void {
  const data = JSON.stringify(message);
  for (const sessionId of sessionIds) {
    const ws = sessionRegistry.getSocket(sessionId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

/** Send a message to a raw WebSocket (before session is established) */
export function sendToSocket(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** Send an error to a raw WebSocket */
export function sendError(ws: WebSocket, code: string, message: string): void {
  sendToSocket(ws, {
    type: 'error' as any,
    code,
    message,
  });
}
```

### Step 3.10: server/src/engine/room-manager.ts

This is the core room lifecycle manager. It owns ALL room state.

```ts
import type { Room, Player, Session } from '@boredless/shared';
import {
  RoomStatus,
  PlayerStatus,
  DeviceType,
  ServerMessageType,
  MAX_PLAYERS_PER_ROOM,
  PLAYER_COLORS,
  RECONNECT_GRACE_PERIOD_MS,
  ROOM_INACTIVITY_TIMEOUT_MS,
} from '@boredless/shared';
import { generateId, generateToken } from '../utils/id.js';
import { generateRoomCode } from '../utils/code.js';
import { sessionRegistry } from '../ws/registry.js';
import { sendToSession, sendToSessions } from '../ws/send.js';
import { logger } from '../utils/logger.js';
import QRCode from 'qrcode';
import type { ServerConfig } from '../config.js';

class RoomManager {
  /** roomId → Room */
  private rooms = new Map<string, Room>();
  /** roomCode → roomId */
  private codeToRoom = new Map<string, string>();
  /** sessionId → Session */
  private sessions = new Map<string, Session>();
  /** roomId → game state (opaque, managed by game modules) */
  private gameStates = new Map<string, unknown>();
  /** Cleanup interval */
  private cleanupInterval: NodeJS.Timeout | null = null;

  private config: ServerConfig | null = null;

  init(config: ServerConfig) {
    this.config = config;
    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  /** Create a new room. Returns room ID, code, and QR data URL. */
  async createRoom(): Promise<{ roomId: string; code: string; qrDataUrl: string }> {
    // Generate unique code
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.codeToRoom.has(code));

    const roomId = generateId();
    const now = Date.now();

    const room: Room = {
      id: roomId,
      code,
      status: RoomStatus.WAITING_FOR_PLAYERS,
      hostPlayerId: '', // Set when first player joins
      displaySessionId: null,
      players: [],
      selectedGameId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.rooms.set(roomId, room);
    this.codeToRoom.set(code, roomId);

    // Generate QR code
    const joinUrl = `${this.config!.baseUrl}/join/${code}`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    logger.info('Room created', { roomId, code });
    return { roomId, code, qrDataUrl };
  }

  /** Register a display session for a room */
  registerDisplay(roomId: string): Session | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const session: Session = {
      id: generateId(),
      roomId,
      deviceType: DeviceType.DISPLAY,
      playerId: null,
      reconnectToken: generateToken(),
      connected: true,
      lastSeenAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    room.displaySessionId = session.id;

    // If room was waiting, move to lobby
    if (room.status === RoomStatus.WAITING_FOR_PLAYERS) {
      room.status = RoomStatus.IN_LOBBY;
    }

    room.updatedAt = Date.now();
    logger.info('Display registered', { roomId, sessionId: session.id });
    return session;
  }

  /** Add a player to a room */
  joinRoom(
    roomCode: string,
    playerName: string,
    preferredColor: string | null,
  ): { session: Session; player: Player; room: Room } | { error: string } {
    const roomId = this.codeToRoom.get(roomCode.toUpperCase());
    if (!roomId) return { error: 'Room not found' };

    const room = this.rooms.get(roomId)!;

    // Check room status
    if (room.status === RoomStatus.CLOSED) {
      return { error: 'Room is closed' };
    }
    if (room.status === RoomStatus.IN_GAME) {
      return { error: 'Game already in progress' };
    }

    // Check player count
    const activePlayers = room.players.filter(p => p.status !== PlayerStatus.REMOVED);
    if (activePlayers.length >= MAX_PLAYERS_PER_ROOM) {
      return { error: 'Room is full' };
    }

    // Assign color
    const usedColors = new Set(activePlayers.map(p => p.color));
    let color = preferredColor && !usedColors.has(preferredColor)
      ? preferredColor
      : PLAYER_COLORS.find(c => !usedColors.has(c)) ?? PLAYER_COLORS[0];

    const playerId = generateId();
    const sessionId = generateId();
    const now = Date.now();

    const player: Player = {
      id: playerId,
      name: playerName,
      color,
      status: PlayerStatus.CONNECTED,
      isHost: room.players.length === 0, // First player is host
      sessionId,
      joinedAt: now,
      disconnectedAt: null,
    };

    const session: Session = {
      id: sessionId,
      roomId,
      deviceType: DeviceType.PHONE,
      playerId,
      reconnectToken: generateToken(),
      connected: true,
      lastSeenAt: now,
    };

    room.players.push(player);
    this.sessions.set(sessionId, session);

    if (!room.hostPlayerId) {
      room.hostPlayerId = playerId;
    }

    // Ensure room is in lobby status
    if (room.status === RoomStatus.WAITING_FOR_PLAYERS) {
      room.status = RoomStatus.IN_LOBBY;
    }

    room.updatedAt = now;

    // Notify display and other players
    const otherSessionIds = this.getPlayerSessionIds(room, playerId);
    if (room.displaySessionId) {
      otherSessionIds.push(room.displaySessionId);
    }

    sendToSessions(otherSessionIds, {
      type: ServerMessageType.PLAYER_JOINED,
      playerId,
      playerName,
      playerColor: color,
      playerCount: activePlayers.length + 1,
    });

    logger.info('Player joined', { roomId, playerId, playerName });
    return { session, player, room };
  }

  /** Handle player disconnect */
  handleDisconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.connected = false;
    const room = this.rooms.get(session.roomId);
    if (!room) return;

    if (session.deviceType === DeviceType.DISPLAY) {
      logger.info('Display disconnected', { roomId: room.id, sessionId });
      return;
    }

    const player = room.players.find(p => p.sessionId === sessionId);
    if (!player) return;

    player.status = PlayerStatus.DISCONNECTED;
    player.disconnectedAt = Date.now();

    // Notify others
    const otherSessionIds = this.getPlayerSessionIds(room, player.id);
    if (room.displaySessionId) {
      otherSessionIds.push(room.displaySessionId);
    }

    sendToSessions(otherSessionIds, {
      type: ServerMessageType.PLAYER_LEFT,
      playerId: player.id,
      playerName: player.name,
      playerCount: room.players.filter(p => p.status === PlayerStatus.CONNECTED).length,
    });

    room.updatedAt = Date.now();
    logger.info('Player disconnected', { roomId: room.id, playerId: player.id });
  }

  /** Handle player reconnect */
  rejoin(
    sessionId: string,
    reconnectToken: string,
  ): { session: Session; player: Player; room: Room } | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: 'Session not found' };
    if (session.reconnectToken !== reconnectToken) return { error: 'Invalid token' };

    const room = this.rooms.get(session.roomId);
    if (!room) return { error: 'Room no longer exists' };

    // Check grace period
    const player = room.players.find(p => p.sessionId === sessionId);
    if (!player) return { error: 'Player not found' };

    if (player.disconnectedAt) {
      const elapsed = Date.now() - player.disconnectedAt;
      if (elapsed > RECONNECT_GRACE_PERIOD_MS) {
        return { error: 'Reconnect grace period expired' };
      }
    }

    // Restore connection
    session.connected = true;
    session.lastSeenAt = Date.now();
    player.status = PlayerStatus.CONNECTED;
    player.disconnectedAt = null;

    // Notify others
    const otherSessionIds = this.getPlayerSessionIds(room, player.id);
    if (room.displaySessionId) {
      otherSessionIds.push(room.displaySessionId);
    }

    sendToSessions(otherSessionIds, {
      type: ServerMessageType.PLAYER_JOINED,
      playerId: player.id,
      playerName: player.name,
      playerColor: player.color,
      playerCount: room.players.filter(p => p.status === PlayerStatus.CONNECTED).length,
    });

    room.updatedAt = Date.now();
    logger.info('Player reconnected', { roomId: room.id, playerId: player.id });
    return { session, player, room };
  }

  /** Kick a player (host only) */
  kickPlayer(roomId: string, requestingPlayerId: string, targetPlayerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostPlayerId !== requestingPlayerId) return false;

    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return false;

    target.status = PlayerStatus.REMOVED;

    // Close their WebSocket
    const ws = sessionRegistry.getSocket(target.sessionId);
    if (ws) {
      sendToSession(target.sessionId, {
        type: ServerMessageType.PLAYER_KICKED,
        playerId: target.id,
        playerName: target.name,
      });
      ws.close(4001, 'Kicked by host');
    }

    // Notify others
    const allSessionIds = this.getAllSessionIds(room);
    sendToSessions(allSessionIds, {
      type: ServerMessageType.PLAYER_KICKED,
      playerId: target.id,
      playerName: target.name,
    });

    room.updatedAt = Date.now();
    return true;
  }

  /** Select a game */
  selectGame(roomId: string, requestingPlayerId: string, gameId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostPlayerId !== requestingPlayerId) return false;
    if (room.status !== RoomStatus.IN_LOBBY) return false;

    room.selectedGameId = gameId;
    room.updatedAt = Date.now();

    // Notify all
    const allSessionIds = this.getAllSessionIds(room);
    sendToSessions(allSessionIds, {
      type: ServerMessageType.GAME_SELECTED,
      gameId: gameId as any,
      gameName: gameId, // Game registry will provide proper name
    });

    return true;
  }

  /** Close a room */
  closeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.status = RoomStatus.CLOSED;

    const allSessionIds = this.getAllSessionIds(room);
    sendToSessions(allSessionIds, {
      type: ServerMessageType.ROOM_CLOSED,
      reason: 'Room closed by host',
    });

    // Clean up
    this.codeToRoom.delete(room.code);
    this.rooms.delete(roomId);
    this.gameStates.delete(roomId);

    for (const player of room.players) {
      this.sessions.delete(player.sessionId);
    }
    if (room.displaySessionId) {
      this.sessions.delete(room.displaySessionId);
    }

    logger.info('Room closed', { roomId });
  }

  /** Return to lobby */
  returnToLobby(roomId: string, requestingPlayerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.hostPlayerId !== requestingPlayerId) return false;

    room.status = RoomStatus.IN_LOBBY;
    room.selectedGameId = null;
    this.gameStates.delete(roomId);
    room.updatedAt = Date.now();

    // Broadcast full state
    this.broadcastRoomState(roomId);
    return true;
  }

  // === Getters ===

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByCode(code: string): Room | undefined {
    const roomId = this.codeToRoom.get(code.toUpperCase());
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getPlayerBySessionId(sessionId: string): Player | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const room = this.rooms.get(session.roomId);
    if (!room) return undefined;
    return room.players.find(p => p.sessionId === sessionId);
  }

  /** Get game state for a room */
  getGameState<T>(roomId: string): T | undefined {
    return this.gameStates.get(roomId) as T | undefined;
  }

  /** Set game state for a room */
  setGameState(roomId: string, state: unknown): void {
    this.gameStates.set(roomId, state);
  }

  /** Update room status */
  setRoomStatus(roomId: string, status: RoomStatus): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.status = status;
      room.updatedAt = Date.now();
    }
  }

  /** Get active (non-removed) players in a room */
  getActivePlayers(roomId: string): Player[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.players.filter(p => p.status !== PlayerStatus.REMOVED);
  }

  /** Get connected players in a room */
  getConnectedPlayers(roomId: string): Player[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return room.players.filter(p => p.status === PlayerStatus.CONNECTED);
  }

  /** Broadcast full room state to all sessions in a room */
  broadcastRoomState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const publicRoom = this.getPublicRoomState(room);
    const message = {
      type: ServerMessageType.ROOM_STATE as const,
      room: publicRoom,
      phase: null,
      gamePublicState: null,
    };

    const allSessionIds = this.getAllSessionIds(room);
    sendToSessions(allSessionIds, message);
  }

  /** Get public room state (safe for display) */
  getPublicRoomState(room: Room) {
    return {
      code: room.code,
      status: room.status,
      players: room.players
        .filter(p => p.status !== PlayerStatus.REMOVED)
        .map(p => ({
          id: p.id,
          name: p.name,
          color: p.color,
          status: p.status,
          isHost: p.isHost,
        })),
      selectedGameId: room.selectedGameId,
      hostPlayerId: room.hostPlayerId,
    };
  }

  // === Private helpers ===

  private getPlayerSessionIds(room: Room, excludePlayerId?: string): string[] {
    return room.players
      .filter(p => p.status === PlayerStatus.CONNECTED && p.id !== excludePlayerId)
      .map(p => p.sessionId);
  }

  private getAllSessionIds(room: Room): string[] {
    const ids = room.players
      .filter(p => p.status !== PlayerStatus.REMOVED)
      .map(p => p.sessionId);
    if (room.displaySessionId) {
      ids.push(room.displaySessionId);
    }
    return ids;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [roomId, room] of this.rooms) {
      // Check for inactive rooms
      if (now - room.updatedAt > ROOM_INACTIVITY_TIMEOUT_MS) {
        logger.info('Cleaning up inactive room', { roomId });
        this.closeRoom(roomId);
        continue;
      }

      // Check for expired disconnected players
      for (const player of room.players) {
        if (
          player.status === PlayerStatus.DISCONNECTED &&
          player.disconnectedAt &&
          now - player.disconnectedAt > RECONNECT_GRACE_PERIOD_MS
        ) {
          player.status = PlayerStatus.REMOVED;
          logger.info('Removed expired player', { roomId, playerId: player.id });
        }
      }
    }
  }
}

export const roomManager = new RoomManager();
```

### Step 3.11: server/src/engine/timer-engine.ts

```ts
import { TIMER_TICK_INTERVAL_MS, ServerMessageType } from '@boredless/shared';
import { sendToSessions } from '../ws/send.js';

export interface ActiveTimer {
  roomId: string;
  phaseType: string;
  durationMs: number;
  startedAt: number;
  interval: NodeJS.Timeout;
  onExpire: () => void;
}

class TimerEngine {
  /** roomId → ActiveTimer */
  private timers = new Map<string, ActiveTimer>();

  /** Start a timer for a room's current phase */
  start(
    roomId: string,
    phaseType: string,
    durationMs: number,
    sessionIds: string[],
    onExpire: () => void,
  ): void {
    // Clear any existing timer for this room
    this.stop(roomId);

    const startedAt = Date.now();
    const endAt = startedAt + durationMs;

    const interval = setInterval(() => {
      const remaining = Math.max(0, endAt - Date.now());

      // Send tick to all sessions
      sendToSessions(sessionIds, {
        type: ServerMessageType.TIMER_TICK,
        remainingMs: remaining,
      });

      // Check expiration
      if (remaining <= 0) {
        this.stop(roomId);
        sendToSessions(sessionIds, {
          type: ServerMessageType.TIMER_EXPIRED,
          phaseType,
        });
        onExpire();
      }
    }, TIMER_TICK_INTERVAL_MS);

    this.timers.set(roomId, {
      roomId,
      phaseType,
      durationMs,
      startedAt,
      interval,
      onExpire,
    });
  }

  /** Stop and clear timer for a room */
  stop(roomId: string): void {
    const timer = this.timers.get(roomId);
    if (timer) {
      clearInterval(timer.interval);
      this.timers.delete(roomId);
    }
  }

  /** Get remaining time for a room */
  getRemaining(roomId: string): number | null {
    const timer = this.timers.get(roomId);
    if (!timer) return null;
    return Math.max(0, timer.durationMs - (Date.now() - timer.startedAt));
  }

  /** Stop all timers (for shutdown) */
  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer.interval);
    }
    this.timers.clear();
  }
}

export const timerEngine = new TimerEngine();
```

### Step 3.12: server/src/engine/score-engine.ts

```ts
import type { ScoreEntry } from '@boredless/shared';
import { ServerMessageType } from '@boredless/shared';
import { roomManager } from './room-manager.js';
import { sendToSessions } from '../ws/send.js';

class ScoreEngine {
  /** roomId → playerId → cumulative score */
  private scores = new Map<string, Map<string, number>>();

  /** Initialize scores for a room */
  init(roomId: string, playerIds: string[]): void {
    const scoreMap = new Map<string, number>();
    for (const id of playerIds) {
      scoreMap.set(id, 0);
    }
    this.scores.set(roomId, scoreMap);
  }

  /** Add points to a player */
  addPoints(roomId: string, playerId: string, points: number): void {
    const scoreMap = this.scores.get(roomId);
    if (!scoreMap) return;
    const current = scoreMap.get(playerId) ?? 0;
    scoreMap.set(playerId, current + points);
  }

  /** Get current score for a player */
  getScore(roomId: string, playerId: string): number {
    return this.scores.get(roomId)?.get(playerId) ?? 0;
  }

  /** Get all scores for a room, sorted descending */
  getScores(roomId: string): ScoreEntry[] {
    const scoreMap = this.scores.get(roomId);
    if (!scoreMap) return [];

    const room = roomManager.getRoom(roomId);
    if (!room) return [];

    const entries: ScoreEntry[] = [];
    for (const [playerId, score] of scoreMap) {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        entries.push({
          playerId,
          playerName: player.name,
          playerColor: player.color,
          score,
          roundScore: 0, // Set by game module
        });
      }
    }

    return entries.sort((a, b) => b.score - a.score);
  }

  /** Broadcast scores to all sessions in a room */
  broadcastScores(roomId: string, roundScores?: Map<string, number>): void {
    const scores = this.getScores(roomId);
    if (roundScores) {
      for (const entry of scores) {
        entry.roundScore = roundScores.get(entry.playerId) ?? 0;
      }
    }

    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const sessionIds = [
      ...room.players.filter(p => p.status !== 'removed').map(p => p.sessionId),
      ...(room.displaySessionId ? [room.displaySessionId] : []),
    ];

    sendToSessions(sessionIds, {
      type: ServerMessageType.SCORE_UPDATE,
      scores,
    });
  }

  /** Clear scores for a room */
  clear(roomId: string): void {
    this.scores.delete(roomId);
  }
}

export const scoreEngine = new ScoreEngine();
```

### Step 3.13: server/src/games/game-module.ts

This is the interface that ALL game modules must implement.

```ts
import type { Player, PhaseState, GameDefinition, InputType } from '@boredless/shared';

/**
 * GameModule interface.
 * Every game (Bluff Battle, Village of Shadows, etc.) implements this interface.
 * The engine calls these methods; the game module NEVER calls the engine directly.
 */
export interface GameModule {
  /** Game definition (metadata for catalog) */
  readonly definition: GameDefinition;

  /** Initialize game state for a room. Called when host starts game. */
  setup(roomId: string, players: Player[]): void;

  /** Get the current phase state */
  getPhaseState(roomId: string): PhaseState;

  /** Get public state visible on the shared display */
  getPublicState(roomId: string): Record<string, unknown>;

  /** Get private state for a specific player */
  getPrivateState(roomId: string, playerId: string): Record<string, unknown>;

  /**
   * Handle player input. Returns true if input was accepted.
   * The game module is responsible for advancing phases when appropriate.
   */
  handleInput(
    roomId: string,
    playerId: string,
    inputType: InputType,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string };

  /** Clean up game state for a room */
  teardown(roomId: string): void;
}
```

### Step 3.14: server/src/games/registry.ts

```ts
import type { GameModule } from './game-module.js';
import type { GameId } from '@boredless/shared';

class GameRegistry {
  private games = new Map<string, GameModule>();

  register(module: GameModule): void {
    this.games.set(module.definition.id, module);
  }

  get(gameId: string): GameModule | undefined {
    return this.games.get(gameId);
  }

  getAll(): GameModule[] {
    return Array.from(this.games.values());
  }
}

export const gameRegistry = new GameRegistry();
```

### Step 3.15: server/src/games/bluff-battle/prompts.ts

```ts
import type { BBPrompt } from '@boredless/shared';

/**
 * Bluff Battle prompt bank.
 * Each prompt has a question and a correct answer.
 * Players will submit FAKE answers to fool others.
 */
export const PROMPTS: BBPrompt[] = [
  { id: 1, question: "What is the world's smallest country by area?", correctAnswer: "Vatican City" },
  { id: 2, question: "What does the 'D' in D-Day stand for?", correctAnswer: "Day (it literally means Day-Day)" },
  { id: 3, question: "What animal can hold its breath the longest?", correctAnswer: "Cuvier's beaked whale (3+ hours)" },
  { id: 4, question: "What is the fear of long words called?", correctAnswer: "Hippopotomonstrosesquippedaliophobia" },
  { id: 5, question: "What color is a hippo's sweat?", correctAnswer: "Red/orange" },
  { id: 6, question: "How many hearts does an octopus have?", correctAnswer: "Three" },
  { id: 7, question: "What was the first toy advertised on television?", correctAnswer: "Mr. Potato Head" },
  { id: 8, question: "What is the longest word in English with no repeated letters?", correctAnswer: "Uncopyrightable" },
  { id: 9, question: "What fruit was originally called a 'Chinese gooseberry'?", correctAnswer: "Kiwi" },
  { id: 10, question: "How long is New Zealand's longest place name?", correctAnswer: "85 letters (Taumatawhakatangihangakoauauotamateaturipukakapikimaungahoronukupokaiwhenuakitanatahu)" },
  { id: 11, question: "What is the only planet that spins clockwise?", correctAnswer: "Venus" },
  { id: 12, question: "What was Google's original name?", correctAnswer: "BackRub" },
  { id: 13, question: "What is the national animal of Scotland?", correctAnswer: "Unicorn" },
  { id: 14, question: "How many noses does a slug have?", correctAnswer: "Four" },
  { id: 15, question: "What was the first item sold on eBay?", correctAnswer: "A broken laser pointer" },
  { id: 16, question: "What is a group of flamingos called?", correctAnswer: "A flamboyance" },
  { id: 17, question: "What percentage of the Earth's water is fresh water?", correctAnswer: "About 3%" },
  { id: 18, question: "What is the longest hiccuping spree recorded?", correctAnswer: "68 years (Charles Osborne)" },
  { id: 19, question: "What animal's fingerprints are virtually indistinguishable from humans?", correctAnswer: "Koala" },
  { id: 20, question: "What country has the most vending machines per capita?", correctAnswer: "Japan" },
  { id: 21, question: "What is the loudest animal on Earth?", correctAnswer: "Sperm whale (230 decibels)" },
  { id: 22, question: "How many bones does a shark have?", correctAnswer: "Zero (cartilage only)" },
  { id: 23, question: "What is the oldest known board game?", correctAnswer: "Senet (ancient Egypt, ~3100 BC)" },
  { id: 24, question: "What does 'OK' originally stand for?", correctAnswer: "Oll Korrect (a misspelling joke from 1839)" },
  { id: 25, question: "What is the most stolen food in the world?", correctAnswer: "Cheese" },
  { id: 26, question: "How long would it take to walk to the Moon?", correctAnswer: "About 9 years" },
  { id: 27, question: "What is the only letter that doesn't appear in any US state name?", correctAnswer: "Q" },
  { id: 28, question: "What was the first video uploaded to YouTube?", correctAnswer: "Me at the zoo" },
  { id: 29, question: "How many dimples does an average golf ball have?", correctAnswer: "336" },
  { id: 30, question: "What animal can sleep for three years straight?", correctAnswer: "Snail" },
  { id: 31, question: "What is the most common letter in the English language?", correctAnswer: "E" },
  { id: 32, question: "What body part never stops growing?", correctAnswer: "Nose and ears" },
  { id: 33, question: "What country eats the most chocolate per capita?", correctAnswer: "Switzerland" },
  { id: 34, question: "How fast does a sneeze travel?", correctAnswer: "About 100 mph" },
  { id: 35, question: "What is the smallest bone in the human body?", correctAnswer: "Stapes (in the ear)" },
  { id: 36, question: "What color are airplane black boxes actually?", correctAnswer: "Bright orange" },
  { id: 37, question: "How many taste buds does the average human have?", correctAnswer: "About 10,000" },
  { id: 38, question: "What animal has the longest pregnancy?", correctAnswer: "Elephant (22 months)" },
  { id: 39, question: "What is the rarest blood type?", correctAnswer: "AB negative" },
  { id: 40, question: "What was the shortest war in history?", correctAnswer: "Anglo-Zanzibar War (38-45 minutes)" },
  { id: 41, question: "What percentage of the ocean has been explored?", correctAnswer: "About 5%" },
  { id: 42, question: "What was the first message sent over the Internet?", correctAnswer: "LO (tried to send LOGIN but crashed after 2 letters)" },
  { id: 43, question: "What fruit floats in water because it is 25% air?", correctAnswer: "Apple" },
  { id: 44, question: "How many languages are written from right to left?", correctAnswer: "About 12" },
  { id: 45, question: "What is the most visited website in the world?", correctAnswer: "Google" },
  { id: 46, question: "What animal's eye is bigger than its brain?", correctAnswer: "Ostrich" },
  { id: 47, question: "What is the hottest planet in our solar system?", correctAnswer: "Venus (not Mercury)" },
  { id: 48, question: "How many muscles does a cat have in each ear?", correctAnswer: "32" },
  { id: 49, question: "What is the world record for most T-shirts worn at once?", correctAnswer: "260" },
  { id: 50, question: "What animal can see behind itself without turning its head?", correctAnswer: "Rabbit" },
  { id: 51, question: "What does the 'ZIP' in ZIP code stand for?", correctAnswer: "Zone Improvement Plan" },
  { id: 52, question: "How many possible combinations are there on a Rubik's Cube?", correctAnswer: "43 quintillion (43,252,003,274,489,856,000)" },
  { id: 53, question: "What country has more pyramids than Egypt?", correctAnswer: "Sudan" },
  { id: 54, question: "What is the most expensive spice in the world by weight?", correctAnswer: "Saffron" },
  { id: 55, question: "What percentage of your body weight is bacteria?", correctAnswer: "About 1-3%" },
];

/** Get N random prompts without repeats */
export function getRandomPrompts(count: number, exclude: number[] = []): BBPrompt[] {
  const available = PROMPTS.filter(p => !exclude.includes(p.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
```

### Step 3.16: server/src/games/bluff-battle/scoring.ts

```ts
import { BB_POINTS_CORRECT_ANSWER, BB_POINTS_FOOLED_PLAYER } from '@boredless/shared';

export interface BBVote {
  voterId: string;
  answerId: string;
}

export interface BBAnswer {
  answerId: string;
  text: string;
  submittedByPlayerId: string | null; // null = correct answer
  isCorrect: boolean;
}

export interface BBScoringResult {
  /** playerId → points earned this round */
  roundPoints: Map<string, number>;
  /** Per-answer reveal data */
  answerResults: {
    answerId: string;
    voterIds: string[];
    submittedByPlayerId: string | null;
    isCorrect: boolean;
  }[];
}

/**
 * Calculate scores for a Bluff Battle round.
 *
 * Scoring rules:
 * - Voting for the CORRECT answer: BB_POINTS_CORRECT_ANSWER (1000 pts)
 * - Each player fooled by YOUR fake answer: BB_POINTS_FOOLED_PLAYER (500 pts)
 * - Players cannot vote for their own fake answer (filtered at input time)
 */
export function calculateBBScores(
  answers: BBAnswer[],
  votes: BBVote[],
): BBScoringResult {
  const roundPoints = new Map<string, number>();
  const answerResults: BBScoringResult['answerResults'] = [];

  // Build vote map: answerId → voterIds
  const voteMap = new Map<string, string[]>();
  for (const vote of votes) {
    if (!voteMap.has(vote.answerId)) {
      voteMap.set(vote.answerId, []);
    }
    voteMap.get(vote.answerId)!.push(vote.voterId);
  }

  for (const answer of answers) {
    const voterIds = voteMap.get(answer.answerId) ?? [];

    answerResults.push({
      answerId: answer.answerId,
      voterIds,
      submittedByPlayerId: answer.submittedByPlayerId,
      isCorrect: answer.isCorrect,
    });

    if (answer.isCorrect) {
      // Award points to voters who found the correct answer
      for (const voterId of voterIds) {
        const current = roundPoints.get(voterId) ?? 0;
        roundPoints.set(voterId, current + BB_POINTS_CORRECT_ANSWER);
      }
    } else if (answer.submittedByPlayerId) {
      // Award points to the player who submitted this fake answer
      // for each voter they fooled
      const fooledCount = voterIds.length;
      if (fooledCount > 0) {
        const current = roundPoints.get(answer.submittedByPlayerId) ?? 0;
        roundPoints.set(
          answer.submittedByPlayerId,
          current + fooledCount * BB_POINTS_FOOLED_PLAYER,
        );
      }
    }
  }

  return { roundPoints, answerResults };
}
```

### Step 3.17: server/src/games/bluff-battle/index.ts

```ts
import type { GameModule } from '../game-module.js';
import type {
  Player,
  PhaseState,
  GameDefinition,
  BBPublicState,
  BBPrivateState,
  BBRevealData,
  BBRevealAnswer,
} from '@boredless/shared';
import {
  GameId,
  PhaseType,
  InputType,
  ServerMessageType,
  RoomStatus,
  BB_MIN_PLAYERS,
  BB_MAX_PLAYERS,
  BB_ROUNDS_DEFAULT,
  BB_SUBMIT_TIME_SECONDS,
  BB_VOTE_TIME_SECONDS,
  BB_REVEAL_TIME_SECONDS,
  BB_SCORES_TIME_SECONDS,
  BB_INSTRUCTIONS_TIME_SECONDS,
  GAME_CATALOG,
} from '@boredless/shared';
import { roomManager } from '../../engine/room-manager.js';
import { timerEngine } from '../../engine/timer-engine.js';
import { scoreEngine } from '../../engine/score-engine.js';
import { sendToSession, sendToSessions } from '../../ws/send.js';
import { generateId } from '../../utils/id.js';
import { logger } from '../../utils/logger.js';
import { getRandomPrompts, type PROMPTS } from './prompts.js';
import { calculateBBScores, type BBAnswer, type BBVote } from './scoring.js';

/** Internal game state (stored in roomManager.gameStates) */
interface BBGameState {
  roomId: string;
  players: Player[];
  totalRounds: number;
  currentRound: number;
  currentPhase: PhaseType;
  usedPromptIds: number[];

  // Current round state
  currentPrompt: { id: number; question: string; correctAnswer: string } | null;
  submissions: Map<string, string>;      // playerId → fake answer text
  answers: BBAnswer[];                   // Shuffled answers (fakes + correct)
  votes: BBVote[];                       // Player votes
  revealData: BBRevealData | null;
}

function getAllSessionIds(roomId: string): string[] {
  const room = roomManager.getRoom(roomId);
  if (!room) return [];
  const ids = room.players
    .filter(p => p.status !== 'removed')
    .map(p => p.sessionId);
  if (room.displaySessionId) ids.push(room.displaySessionId);
  return ids;
}

function getPlayerSessionIds(roomId: string): string[] {
  const room = roomManager.getRoom(roomId);
  if (!room) return [];
  return room.players
    .filter(p => p.status !== 'removed')
    .map(p => p.sessionId);
}

class BluffBattleModule implements GameModule {
  readonly definition: GameDefinition = GAME_CATALOG.find(g => g.id === GameId.BLUFF_BATTLE)!;

  private states = new Map<string, BBGameState>();

  setup(roomId: string, players: Player[]): void {
    const state: BBGameState = {
      roomId,
      players: [...players],
      totalRounds: BB_ROUNDS_DEFAULT,
      currentRound: 0,
      currentPhase: PhaseType.INSTRUCTIONS,
      usedPromptIds: [],
      currentPrompt: null,
      submissions: new Map(),
      answers: [],
      votes: [],
      revealData: null,
    };

    this.states.set(roomId, state);

    // Initialize scores
    scoreEngine.init(roomId, players.map(p => p.id));

    // Update room status
    roomManager.setRoomStatus(roomId, RoomStatus.IN_GAME);

    // Broadcast game started
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.GAME_STARTED,
      gameId: GameId.BLUFF_BATTLE,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send private state to each player
    for (const player of players) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start instructions timer
    timerEngine.start(
      roomId,
      PhaseType.INSTRUCTIONS,
      BB_INSTRUCTIONS_TIME_SECONDS * 1000,
      sessionIds,
      () => this.startRound(roomId),
    );
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) {
      return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 0, timerRemainingMs: null, timerTotalMs: null };
    }
    const remaining = timerEngine.getRemaining(roomId);
    let timerTotalMs: number | null = null;
    switch (state.currentPhase) {
      case PhaseType.BB_SUBMIT: timerTotalMs = BB_SUBMIT_TIME_SECONDS * 1000; break;
      case PhaseType.BB_VOTING: timerTotalMs = BB_VOTE_TIME_SECONDS * 1000; break;
      case PhaseType.BB_REVEAL: timerTotalMs = BB_REVEAL_TIME_SECONDS * 1000; break;
      case PhaseType.BB_SCORES: timerTotalMs = BB_SCORES_TIME_SECONDS * 1000; break;
      case PhaseType.INSTRUCTIONS: timerTotalMs = BB_INSTRUCTIONS_TIME_SECONDS * 1000; break;
    }
    return {
      phaseType: state.currentPhase,
      roundNumber: state.currentRound,
      totalRounds: state.totalRounds,
      timerRemainingMs: remaining,
      timerTotalMs,
    };
  }

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const publicState: BBPublicState = {
      gameId: 'bluff_battle',
      currentPrompt: state.currentPrompt?.question ?? null,
      roundNumber: state.currentRound,
      totalRounds: state.totalRounds,
      answers: state.currentPhase === PhaseType.BB_VOTING
        ? state.answers.map(a => ({ answerId: a.answerId, text: a.text }))
        : state.currentPhase === PhaseType.BB_REVEAL && state.revealData
        ? state.revealData.answers.map(a => ({
            answerId: a.answerId,
            text: a.text,
            isCorrect: a.isCorrect,
            submittedBy: a.submittedByPlayerId,
          }))
        : [],
      submittedCount: state.submissions.size,
      totalPlayers: state.players.length,
      votedCount: state.votes.length,
      revealData: state.revealData,
    };

    return publicState as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const privateState: BBPrivateState = {
      gameId: 'bluff_battle',
      prompt: state.currentPhase === PhaseType.BB_SUBMIT ? state.currentPrompt?.question ?? null : null,
      hasSubmitted: state.submissions.has(playerId),
      hasVoted: state.votes.some(v => v.voterId === playerId),
      ownAnswer: state.submissions.get(playerId) ?? null,
      voteOptions: state.currentPhase === PhaseType.BB_VOTING
        ? state.answers
            .filter(a => a.submittedByPlayerId !== playerId) // Can't vote for own answer
            .map(a => ({ answerId: a.answerId, text: a.text }))
        : null,
    };

    return privateState as unknown as Record<string, unknown>;
  }

  handleInput(
    roomId: string,
    playerId: string,
    inputType: InputType,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const state = this.states.get(roomId);
    if (!state) return { accepted: false, reason: 'Game not found' };

    switch (inputType) {
      case InputType.TEXT:
        return this.handleSubmission(state, playerId, payload);
      case InputType.VOTE:
        return this.handleVote(state, playerId, payload);
      default:
        return { accepted: false, reason: 'Invalid input type for current phase' };
    }
  }

  teardown(roomId: string): void {
    timerEngine.stop(roomId);
    scoreEngine.clear(roomId);
    this.states.delete(roomId);
  }

  // === Private methods ===

  private handleSubmission(
    state: BBGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== PhaseType.BB_SUBMIT) {
      return { accepted: false, reason: 'Not in submission phase' };
    }
    if (state.submissions.has(playerId)) {
      return { accepted: false, reason: 'Already submitted' };
    }

    const answer = String(payload.answer ?? '').trim();
    if (!answer) return { accepted: false, reason: 'Empty answer' };

    state.submissions.set(playerId, answer);

    // Broadcast updated submission count
    this.broadcastState(state.roomId);

    // Check if all players submitted
    if (state.submissions.size >= state.players.length) {
      this.startVoting(state.roomId);
    }

    return { accepted: true };
  }

  private handleVote(
    state: BBGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== PhaseType.BB_VOTING) {
      return { accepted: false, reason: 'Not in voting phase' };
    }
    if (state.votes.some(v => v.voterId === playerId)) {
      return { accepted: false, reason: 'Already voted' };
    }

    const answerId = String(payload.answerId ?? '');
    const answer = state.answers.find(a => a.answerId === answerId);
    if (!answer) return { accepted: false, reason: 'Invalid answer' };

    // Cannot vote for own answer
    if (answer.submittedByPlayerId === playerId) {
      return { accepted: false, reason: 'Cannot vote for own answer' };
    }

    state.votes.push({ voterId: playerId, answerId });

    // Broadcast updated vote count
    this.broadcastState(state.roomId);

    // Send updated private state to the voter
    sendToSession(
      state.players.find(p => p.id === playerId)!.sessionId,
      {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(state.roomId, playerId),
      },
    );

    // Check if all players voted
    if (state.votes.length >= state.players.length) {
      this.startReveal(state.roomId);
    }

    return { accepted: true };
  }

  private startRound(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.currentRound++;
    state.currentPhase = PhaseType.BB_SUBMIT;
    state.submissions = new Map();
    state.answers = [];
    state.votes = [];
    state.revealData = null;

    // Pick a prompt
    const [prompt] = getRandomPrompts(1, state.usedPromptIds);
    state.currentPrompt = prompt;
    state.usedPromptIds.push(prompt.id);

    // Broadcast phase change
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send private state (prompt) to each player
    for (const player of state.players) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start submission timer
    timerEngine.start(
      roomId,
      PhaseType.BB_SUBMIT,
      BB_SUBMIT_TIME_SECONDS * 1000,
      sessionIds,
      () => this.startVoting(roomId),
    );

    logger.info('Round started', { roomId, round: state.currentRound });
  }

  private startVoting(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state || !state.currentPrompt) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.BB_VOTING;

    // Build answer list: all fake submissions + the correct answer
    const answers: BBAnswer[] = [];

    // Add player submissions
    for (const [playerId, text] of state.submissions) {
      answers.push({
        answerId: generateId(),
        text,
        submittedByPlayerId: playerId,
        isCorrect: false,
      });
    }

    // Add correct answer
    answers.push({
      answerId: generateId(),
      text: state.currentPrompt.correctAnswer,
      submittedByPlayerId: null,
      isCorrect: true,
    });

    // Shuffle
    state.answers = answers.sort(() => Math.random() - 0.5);

    // Broadcast phase change
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send private state (vote options) to each player
    for (const player of state.players) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start voting timer
    timerEngine.start(
      roomId,
      PhaseType.BB_VOTING,
      BB_VOTE_TIME_SECONDS * 1000,
      sessionIds,
      () => this.startReveal(roomId),
    );
  }

  private startReveal(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.BB_REVEAL;

    // Calculate scores
    const result = calculateBBScores(state.answers, state.votes);

    // Apply scores
    const roundScores = new Map<string, number>();
    for (const [playerId, points] of result.roundPoints) {
      scoreEngine.addPoints(roomId, playerId, points);
      roundScores.set(playerId, points);
    }

    // Build reveal data
    const room = roomManager.getRoom(roomId);
    const revealAnswers: BBRevealAnswer[] = state.answers.map(answer => {
      const answerResult = result.answerResults.find(r => r.answerId === answer.answerId)!;
      const submitterPlayer = answer.submittedByPlayerId
        ? state.players.find(p => p.id === answer.submittedByPlayerId)
        : null;
      return {
        answerId: answer.answerId,
        text: answer.text,
        isCorrect: answer.isCorrect,
        submittedByPlayerId: answer.submittedByPlayerId,
        submittedByPlayerName: submitterPlayer?.name ?? null,
        voterPlayerIds: answerResult.voterIds,
        voterPlayerNames: answerResult.voterIds.map(id => {
          const p = state.players.find(pl => pl.id === id);
          return p?.name ?? 'Unknown';
        }),
      };
    });

    state.revealData = {
      correctAnswerId: state.answers.find(a => a.isCorrect)!.answerId,
      answers: revealAnswers,
      roundScores: state.players.map(p => ({
        playerId: p.id,
        playerName: p.name,
        fooledCount: result.answerResults
          .filter(r => r.submittedByPlayerId === p.id)
          .reduce((sum, r) => sum + r.voterIds.length, 0),
        foundCorrect: state.votes.some(
          v => v.voterId === p.id && state.answers.find(a => a.answerId === v.answerId)?.isCorrect,
        ),
        roundPoints: roundScores.get(p.id) ?? 0,
        totalPoints: scoreEngine.getScore(roomId, p.id),
      })),
    };

    // Broadcast
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Start reveal timer → then show scores or next round
    timerEngine.start(
      roomId,
      PhaseType.BB_REVEAL,
      BB_REVEAL_TIME_SECONDS * 1000,
      sessionIds,
      () => this.showScores(roomId),
    );
  }

  private showScores(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.BB_SCORES;

    // Broadcast scores
    scoreEngine.broadcastScores(roomId);

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Check if game is over
    if (state.currentRound >= state.totalRounds) {
      timerEngine.start(
        roomId,
        PhaseType.BB_SCORES,
        BB_SCORES_TIME_SECONDS * 1000,
        sessionIds,
        () => this.endGame(roomId),
      );
    } else {
      timerEngine.start(
        roomId,
        PhaseType.BB_SCORES,
        BB_SCORES_TIME_SECONDS * 1000,
        sessionIds,
        () => this.startRound(roomId),
      );
    }
  }

  private endGame(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.GAME_OVER;

    const scores = scoreEngine.getScores(roomId);
    const winner = scores[0]; // Highest score

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.GAME_OVER,
      result: {
        winnerId: winner?.playerId ?? null,
        winnerName: winner?.playerName ?? null,
        winnerTeam: null,
        finalScores: scores,
        gameId: GameId.BLUFF_BATTLE,
      },
    });

    roomManager.setRoomStatus(roomId, RoomStatus.GAME_ENDED);
    logger.info('Game ended', { roomId, winnerId: winner?.playerId });
  }

  private broadcastState(roomId: string): void {
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });
  }
}

export const bluffBattleModule = new BluffBattleModule();
```

### Step 3.18: server/src/games/village/roles.ts

```ts
import { VillageRole } from '@boredless/shared';
import { ROLE_DISTRIBUTIONS } from '@boredless/shared';
import type { Player } from '@boredless/shared';

export interface RoleAssignment {
  playerId: string;
  role: VillageRole;
}

/**
 * Distribute roles to players based on player count.
 * Returns shuffled role assignments.
 */
export function distributeRoles(players: Player[]): RoleAssignment[] {
  const count = players.length;
  const dist = ROLE_DISTRIBUTIONS[count];

  if (!dist) {
    throw new Error(`No role distribution for ${count} players`);
  }

  // Build role pool
  const roles: VillageRole[] = [];
  for (let i = 0; i < dist.werewolves; i++) roles.push(VillageRole.WEREWOLF);
  for (let i = 0; i < dist.seers; i++) roles.push(VillageRole.SEER);
  for (let i = 0; i < dist.doctors; i++) roles.push(VillageRole.DOCTOR);
  for (let i = 0; i < dist.villagers; i++) roles.push(VillageRole.VILLAGER);

  // Shuffle roles
  const shuffled = [...roles].sort(() => Math.random() - 0.5);

  // Assign to players
  return players.map((player, i) => ({
    playerId: player.id,
    role: shuffled[i],
  }));
}

/** Get role display info */
export function getRoleInfo(role: VillageRole): { name: string; description: string; team: 'villagers' | 'werewolves' } {
  switch (role) {
    case VillageRole.VILLAGER:
      return {
        name: 'Villager',
        description: 'You are a villager. Find and eliminate the werewolves through discussion and voting.',
        team: 'villagers',
      };
    case VillageRole.WEREWOLF:
      return {
        name: 'Werewolf',
        description: 'You are a werewolf. Each night, choose a villager to eliminate. Blend in during the day.',
        team: 'werewolves',
      };
    case VillageRole.SEER:
      return {
        name: 'Seer',
        description: 'You are the Seer. Each night, you may inspect one player to learn if they are a werewolf.',
        team: 'villagers',
      };
    case VillageRole.DOCTOR:
      return {
        name: 'Doctor',
        description: 'You are the Doctor. Each night, you may protect one player from the werewolves.',
        team: 'villagers',
      };
  }
}
```

### Step 3.19: server/src/games/village/resolution.ts

```ts
import type { NightResolution, SeerInspectionResult } from '@boredless/shared';
import { VillageRole } from '@boredless/shared';
import type { RoleAssignment } from './roles.js';

export interface NightAction {
  playerId: string;
  role: VillageRole;
  targetPlayerId: string;
}

/**
 * Resolve night actions.
 *
 * Resolution order (this is critical and must be deterministic):
 * 1. Seer inspects their target
 * 2. Doctor protects their target
 * 3. Werewolves attack their target
 * 4. If doctor protected the attack target, no one dies
 */
export function resolveNight(
  actions: NightAction[],
  roleAssignments: RoleAssignment[],
  alivePlayers: { playerId: string; playerName: string }[],
): NightResolution {
  // Find each action type
  const werewolfActions = actions.filter(a => a.role === VillageRole.WEREWOLF);
  const seerAction = actions.find(a => a.role === VillageRole.SEER);
  const doctorAction = actions.find(a => a.role === VillageRole.DOCTOR);

  // 1. Resolve werewolf target (majority vote among werewolves, or first if tie)
  let werewolfTargetId: string | null = null;
  if (werewolfActions.length > 0) {
    const targetVotes = new Map<string, number>();
    for (const action of werewolfActions) {
      const count = targetVotes.get(action.targetPlayerId) ?? 0;
      targetVotes.set(action.targetPlayerId, count + 1);
    }

    let maxVotes = 0;
    for (const [targetId, votes] of targetVotes) {
      if (votes > maxVotes) {
        maxVotes = votes;
        werewolfTargetId = targetId;
      }
    }
  }

  // 2. Resolve seer inspection
  let seerResult: SeerInspectionResult | null = null;
  const seerTargetId = seerAction?.targetPlayerId ?? null;
  if (seerTargetId) {
    const targetRole = roleAssignments.find(r => r.playerId === seerTargetId);
    const targetPlayer = alivePlayers.find(p => p.playerId === seerTargetId);
    if (targetRole && targetPlayer) {
      seerResult = {
        targetPlayerId: seerTargetId,
        targetPlayerName: targetPlayer.playerName,
        isWerewolf: targetRole.role === VillageRole.WEREWOLF,
      };
    }
  }

  // 3. Resolve doctor protection
  const doctorTargetId = doctorAction?.targetPlayerId ?? null;

  // 4. Determine kill
  let killedPlayerId: string | null = null;
  let killedPlayerName: string | null = null;

  if (werewolfTargetId && werewolfTargetId !== doctorTargetId) {
    // Werewolves killed someone and doctor didn't save them
    const killed = alivePlayers.find(p => p.playerId === werewolfTargetId);
    if (killed) {
      killedPlayerId = killed.playerId;
      killedPlayerName = killed.playerName;
    }
  }
  // If doctor protected the target, no one dies

  return {
    werewolfTargetId,
    seerTargetId,
    doctorTargetId,
    killedPlayerId,
    killedPlayerName,
    seerResult,
  };
}

/**
 * Check win condition.
 * - Villagers win if all werewolves are eliminated
 * - Werewolves win if they equal or outnumber villagers
 */
export function checkWinCondition(
  alivePlayers: { playerId: string }[],
  roleAssignments: RoleAssignment[],
): 'villagers' | 'werewolves' | null {
  const aliveIds = new Set(alivePlayers.map(p => p.playerId));

  const aliveWerewolves = roleAssignments.filter(
    r => r.role === VillageRole.WEREWOLF && aliveIds.has(r.playerId),
  ).length;

  const aliveVillagers = aliveIds.size - aliveWerewolves;

  if (aliveWerewolves === 0) return 'villagers';
  if (aliveWerewolves >= aliveVillagers) return 'werewolves';
  return null;
}
```

### Step 3.20: server/src/games/village/index.ts

```ts
import type { GameModule } from '../game-module.js';
import type {
  Player,
  PhaseState,
  GameDefinition,
  VillagePublicState,
  VillagePrivateState,
  VillagePublicPlayer,
} from '@boredless/shared';
import {
  GameId,
  PhaseType,
  InputType,
  VillageRole,
  ServerMessageType,
  RoomStatus,
  PlayerStatus,
  VOS_MIN_PLAYERS,
  VOS_MAX_PLAYERS,
  VOS_ROLE_REVEAL_TIME_SECONDS,
  VOS_NIGHT_TIME_SECONDS,
  VOS_NIGHT_RESULT_TIME_SECONDS,
  VOS_DAY_TIME_SECONDS,
  VOS_VOTE_TIME_SECONDS,
  VOS_VOTE_RESULT_TIME_SECONDS,
  GAME_CATALOG,
} from '@boredless/shared';
import { roomManager } from '../../engine/room-manager.js';
import { timerEngine } from '../../engine/timer-engine.js';
import { sendToSession, sendToSessions } from '../../ws/send.js';
import { logger } from '../../utils/logger.js';
import { distributeRoles, getRoleInfo, type RoleAssignment } from './roles.js';
import { resolveNight, checkWinCondition, type NightAction } from './resolution.js';

/** Internal game state */
interface VillageGameState {
  roomId: string;
  players: Player[];
  roleAssignments: RoleAssignment[];
  dayNumber: number;
  currentPhase: PhaseType;

  /** Alive status per player */
  alive: Map<string, boolean>;

  /** Night actions collected this night */
  nightActions: NightAction[];
  /** Which players have submitted night actions */
  nightActedPlayerIds: Set<string>;
  /** Expected night action count */
  expectedNightActions: number;

  /** Day vote tallies */
  dayVotes: Map<string, string>; // voterId → targetPlayerId
  /** Last night's result message */
  nightResultMessage: string | null;
  /** Last vote result message */
  voteResultMessage: string | null;
  /** Last eliminated player info */
  eliminatedPlayerId: string | null;
  eliminatedPlayerName: string | null;  eliminatedPlayerRole: VillageRole | null;
  /** Seer results per seer (playerId → last result) */
  seerResults: Map<string, import('@boredless/shared').SeerInspectionResult>;
  /** Win state */
  winningTeam: 'villagers' | 'werewolves' | null;
}

function getAllSessionIds(roomId: string): string[] {
  const room = roomManager.getRoom(roomId);
  if (!room) return [];
  const ids = room.players.filter(p => p.status !== 'removed').map(p => p.sessionId);
  if (room.displaySessionId) ids.push(room.displaySessionId);
  return ids;
}

class VillageModule implements GameModule {
  readonly definition: GameDefinition = GAME_CATALOG.find(g => g.id === GameId.VILLAGE_OF_SHADOWS)!;

  private states = new Map<string, VillageGameState>();

  setup(roomId: string, players: Player[]): void {
    const roles = distributeRoles(players);
    const alive = new Map<string, boolean>(players.map(p => [p.id, true]));

    const state: VillageGameState = {
      roomId,
      players: [...players],
      roleAssignments: roles,
      dayNumber: 0,
      currentPhase: PhaseType.VOS_ROLE_REVEAL,
      alive,
      nightActions: [],
      nightActedPlayerIds: new Set(),
      expectedNightActions: 0,
      dayVotes: new Map(),
      nightResultMessage: null,
      voteResultMessage: null,
      eliminatedPlayerId: null,
      eliminatedPlayerName: null,
      eliminatedPlayerRole: null,
      seerResults: new Map(),
      winningTeam: null,
    };

    this.states.set(roomId, state);
    roomManager.setRoomStatus(roomId, RoomStatus.IN_GAME);

    // Broadcast game started with public state
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.GAME_STARTED,
      gameId: GameId.VILLAGE_OF_SHADOWS,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send private state to each player (their role)
    for (const player of players) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start role reveal timer then begin first night
    timerEngine.start(
      roomId,
      PhaseType.VOS_ROLE_REVEAL,
      VOS_ROLE_REVEAL_TIME_SECONDS * 1000,
      sessionIds,
      () => this.startNight(roomId),
    );
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 0, timerRemainingMs: null, timerTotalMs: null };
    const remaining = timerEngine.getRemaining(roomId);
    let timerTotalMs: number | null = null;
    switch (state.currentPhase) {
      case PhaseType.VOS_ROLE_REVEAL: timerTotalMs = VOS_ROLE_REVEAL_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_NIGHT: timerTotalMs = VOS_NIGHT_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_NIGHT_RESULT: timerTotalMs = VOS_NIGHT_RESULT_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_DAY: timerTotalMs = VOS_DAY_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_VOTE: timerTotalMs = VOS_VOTE_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_VOTE_RESULT: timerTotalMs = VOS_VOTE_RESULT_TIME_SECONDS * 1000; break;
    }
    return {
      phaseType: state.currentPhase,
      roundNumber: state.dayNumber,
      totalRounds: 0,
      timerRemainingMs: remaining,
      timerTotalMs,
    };
  }

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const publicPlayers: VillagePublicPlayer[] = state.players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      playerColor: p.color,
      isAlive: state.alive.get(p.id) ?? false,
    }));

    const publicState: VillagePublicState = {
      gameId: 'village_of_shadows',
      dayNumber: state.dayNumber,
      players: publicPlayers,
      nightResultMessage: state.nightResultMessage,
      voteResultMessage: state.voteResultMessage,
      eliminatedPlayerId: state.eliminatedPlayerId,
      eliminatedPlayerName: state.eliminatedPlayerName,
      eliminatedPlayerRole: state.eliminatedPlayerRole,
      votes: state.currentPhase === PhaseType.VOS_VOTE || state.currentPhase === PhaseType.VOS_VOTE_RESULT
        ? this.buildVoteTally(state)
        : null,
      winningTeam: state.winningTeam,
      nightActionsSubmitted: state.nightActedPlayerIds.size,
      nightActionsExpected: state.expectedNightActions,
    };

    return publicState as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const roleAssignment = state.roleAssignments.find(r => r.playerId === playerId);
    if (!roleAssignment) return {};

    const isAlive = state.alive.get(playerId) ?? false;
    const alivePlayers = state.players.filter(p => state.alive.get(p.id));

    // Werewolf teammates
    const werewolfTeammates: string[] = roleAssignment.role === VillageRole.WEREWOLF
      ? state.roleAssignments
          .filter(r => r.role === VillageRole.WEREWOLF && r.playerId !== playerId)
          .map(r => r.playerId)
      : [];

    // Night targets (for active roles during night phase)
    let nightTargets: import('@boredless/shared').VillageNightTarget[] | null = null;
    if (state.currentPhase === PhaseType.VOS_NIGHT && isAlive && !state.nightActedPlayerIds.has(playerId)) {
      if (roleAssignment.role === VillageRole.WEREWOLF) {
        // Werewolves target non-werewolf alive players
        nightTargets = alivePlayers
          .filter(p => {
            const role = state.roleAssignments.find(r => r.playerId === p.id);
            return role?.role !== VillageRole.WEREWOLF;
          })
          .map(p => ({ playerId: p.id, playerName: p.name }));
      } else if (roleAssignment.role === VillageRole.SEER || roleAssignment.role === VillageRole.DOCTOR) {
        // Seer/Doctor target any alive player (except themselves for seer logic, doctor can protect self)
        nightTargets = alivePlayers
          .filter(p => p.id !== playerId || roleAssignment.role === VillageRole.DOCTOR)
          .map(p => ({ playerId: p.id, playerName: p.name }));
      }
      // Villagers have no night action
    }

    // Vote targets (alive players during vote phase, excluding self)
    let voteTargets: import('@boredless/shared').VillageVoteTarget[] | null = null;
    if (state.currentPhase === PhaseType.VOS_VOTE && isAlive && !state.dayVotes.has(playerId)) {
      voteTargets = alivePlayers
        .filter(p => p.id !== playerId)
        .map(p => ({ playerId: p.id, playerName: p.name }));
    }

    const privateState: VillagePrivateState = {
      gameId: 'village_of_shadows',
      role: roleAssignment.role,
      isAlive,
      seerResult: state.seerResults.get(playerId) ?? null,
      hasActed: state.nightActedPlayerIds.has(playerId),
      hasVoted: state.dayVotes.has(playerId),
      werewolfTeammates,
      nightTargets,
      voteTargets,
    };

    return privateState as unknown as Record<string, unknown>;
  }

  handleInput(
    roomId: string,
    playerId: string,
    inputType: InputType,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const state = this.states.get(roomId);
    if (!state) return { accepted: false, reason: 'Game not found' };

    const isAlive = state.alive.get(playerId) ?? false;
    if (!isAlive) return { accepted: false, reason: 'Dead players cannot act' };

    switch (inputType) {
      case InputType.NIGHT_ACTION:
        return this.handleNightAction(state, playerId, payload);
      case InputType.VOTE:
        return this.handleDayVote(state, playerId, payload);
      default:
        return { accepted: false, reason: 'Invalid input type' };
    }
  }

  teardown(roomId: string): void {
    timerEngine.stop(roomId);
    this.states.delete(roomId);
  }

  // === Private methods ===

  private handleNightAction(
    state: VillageGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== PhaseType.VOS_NIGHT) {
      return { accepted: false, reason: 'Not night phase' };
    }
    if (state.nightActedPlayerIds.has(playerId)) {
      return { accepted: false, reason: 'Already acted this night' };
    }

    const roleAssignment = state.roleAssignments.find(r => r.playerId === playerId);
    if (!roleAssignment) return { accepted: false, reason: 'No role found' };
    if (roleAssignment.role === VillageRole.VILLAGER) {
      return { accepted: false, reason: 'Villagers have no night action' };
    }

    const targetPlayerId = String(payload.targetPlayerId ?? '');
    const isTargetAlive = state.alive.get(targetPlayerId);
    if (!isTargetAlive) return { accepted: false, reason: 'Target is not alive' };

    // Werewolves cannot target themselves or other werewolves
    if (roleAssignment.role === VillageRole.WEREWOLF) {
      const targetRole = state.roleAssignments.find(r => r.playerId === targetPlayerId);
      if (targetRole?.role === VillageRole.WEREWOLF) {
        return { accepted: false, reason: 'Cannot target another werewolf' };
      }
    }

    state.nightActions.push({
      playerId,
      role: roleAssignment.role,
      targetPlayerId,
    });
    state.nightActedPlayerIds.add(playerId);

    // Broadcast updated action count
    const sessionIds = getAllSessionIds(state.roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(state.roomId),
      gamePublicState: this.getPublicState(state.roomId),
    });

    // Check if all expected actions received
    if (state.nightActedPlayerIds.size >= state.expectedNightActions) {
      this.resolveNight(state.roomId);
    }

    return { accepted: true };
  }

  private handleDayVote(
    state: VillageGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== PhaseType.VOS_VOTE) {
      return { accepted: false, reason: 'Not in vote phase' };
    }
    if (state.dayVotes.has(playerId)) {
      return { accepted: false, reason: 'Already voted' };
    }

    const targetPlayerId = String(payload.answerId ?? ''); // answerId is reused for vote target
    if (targetPlayerId === playerId) return { accepted: false, reason: 'Cannot vote for yourself' };
    const isTargetAlive = state.alive.get(targetPlayerId);
    if (!isTargetAlive) return { accepted: false, reason: 'Target is not alive' };

    state.dayVotes.set(playerId, targetPlayerId);

    // Broadcast updated vote count
    const sessionIds = getAllSessionIds(state.roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(state.roomId),
      gamePublicState: this.getPublicState(state.roomId),
    });

    // Check if all alive players voted
    const aliveCount = [...state.alive.values()].filter(Boolean).length;
    if (state.dayVotes.size >= aliveCount) {
      this.resolveVote(state.roomId);
    }

    return { accepted: true };
  }

  private startNight(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.dayNumber++;
    state.currentPhase = PhaseType.VOS_NIGHT;
    state.nightActions = [];
    state.nightActedPlayerIds = new Set();
    state.eliminatedPlayerId = null;
    state.eliminatedPlayerName = null;
    state.eliminatedPlayerRole = null;

    // Count how many players have night actions (werewolves, seer, doctor)
    const aliveRoles = state.roleAssignments.filter(r => state.alive.get(r.playerId));
    state.expectedNightActions = aliveRoles.filter(
      r => r.role !== VillageRole.VILLAGER,
    ).length;

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send updated private states (with night targets)
    for (const player of state.players.filter(p => state.alive.get(p.id))) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start night timer
    timerEngine.start(
      roomId,
      PhaseType.VOS_NIGHT,
      VOS_NIGHT_TIME_SECONDS * 1000,
      sessionIds,
      () => this.resolveNight(roomId),
    );
  }

  private resolveNight(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.VOS_NIGHT_RESULT;

    // Run resolution
    const alivePlayers = state.players
      .filter(p => state.alive.get(p.id))
      .map(p => ({ playerId: p.id, playerName: p.name }));

    const resolution = resolveNight(state.nightActions, state.roleAssignments, alivePlayers);

    // Apply results
    if (resolution.killedPlayerId) {
      state.alive.set(resolution.killedPlayerId, false);
      state.nightResultMessage = `${resolution.killedPlayerName} was found dead in the village.`;
      state.eliminatedPlayerId = resolution.killedPlayerId;
      state.eliminatedPlayerName = resolution.killedPlayerName;
      const killedRole = state.roleAssignments.find(r => r.playerId === resolution.killedPlayerId);
      state.eliminatedPlayerRole = killedRole?.role ?? null;
    } else {
      state.nightResultMessage = 'The village was quiet. No one was killed last night.';
    }

    // Update seer's private state with their result
    if (resolution.seerResult) {
      const seerAssignment = state.roleAssignments.find(r => r.role === VillageRole.SEER);
      if (seerAssignment) {
        state.seerResults.set(seerAssignment.playerId, resolution.seerResult);
      }
    }

    // Check win condition
    const aliveNow = state.players.filter(p => state.alive.get(p.id));
    const winTeam = checkWinCondition(
      aliveNow.map(p => ({ playerId: p.id })),
      state.roleAssignments,
    );

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send updated private states
    for (const player of state.players) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    if (winTeam) {
      timerEngine.start(
        roomId,
        PhaseType.VOS_NIGHT_RESULT,
        VOS_NIGHT_RESULT_TIME_SECONDS * 1000,
        sessionIds,
        () => this.endGame(roomId, winTeam),
      );
    } else {
      timerEngine.start(
        roomId,
        PhaseType.VOS_NIGHT_RESULT,
        VOS_NIGHT_RESULT_TIME_SECONDS * 1000,
        sessionIds,
        () => this.startDay(roomId),
      );
    }
  }

  private startDay(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.VOS_DAY;
    state.dayVotes = new Map();
    state.voteResultMessage = null;

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    timerEngine.start(
      roomId,
      PhaseType.VOS_DAY,
      VOS_DAY_TIME_SECONDS * 1000,
      sessionIds,
      () => this.startVote(roomId),
    );
  }

  private startVote(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.VOS_VOTE;
    state.dayVotes = new Map();

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send vote targets to each alive player
    for (const player of state.players.filter(p => state.alive.get(p.id))) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    timerEngine.start(
      roomId,
      PhaseType.VOS_VOTE,
      VOS_VOTE_TIME_SECONDS * 1000,
      sessionIds,
      () => this.resolveVote(roomId),
    );
  }

  private resolveVote(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.VOS_VOTE_RESULT;

    // Tally votes
    const tally = new Map<string, number>();
    for (const targetId of state.dayVotes.values()) {
      tally.set(targetId, (tally.get(targetId) ?? 0) + 1);
    }

    // Find player with most votes
    let maxVotes = 0;
    let eliminatedId: string | null = null;
    for (const [targetId, count] of tally) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = targetId;
      }
    }

    // Handle tie (no elimination)
    const maxCount = Math.max(...tally.values());
    const playersWithMax = [...tally.entries()].filter(([, v]) => v === maxCount);

    if (playersWithMax.length > 1 || !eliminatedId) {
      state.voteResultMessage = 'The vote was tied. No one was eliminated.';
      state.eliminatedPlayerId = null;
      state.eliminatedPlayerName = null;
      state.eliminatedPlayerRole = null;
    } else {
      const eliminatedPlayer = state.players.find(p => p.id === eliminatedId);
      if (eliminatedPlayer) {
        state.alive.set(eliminatedId, false);
        const role = state.roleAssignments.find(r => r.playerId === eliminatedId);
        state.eliminatedPlayerId = eliminatedId;
        state.eliminatedPlayerName = eliminatedPlayer.name;
        state.eliminatedPlayerRole = role?.role ?? null;
        state.voteResultMessage = `${eliminatedPlayer.name} was eliminated by the village.`;
      }
    }

    // Check win
    const aliveNow = state.players.filter(p => state.alive.get(p.id));
    const winTeam = checkWinCondition(
      aliveNow.map(p => ({ playerId: p.id })),
      state.roleAssignments,
    );

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    if (winTeam) {
      timerEngine.start(
        roomId,
        PhaseType.VOS_VOTE_RESULT,
        VOS_VOTE_RESULT_TIME_SECONDS * 1000,
        sessionIds,
        () => this.endGame(roomId, winTeam),
      );
    } else {
      timerEngine.start(
        roomId,
        PhaseType.VOS_VOTE_RESULT,
        VOS_VOTE_RESULT_TIME_SECONDS * 1000,
        sessionIds,
        () => this.startNight(roomId),
      );
    }
  }

  private endGame(roomId: string, winTeam: 'villagers' | 'werewolves'): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.GAME_OVER;
    state.winningTeam = winTeam;

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.GAME_OVER,
      result: {
        winnerId: null,
        winnerName: null,
        winnerTeam: winTeam,
        finalScores: [],
        gameId: GameId.VILLAGE_OF_SHADOWS,
      },
    });

    roomManager.setRoomStatus(roomId, RoomStatus.GAME_ENDED);
    logger.info('Village game ended', { roomId, winTeam });
  }

  private buildVoteTally(state: VillageGameState) {
    const tally = new Map<string, string[]>(); // targetId → voterNames
    for (const [voterId, targetId] of state.dayVotes) {
      if (!tally.has(targetId)) tally.set(targetId, []);
      const voter = state.players.find(p => p.id === voterId);
      tally.get(targetId)!.push(voter?.name ?? 'Unknown');
    }

    return [...tally.entries()].map(([targetId, voterNames]) => {
      const target = state.players.find(p => p.id === targetId);
      return {
        targetPlayerId: targetId,
        targetPlayerName: target?.name ?? 'Unknown',
        voteCount: voterNames.length,
        voterNames: state.currentPhase === PhaseType.VOS_VOTE_RESULT ? voterNames : [],
      };
    });
  }
}

export const villageModule = new VillageModule();

### Step 3.21: server/src/ws/handler.ts

This is the WebSocket message router. Every client message flows through here.

```ts
import type { WebSocket } from 'ws';
import type { ClientMessage } from '@boredless/shared';
import {
  ClientMessageType,
  ServerMessageType,
  InputType,
} from '@boredless/shared';
import { sessionRegistry } from './registry.js';
import { sendToSocket, sendToSession, sendError } from './send.js';
import { roomManager } from '../engine/room-manager.js';
import { gameRegistry } from '../games/registry.js';
import { logger } from '../utils/logger.js';

/**
 * Handle a new WebSocket connection.
 * This function is registered with Fastify's WebSocket plugin.
 */
export function handleConnection(ws: WebSocket): void {
  logger.info('WebSocket connected');

  ws.on('message', (raw: Buffer | string) => {
    try {
      const data = JSON.parse(raw.toString()) as ClientMessage;
      handleMessage(ws, data);
    } catch (err) {
      sendError(ws, 'PARSE_ERROR', 'Invalid message format');
    }
  });

  ws.on('close', () => {
    const sessionId = sessionRegistry.unregister(ws);
    if (sessionId) {
      roomManager.handleDisconnect(sessionId);
      logger.info('Session disconnected', { sessionId });
    }
  });

  ws.on('error', (err) => {
    logger.error('WebSocket error', { error: String(err) });
  });
}

function handleMessage(ws: WebSocket, msg: ClientMessage): void {
  switch (msg.type) {
    case ClientMessageType.JOIN_ROOM:
      handleJoinRoom(ws, msg);
      break;

    case ClientMessageType.REJOIN:
      handleRejoin(ws, msg);
      break;

    case ClientMessageType.JOIN_DISPLAY:
      handleJoinDisplay(ws, msg);
      break;

    case ClientMessageType.SELECT_GAME:
      handleSelectGame(ws, msg);
      break;

    case ClientMessageType.START_GAME:
      handleStartGame(ws);
      break;

    case ClientMessageType.SUBMIT_INPUT:
      handleSubmitInput(ws, msg);
      break;

    case ClientMessageType.KICK_PLAYER:
      handleKickPlayer(ws, msg);
      break;

    case ClientMessageType.RETURN_TO_LOBBY:
      handleReturnToLobby(ws);
      break;

    case ClientMessageType.CLOSE_ROOM:
      handleCloseRoom(ws);
      break;

    case ClientMessageType.PING:
      ws.send(JSON.stringify({
        type: ServerMessageType.PONG,
        timestamp: msg.timestamp,
        serverTime: Date.now(),
      }));
      break;

    default:
      sendError(ws, 'UNKNOWN_MESSAGE', `Unknown message type`);
  }
}

function handleJoinRoom(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join_room' }>): void {
  const result = roomManager.joinRoom(msg.roomCode, msg.playerName, msg.preferredColor);

  if ('error' in result) {
    sendError(ws, 'JOIN_FAILED', result.error);
    return;
  }

  const { session, player, room } = result;
  sessionRegistry.register(session.id, ws);

  // Send joined confirmation to the new player
  sendToSocket(ws, {
    type: ServerMessageType.JOINED,
    result: {
      sessionId: session.id,
      playerId: player.id,
      reconnectToken: session.reconnectToken,
      room: roomManager.getPublicRoomState(room),
    },
  });
}

function handleRejoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'rejoin' }>): void {
  const result = roomManager.rejoin(msg.sessionId, msg.reconnectToken);

  if ('error' in result) {
    sendError(ws, 'REJOIN_FAILED', result.error);
    return;
  }

  const { session, player, room } = result;
  sessionRegistry.register(session.id, ws);

  // Send full state
  sendToSocket(ws, {
    type: ServerMessageType.JOINED,
    result: {
      sessionId: session.id,
      playerId: player.id,
      reconnectToken: session.reconnectToken,
      room: roomManager.getPublicRoomState(room),
    },
  });

  // If game is active, send current game state
  if (room.selectedGameId) {
    const gameModule = gameRegistry.get(room.selectedGameId);
    if (gameModule) {
      sendToSocket(ws, {
        type: ServerMessageType.PHASE_CHANGED,
        phase: gameModule.getPhaseState(room.id),
        gamePublicState: gameModule.getPublicState(room.id),
      });
      sendToSocket(ws, {
        type: ServerMessageType.PRIVATE_STATE,
        state: gameModule.getPrivateState(room.id, player.id),
      });
    }
  }
}

function handleJoinDisplay(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join_display' }>): void {
  const session = roomManager.registerDisplay(msg.roomId);

  if (!session) {
    sendError(ws, 'DISPLAY_FAILED', 'Room not found');
    return;
  }

  sessionRegistry.register(session.id, ws);

  const room = roomManager.getRoom(msg.roomId)!;
  sendToSocket(ws, {
    type: ServerMessageType.ROOM_STATE,
    room: roomManager.getPublicRoomState(room),
    phase: null,
    gamePublicState: null,
  });
}

function handleSelectGame(ws: WebSocket, msg: Extract<ClientMessage, { type: 'select_game' }>): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room) return;

  if (room.hostPlayerId !== player.id) {
    sendError(ws, 'NOT_HOST', 'Only the host can select a game');
    return;
  }

  const gameModule = gameRegistry.get(msg.gameId);
  if (!gameModule) {
    sendError(ws, 'INVALID_GAME', 'Game not found');
    return;
  }

  roomManager.selectGame(session.roomId, player.id, msg.gameId);
}

function handleStartGame(ws: WebSocket): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room) return;

  if (room.hostPlayerId !== player.id) {
    sendError(ws, 'NOT_HOST', 'Only the host can start the game');
    return;
  }

  if (!room.selectedGameId) {
    sendError(ws, 'NO_GAME', 'No game selected');
    return;
  }

  const gameModule = gameRegistry.get(room.selectedGameId);
  if (!gameModule) {
    sendError(ws, 'INVALID_GAME', 'Game module not found');
    return;
  }

  // Check player count
  const activePlayers = roomManager.getActivePlayers(session.roomId);
  if (activePlayers.length < gameModule.definition.minPlayers) {
    sendError(ws, 'TOO_FEW_PLAYERS', `Need at least ${gameModule.definition.minPlayers} players`);
    return;
  }
  if (activePlayers.length > gameModule.definition.maxPlayers) {
    sendError(ws, 'TOO_MANY_PLAYERS', `Maximum ${gameModule.definition.maxPlayers} players`);
    return;
  }

  // Start game
  gameModule.setup(session.roomId, activePlayers);
}

function handleSubmitInput(ws: WebSocket, msg: Extract<ClientMessage, { type: 'submit_input' }>): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session || !session.playerId) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room || !room.selectedGameId) return;

  const gameModule = gameRegistry.get(room.selectedGameId);
  if (!gameModule) return;

  const result = gameModule.handleInput(
    session.roomId,
    session.playerId,
    msg.inputType as InputType,
    msg.payload,
  );

  if (result.accepted) {
    sendToSocket(ws, { type: ServerMessageType.INPUT_ACCEPTED, inputType: msg.inputType as InputType });
  } else {
    sendToSocket(ws, { type: ServerMessageType.INPUT_REJECTED, inputType: msg.inputType as InputType, reason: result.reason ?? 'Rejected' });
  }
}

function handleKickPlayer(ws: WebSocket, msg: Extract<ClientMessage, { type: 'kick_player' }>): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  roomManager.kickPlayer(session.roomId, player.id, msg.playerId);
}

function handleReturnToLobby(ws: WebSocket): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room || !room.selectedGameId) return;

  const gameModule = gameRegistry.get(room.selectedGameId);
  if (gameModule) {
    gameModule.teardown(session.roomId);
  }

  roomManager.returnToLobby(session.roomId, player.id);
}

function handleCloseRoom(ws: WebSocket): void {
  const sessionId = sessionRegistry.getSessionId(ws);
  if (!sessionId) return;

  const session = roomManager.getSession(sessionId);
  if (!session) return;

  const player = roomManager.getPlayerBySessionId(sessionId);
  if (!player) return;

  const room = roomManager.getRoom(session.roomId);
  if (!room) return;

  if (room.hostPlayerId !== player.id) {
    sendError(ws, 'NOT_HOST', 'Only the host can close the room');
    return;
  }

  const gameModule = room.selectedGameId ? gameRegistry.get(room.selectedGameId) : null;
  if (gameModule) {
    gameModule.teardown(session.roomId);
  }

  roomManager.closeRoom(session.roomId);
}
```

### Step 3.22: server/src/routes/health.ts

```ts
import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });
}
```

### Step 3.23: server/src/routes/room.ts

```ts
import type { FastifyInstance } from 'fastify';
import { roomManager } from '../engine/room-manager.js';

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  /** Create a new room. Returns roomId, code, and QR code. */
  app.post('/api/rooms', async (request, reply) => {
    const result = await roomManager.createRoom();
    return reply.status(201).send(result);
  });

  /** Get room info by code (for join page to validate before WebSocket) */
  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
    const room = roomManager.getRoomByCode(request.params.code);
    if (!room) {
      return reply.status(404).send({ error: 'Room not found' });
    }

    const activePlayers = room.players.filter(p => p.status !== 'removed');
    const host = room.players.find(p => p.id === room.hostPlayerId);

    return {
      code: room.code,
      status: room.status,
      playerCount: activePlayers.length,
      maxPlayers: 12,
      hostName: host?.name ?? 'Unknown',
    };
  });
}
```

### Step 3.24: server/src/app.ts

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { healthRoutes } from './routes/health.js';
import { roomRoutes } from './routes/room.js';
import { handleConnection } from './ws/handler.js';
import { roomManager } from './engine/room-manager.js';
import { gameRegistry } from './games/registry.js';
import { bluffBattleModule } from './games/bluff-battle/index.js';
import { villageModule } from './games/village/index.js';
import type { ServerConfig } from './config.js';

export async function buildApp(config: ServerConfig) {
  const app = Fastify({ logger: false });

  // Register plugins
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST'],
  });

  await app.register(websocket);

  // Register game modules
  gameRegistry.register(bluffBattleModule);
  gameRegistry.register(villageModule);

  // Initialize room manager
  roomManager.init(config);

  // Register REST routes
  await app.register(healthRoutes);
  await app.register(roomRoutes);

  // Register WebSocket endpoint
  app.get('/ws', { websocket: true }, (socket) => {
    handleConnection(socket);
  });

  return app;
}
```

### Step 3.25: server/src/index.ts

```ts
import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { logger } from './utils/logger.js';

async function main() {
  const config = getConfig();
  const app = await buildApp(config);

  try {
    await app.listen({ port: config.port, host: config.host });
    logger.info(`Boredless server running`, {
      port: config.port,
      host: config.host,
      baseUrl: config.baseUrl,
    });
  } catch (err) {
    logger.error('Failed to start server', { error: String(err) });
    process.exit(1);
  }
}

main();
```

---

## 7. PHASE 4: DISPLAY CLIENT (TV)

### Step 4.1: display/package.json

```json
{
  "name": "@boredless/display",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@boredless/shared": "*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "framer-motion": "^12.0.0",
    "howler": "^2.2.4"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/howler": "^2.2.12",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0"
  }
}
```

### Step 4.2: display/tsconfig.json

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "noEmit": true
  },
  "include": ["src"]
}
```

### Step 4.3: display/vite.config.ts

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3100',
      '/ws': {
        target: 'ws://localhost:3100',
        ws: true,
      },
    },
  },
});
```

### Step 4.4: display/index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Boredless</title>
  </head>
  <body class="bg-gray-950 text-white min-h-screen">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Step 4.5: display/src/styles/globals.css

```css
@import "tailwindcss";

:root {
  --color-primary: #6366f1;
  --color-secondary: #8b5cf6;
  --color-accent: #f59e0b;
  --color-success: #10b981;
  --color-danger: #ef4444;
  --color-bg: #030712;
  --color-surface: #111827;
  --color-surface-light: #1f2937;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background-color: var(--color-bg);
  overflow: hidden;
}

/* Full-screen display mode */
#root {
  width: 100vw;
  height: 100vh;
}
```

### Step 4.6: display/src/store/connection.ts

Zustand store for WebSocket connection management.

```ts
import { create } from 'zustand';
import type { ServerMessage } from '@boredless/shared';
import { ServerMessageType } from '@boredless/shared';

interface ConnectionState {
  ws: WebSocket | null;
  connected: boolean;
  roomId: string | null;

  connect: (roomId: string) => void;
  disconnect: () => void;
  send: (data: Record<string, unknown>) => void;

  /** Listeners for server messages */
  listeners: Map<string, Set<(msg: ServerMessage) => void>>;
  on: (type: string, handler: (msg: ServerMessage) => void) => () => void;
}

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  ws: null,
  connected: false,
  roomId: null,
  listeners: new Map(),

  connect: (roomId: string) => {
    const existing = get().ws;
    if (existing) existing.close();

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      set({ connected: true, roomId });
      // Send join_display message
      ws.send(JSON.stringify({
        type: 'join_display',
        roomId,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        const listeners = get().listeners.get(msg.type);
        if (listeners) {
          for (const handler of listeners) {
            handler(msg);
          }
        }
      } catch (e) {
        console.error('Failed to parse message', e);
      }
    };

    ws.onclose = () => {
      set({ connected: false, ws: null });
    };

    ws.onerror = (err) => {
      console.error('WebSocket error', err);
    };

    set({ ws });
  },

  disconnect: () => {
    const ws = get().ws;
    if (ws) ws.close();
    set({ ws: null, connected: false, roomId: null });
  },

  send: (data) => {
    const ws = get().ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  },

  on: (type, handler) => {
    const listeners = get().listeners;
    if (!listeners.has(type)) {
      listeners.set(type, new Set());
    }
    listeners.get(type)!.add(handler);
    set({ listeners: new Map(listeners) });

    // Return unsubscribe function
    return () => {
      const current = get().listeners.get(type);
      if (current) {
        current.delete(handler);
      }
    };
  },
}));
```

### Step 4.7: display/src/store/room.ts

```ts
import { create } from 'zustand';
import type {
  PublicRoomState,
  PhaseState,
  ScoreEntry,
  GameOverState,
} from '@boredless/shared';

interface RoomState {
  room: PublicRoomState | null;
  phase: PhaseState | null;
  gamePublicState: Record<string, unknown> | null;
  scores: ScoreEntry[];
  gameOverResult: GameOverState | null;
  timerRemainingMs: number | null;

  setRoom: (room: PublicRoomState) => void;
  setPhase: (phase: PhaseState) => void;
  setGamePublicState: (state: Record<string, unknown>) => void;
  setScores: (scores: ScoreEntry[]) => void;
  setGameOver: (result: GameOverState) => void;
  setTimer: (remainingMs: number) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  phase: null,
  gamePublicState: null,
  scores: [],
  gameOverResult: null,
  timerRemainingMs: null,

  setRoom: (room) => set({ room }),
  setPhase: (phase) => set({ phase }),
  setGamePublicState: (state) => set({ gamePublicState: state }),
  setScores: (scores) => set({ scores }),
  setGameOver: (result) => set({ gameOverResult: result }),
  setTimer: (remainingMs) => set({ timerRemainingMs: remainingMs }),
  reset: () => set({
    room: null,
    phase: null,
    gamePublicState: null,
    scores: [],
    gameOverResult: null,
    timerRemainingMs: null,
  }),
}));
```

### Step 4.8: display/src/hooks/useWebSocket.ts

This hook wires the connection store to the room store. Place it at the App level.

```ts
import { useEffect } from 'react';
import { useConnectionStore } from '../store/connection';
import { useRoomStore } from '../store/room';
import { ServerMessageType } from '@boredless/shared';
import type { ServerMessage } from '@boredless/shared';

/**
 * Wires incoming WebSocket messages to the room store.
 * Must be called once at the App level.
 */
export function useWebSocketSync(): void {
  const on = useConnectionStore((s) => s.on);
  const store = useRoomStore;

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(on(ServerMessageType.ROOM_STATE, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'room_state' }>;
      store.getState().setRoom(m.room);
      if (m.phase) store.getState().setPhase(m.phase);
      if (m.gamePublicState) store.getState().setGamePublicState(m.gamePublicState);
    }));

    unsubs.push(on(ServerMessageType.PLAYER_JOINED, (msg) => {
      // Refetch full state isn't needed — room_state is sent on join
      // But we can update player count optimistically
    }));

    unsubs.push(on(ServerMessageType.PHASE_CHANGED, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'phase_changed' }>;
      store.getState().setPhase(m.phase);
      store.getState().setGamePublicState(m.gamePublicState);
    }));

    unsubs.push(on(ServerMessageType.GAME_STARTED, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'game_started' }>;
      store.getState().setPhase(m.phase);
      store.getState().setGamePublicState(m.gamePublicState);
    }));

    unsubs.push(on(ServerMessageType.TIMER_TICK, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'timer_tick' }>;
      store.getState().setTimer(m.remainingMs);
    }));

    unsubs.push(on(ServerMessageType.SCORE_UPDATE, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'score_update' }>;
      store.getState().setScores(m.scores);
    }));

    unsubs.push(on(ServerMessageType.GAME_OVER, (msg) => {
      const m = msg as Extract<ServerMessage, { type: 'game_over' }>;
      store.getState().setGameOver(m.result);
    }));

    return () => unsubs.forEach(fn => fn());
  }, [on]);
}
```

### Step 4.9: display/src/components/QRCode.tsx

```tsx
interface QRCodeProps {
  dataUrl: string;
  roomCode: string;
}

export function QRCode({ dataUrl, roomCode }: QRCodeProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <img src={dataUrl} alt="QR Code" className="w-64 h-64 rounded-xl" />
      <div className="text-center">
        <p className="text-gray-400 text-sm">or enter code</p>
        <p className="text-5xl font-bold tracking-widest text-white">{roomCode}</p>
      </div>
    </div>
  );
}
```

### Step 4.10: display/src/components/PlayerList.tsx

```tsx
import type { PublicPlayerState } from '@boredless/shared';
import { PlayerStatus } from '@boredless/shared';

interface PlayerListProps {
  players: PublicPlayerState[];
  hostPlayerId: string;
}

export function PlayerList({ players, hostPlayerId }: PlayerListProps) {
  return (
    <div className="flex flex-wrap gap-4 justify-center">
      {players.map((player) => (
        <div
          key={player.id}
          className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            player.status === PlayerStatus.DISCONNECTED ? 'opacity-50' : ''
          }`}
          style={{ backgroundColor: player.color + '33', borderColor: player.color, borderWidth: 2 }}
        >
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: player.color }} />
          <span className="text-white font-medium">{player.name}</span>
          {player.id === hostPlayerId && (
            <span className="text-xs text-yellow-400">👑</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Step 4.11: display/src/components/Timer.tsx

```tsx
import { useRoomStore } from '../store/room';

export function Timer() {
  const remainingMs = useRoomStore((s) => s.timerRemainingMs);

  if (remainingMs === null) return null;

  const seconds = Math.ceil(remainingMs / 1000);
  const isUrgent = seconds <= 5;

  return (
    <div
      className={`text-6xl font-bold tabular-nums ${
        isUrgent ? 'text-red-500 animate-pulse' : 'text-white'
      }`}
    >
      {seconds}
    </div>
  );
}
```

### Step 4.12: display/src/components/Scoreboard.tsx

```tsx
import type { ScoreEntry } from '@boredless/shared';

interface ScoreboardProps {
  scores: ScoreEntry[];
  showRoundScore?: boolean;
}

export function Scoreboard({ scores, showRoundScore }: ScoreboardProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      {scores.map((entry, index) => (
        <div
          key={entry.playerId}
          className="flex items-center gap-4 py-3 px-6 border-b border-gray-800"
        >
          <span className="text-2xl font-bold text-gray-500 w-8">
            {index + 1}
          </span>
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: entry.playerColor }} />
          <span className="text-white font-medium flex-1">{entry.playerName}</span>
          {showRoundScore && entry.roundScore > 0 && (
            <span className="text-green-400 text-sm">+{entry.roundScore}</span>
          )}
          <span className="text-2xl font-bold text-white">{entry.score}</span>
        </div>
      ))}
    </div>
  );
}
```

### Step 4.13: display/src/components/GameCard.tsx

```tsx
import type { GameDefinition } from '@boredless/shared';

interface GameCardProps {
  game: GameDefinition;
  isSelected: boolean;
  onSelect: () => void;
}

export function GameCard({ game, isSelected, onSelect }: GameCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`p-6 rounded-2xl border-2 text-left transition-all ${
        isSelected
          ? 'border-indigo-500 bg-indigo-500/20'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
      }`}
    >
      <div className="text-4xl mb-2">{game.icon}</div>
      <h3 className="text-xl font-bold text-white">{game.name}</h3>
      <p className="text-gray-400 text-sm mt-1">{game.description}</p>
      <div className="flex gap-4 mt-3 text-xs text-gray-500">
        <span>{game.minPlayers}-{game.maxPlayers} players</span>
        <span>~{game.estimatedMinutes} min</span>
      </div>
    </button>
  );
}
```

### Step 4.14: display/src/screens/HomeScreen.tsx

This is the first screen. Display creates a room, then shows the lobby.

```tsx
import { useState } from 'react';
import { useConnectionStore } from '../store/connection';

interface HomeScreenProps {
  onRoomCreated: (roomId: string, code: string, qrDataUrl: string) => void;
}

export function HomeScreen({ onRoomCreated }: HomeScreenProps) {
  const [creating, setCreating] = useState(false);

  const createRoom = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      const data = await res.json();
      onRoomCreated(data.roomId, data.code, data.qrDataUrl);
    } catch (err) {
      console.error('Failed to create room', err);
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <h1 className="text-7xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
        Boredless
      </h1>
      <p className="text-xl text-gray-400">Social games for your TV</p>
      <button
        onClick={createRoom}
        disabled={creating}
        className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-xl font-bold transition-colors disabled:opacity-50"
      >
        {creating ? 'Creating...' : 'Create Room'}
      </button>
    </div>
  );
}
```

### Step 4.15: display/src/screens/LobbyScreen.tsx

```tsx
import { QRCode } from '../components/QRCode';
import { PlayerList } from '../components/PlayerList';
import { GameCard } from '../components/GameCard';
import { useRoomStore } from '../store/room';
import { useConnectionStore } from '../store/connection';
import { GAME_CATALOG } from '@boredless/shared';

interface LobbyScreenProps {
  qrDataUrl: string;
}

export function LobbyScreen({ qrDataUrl }: LobbyScreenProps) {
  const room = useRoomStore((s) => s.room);
  const send = useConnectionStore((s) => s.send);

  if (!room) return <div className="text-white p-8">Loading...</div>;

  return (
    <div className="flex flex-col h-full p-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold text-white">Lobby</h2>
          <p className="text-gray-400">Scan to join</p>
        </div>
        <QRCode dataUrl={qrDataUrl} roomCode={room.code} />
      </div>

      {/* Players */}
      <div className="mt-8">
        <PlayerList players={room.players} hostPlayerId={room.hostPlayerId} />
      </div>

      {/* Game Selection */}
      <div className="mt-8 flex-1">
        <h3 className="text-xl font-bold text-white mb-4">Choose a Game</h3>
        <div className="grid grid-cols-2 gap-4">
          {GAME_CATALOG.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              isSelected={room.selectedGameId === game.id}
              onSelect={() => send({ type: 'select_game', gameId: game.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 4.16: display/src/screens/GameScreen.tsx

```tsx
import { useRoomStore } from '../store/room';
import { GameId, PhaseType } from '@boredless/shared';
import { BBDisplay } from '../games/bluff-battle/BBDisplay';
import { VillageDisplay } from '../games/village/VillageDisplay';
import { Scoreboard } from '../components/Scoreboard';

export function GameScreen() {
  const room = useRoomStore((s) => s.room);
  const phase = useRoomStore((s) => s.phase);
  const gamePublicState = useRoomStore((s) => s.gamePublicState);
  const scores = useRoomStore((s) => s.scores);
  const gameOverResult = useRoomStore((s) => s.gameOverResult);

  if (!room || !phase || !gamePublicState) {
    return <div className="text-white p-8">Loading game...</div>;
  }

  // Game over screen
  if (phase.phaseType === PhaseType.GAME_OVER && gameOverResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
        <h1 className="text-5xl font-bold text-yellow-400">🎉 Game Over!</h1>
        {gameOverResult.winnerName && (
          <h2 className="text-3xl text-white">{gameOverResult.winnerName} wins!</h2>
        )}
        {gameOverResult.winnerTeam && (
          <h2 className="text-3xl text-white">
            {gameOverResult.winnerTeam === 'villagers' ? '🏘️ Village wins!' : '🐺 Werewolves win!'}
          </h2>
        )}
        <Scoreboard scores={gameOverResult.finalScores} />
      </div>
    );
  }

  // Delegate to game-specific display
  switch (room.selectedGameId) {
    case GameId.BLUFF_BATTLE:
      return <BBDisplay phase={phase} publicState={gamePublicState} scores={scores} />;
    case GameId.VILLAGE_OF_SHADOWS:
      return <VillageDisplay phase={phase} publicState={gamePublicState} />;
    default:
      return <div className="text-white p-8">Unknown game</div>;
  }
}
```

### Step 4.17: display/src/games/bluff-battle/BBDisplay.tsx

```tsx
import type { PhaseState, ScoreEntry, BBPublicState } from '@boredless/shared';
import { PhaseType } from '@boredless/shared';
import { Timer } from '../../components/Timer';
import { Scoreboard } from '../../components/Scoreboard';

interface BBDisplayProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
  scores: ScoreEntry[];
}

export function BBDisplay({ phase, publicState, scores }: BBDisplayProps) {
  const state = publicState as unknown as BBPublicState;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
      {/* Round indicator */}
      <div className="text-gray-400 text-lg">
        Round {phase.roundNumber} of {phase.totalRounds}
      </div>

      {/* Phase-specific content */}
      {phase.phaseType === PhaseType.INSTRUCTIONS && (
        <div className="text-center">
          <h1 className="text-5xl font-bold text-indigo-400 mb-4">🎭 Bluff Battle</h1>
          <p className="text-xl text-gray-300">Submit fake answers. Fool your friends. Spot the truth!</p>
          <div className="mt-6"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_PROMPT && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-white">{state.currentPrompt}</h2>
          <p className="text-gray-400 mt-4">Check your phones — submit your best fake answer!</p>
          <div className="mt-6"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_SUBMIT && (
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-4">{state.currentPrompt}</h2>
          <p className="text-2xl text-indigo-400">
            {state.submittedCount}/{state.totalPlayers} submitted
          </p>
          <div className="mt-6"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_VOTING && (
        <div className="text-center w-full max-w-3xl">
          <h2 className="text-2xl font-bold text-white mb-6">{state.currentPrompt}</h2>
          <div className="grid gap-3">
            {state.answers.map((answer, i) => (
              <div key={answer.answerId} className="bg-gray-800 rounded-xl p-4 text-left">
                <span className="text-indigo-400 font-bold mr-3">{String.fromCharCode(65 + i)}.</span>
                <span className="text-white text-lg">{answer.text}</span>
              </div>
            ))}
          </div>
          <p className="text-gray-400 mt-4">{state.votedCount}/{state.totalPlayers} voted</p>
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_REVEAL && state.revealData && (
        <div className="text-center w-full max-w-3xl">
          <h2 className="text-2xl font-bold text-yellow-400 mb-6">The Truth Is Revealed!</h2>
          <div className="grid gap-3">
            {state.revealData.answers.map((answer) => (
              <div
                key={answer.answerId}
                className={`rounded-xl p-4 text-left ${
                  answer.isCorrect
                    ? 'bg-green-900/50 border-2 border-green-500'
                    : 'bg-gray-800'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-lg text-white">{answer.text}</span>
                    {answer.isCorrect && (
                      <span className="ml-2 text-green-400 text-sm">✓ CORRECT ANSWER</span>
                    )}
                    {!answer.isCorrect && answer.submittedByPlayerName && (
                      <span className="ml-2 text-gray-500 text-sm">— {answer.submittedByPlayerName}</span>
                    )}
                  </div>
                </div>
                {answer.voterPlayerNames.length > 0 && (
                  <div className="text-sm text-gray-400 mt-1">
                    Voted by: {answer.voterPlayerNames.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_SCORES && (
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Scores</h2>
          <Scoreboard scores={scores} showRoundScore />
          <div className="mt-4"><Timer /></div>
        </div>
      )}
    </div>
  );
}
```

### Step 4.18: display/src/games/village/VillageDisplay.tsx

```tsx
import type { PhaseState, VillagePublicState } from '@boredless/shared';
import { PhaseType } from '@boredless/shared';
import { Timer } from '../../components/Timer';

interface VillageDisplayProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
}

export function VillageDisplay({ phase, publicState }: VillageDisplayProps) {
  const state = publicState as unknown as VillagePublicState;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
      {/* Day indicator */}
      {phase.phaseType !== PhaseType.VOS_ROLE_REVEAL && (
        <div className="text-gray-400 text-lg">Day {phase.roundNumber}</div>
      )}

      {/* Player grid */}
      <div className="flex flex-wrap gap-3 justify-center max-w-4xl">
        {state.players.map((p) => (
          <div
            key={p.playerId}
            className={`px-4 py-2 rounded-full border-2 ${
              p.isAlive ? '' : 'opacity-30 line-through'
            } ${
              state.eliminatedPlayerId === p.playerId ? 'border-red-500 bg-red-500/20' : ''
            }`}
            style={{
              borderColor: p.isAlive ? p.playerColor : '#4b5563',
              backgroundColor: p.isAlive ? p.playerColor + '22' : 'transparent',
            }}
          >
            <span className={p.isAlive ? 'text-white' : 'text-gray-600'}>{p.playerName}</span>
            {!p.isAlive && <span className="ml-1">💀</span>}
          </div>
        ))}
      </div>

      {/* Phase content */}
      {phase.phaseType === PhaseType.VOS_ROLE_REVEAL && (
        <div className="text-center">
          <h1 className="text-5xl font-bold text-purple-400">🐺 Village of Shadows</h1>
          <p className="text-xl text-gray-300 mt-4">Check your phones — your role has been assigned!</p>
          <div className="mt-6"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_NIGHT && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-blue-300">🌙 Night Falls</h2>
          <p className="text-gray-400 mt-2">The village sleeps... creatures stir in the darkness</p>
          <p className="text-indigo-400 mt-4">
            {state.nightActionsSubmitted}/{state.nightActionsExpected} actions
          </p>
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_NIGHT_RESULT && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-orange-300">☀️ Dawn Breaks</h2>
          <p className="text-xl text-white mt-4">{state.nightResultMessage}</p>
          {state.eliminatedPlayerName && state.eliminatedPlayerRole && (
            <p className="text-gray-400 mt-2">
              They were a <span className="text-white font-bold">{state.eliminatedPlayerRole}</span>
            </p>
          )}
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_DAY && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-yellow-300">☀️ Day Discussion</h2>
          <p className="text-gray-300 mt-2">Discuss who you think the werewolves are!</p>
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_VOTE && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-red-400">🗳️ Village Vote</h2>
          <p className="text-gray-300 mt-2">Vote to eliminate a suspect!</p>
          {state.votes && state.votes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3 justify-center">
              {state.votes.map((v) => (
                <div key={v.targetPlayerId} className="bg-gray-800 rounded-xl px-4 py-2">
                  <span className="text-white font-bold">{v.targetPlayerName}</span>
                  <span className="text-red-400 ml-2">{v.voteCount} votes</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_VOTE_RESULT && (
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">{state.voteResultMessage}</h2>
          {state.eliminatedPlayerName && state.eliminatedPlayerRole && (
            <p className="text-xl text-gray-400 mt-4">
              They were a <span className="text-white font-bold">{state.eliminatedPlayerRole}</span>
            </p>
          )}
          <div className="mt-4"><Timer /></div>
        </div>
      )}
    </div>
  );
}
```

### Step 4.19: display/src/App.tsx

```tsx
import { useState, useEffect } from 'react';
import { useConnectionStore } from './store/connection';
import { useRoomStore } from './store/room';
import { useWebSocketSync } from './hooks/useWebSocket';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { GameScreen } from './screens/GameScreen';
import { RoomStatus } from '@boredless/shared';

type AppScreen = 'home' | 'lobby' | 'game';

export default function App() {
  const [screen, setScreen] = useState<AppScreen>('home');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const room = useRoomStore((s) => s.room);
  const connect = useConnectionStore((s) => s.connect);

  useWebSocketSync();

  // Auto-advance screens based on room status
  useEffect(() => {
    if (!room) return;
    if (room.status === RoomStatus.IN_GAME || room.status === RoomStatus.GAME_STARTING) {
      setScreen('game');
    } else if (room.status === RoomStatus.IN_LOBBY || room.status === RoomStatus.WAITING_FOR_PLAYERS) {
      setScreen('lobby');
    } else if (room.status === RoomStatus.GAME_ENDED) {
      setScreen('game'); // Show game over screen
    }
  }, [room?.status]);

  const handleRoomCreated = (roomId: string, code: string, qrUrl: string) => {
    setQrDataUrl(qrUrl);
    connect(roomId);
    setScreen('lobby');
  };

  return (
    <div className="w-full h-full">
      {screen === 'home' && <HomeScreen onRoomCreated={handleRoomCreated} />}
      {screen === 'lobby' && <LobbyScreen qrDataUrl={qrDataUrl} />}
      {screen === 'game' && <GameScreen />}
    </div>
  );
}
```

### Step 4.20: display/src/main.tsx

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

---

## 8. PHASE 5: PHONE CONTROLLER CLIENT

**NOTE:** For MVP, build the phone client as an **Expo** app. However, since Expo requires
specific setup steps that are environment-dependent, Phase 5 should be structured as follows:

### Step 5.1: Initialize Expo Project

Run these commands from the repository root:

```bash
npx create-expo-app@latest phone --template blank-typescript
```

Then modify `phone/package.json` to add the workspace dependency:

```json
{
  "name": "@boredless/phone",
  "dependencies": {
    "@boredless/shared": "*"
  }
}
```

### Step 5.2: phone/app/_layout.tsx

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#030712' },
      }}
    />
  );
}
```

### Step 5.3: phone/app/index.tsx (Join Screen)

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useConnectionStore } from './store/connection';

export default function JoinScreen() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const connect = useConnectionStore((s) => s.connect);

  const handleJoin = async () => {
    if (!code.trim() || !name.trim()) {
      Alert.alert('Error', 'Enter a room code and your name');
      return;
    }

    setJoining(true);
    try {
      await connect(code.toUpperCase(), name.trim());
      router.replace('/lobby');
    } catch (err) {
      Alert.alert('Error', 'Could not join room');
      setJoining(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Boredless</Text>
      <Text style={styles.subtitle}>Enter the code from the TV</Text>

      <TextInput
        style={styles.codeInput}
        value={code}
        onChangeText={setCode}
        placeholder="ABCD"
        placeholderTextColor="#6b7280"
        maxLength={4}
        autoCapitalize="characters"
        textAlign="center"
      />

      <TextInput
        style={styles.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor="#6b7280"
        maxLength={16}
        textAlign="center"
      />

      <TouchableOpacity
        style={[styles.joinButton, joining && styles.disabled]}
        onPress={handleJoin}
        disabled={joining}
      >
        <Text style={styles.joinText}>{joining ? 'Joining...' : 'Join Game'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#030712' },
  title: { fontSize: 42, fontWeight: 'bold', color: '#818cf8', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#9ca3af', marginBottom: 32 },
  codeInput: { fontSize: 36, fontWeight: 'bold', color: '#fff', backgroundColor: '#1f2937', borderRadius: 16, padding: 16, width: '80%', marginBottom: 16, letterSpacing: 8 },
  nameInput: { fontSize: 20, color: '#fff', backgroundColor: '#1f2937', borderRadius: 16, padding: 16, width: '80%', marginBottom: 24 },
  joinButton: { backgroundColor: '#6366f1', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 48 },
  joinText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  disabled: { opacity: 0.5 },
});
```

### Step 5.4: phone/app/store/connection.ts

```ts
import { create } from 'zustand';
import type { ServerMessage } from '@boredless/shared';
import { ServerMessageType, ClientMessageType } from '@boredless/shared';

// Server URL — configurable for dev vs production
const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3100';
const WS_URL = SERVER_URL.replace(/^http/, 'ws') + '/ws';

interface ConnectionState {
  ws: WebSocket | null;
  connected: boolean;
  sessionId: string | null;
  playerId: string | null;
  reconnectToken: string | null;

  connect: (roomCode: string, playerName: string) => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => void;
  send: (data: Record<string, unknown>) => void;

  listeners: Map<string, Set<(msg: ServerMessage) => void>>;
  on: (type: string, handler: (msg: ServerMessage) => void) => () => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  ws: null,
  connected: false,
  sessionId: null,
  playerId: null,
  reconnectToken: null,
  listeners: new Map(),

  connect: (roomCode, playerName) => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      let resolved = false;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: ClientMessageType.JOIN_ROOM,
          roomCode: roomCode.toUpperCase(),
          playerName,
          preferredColor: null,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;

          // Handle join confirmation
          if (msg.type === ServerMessageType.JOINED && !resolved) {
            const joined = msg as Extract<ServerMessage, { type: 'joined' }>;
            set({
              connected: true,
              sessionId: joined.result.sessionId,
              playerId: joined.result.playerId,
              reconnectToken: joined.result.reconnectToken,
            });
            resolved = true;
            resolve();
          }

          // Handle error
          if (msg.type === ServerMessageType.ERROR && !resolved) {
            const err = msg as Extract<ServerMessage, { type: 'error' }>;
            resolved = true;
            reject(new Error(err.message));
            ws.close();
            return;
          }

          // Dispatch to listeners
          const listeners = get().listeners.get(msg.type);
          if (listeners) {
            for (const handler of listeners) {
              handler(msg);
            }
          }
        } catch (e) {
          console.error('Parse error', e);
        }
      };

      ws.onclose = () => {
        set({ connected: false, ws: null });
        if (!resolved) {
          resolved = true;
          reject(new Error('Connection closed'));
        }
      };

      ws.onerror = () => {
        if (!resolved) {
          resolved = true;
          reject(new Error('Connection failed'));
        }
      };

      set({ ws });
    });
  },

  reconnect: () => {
    const { sessionId, reconnectToken } = get();
    if (!sessionId || !reconnectToken) return Promise.reject(new Error('No session'));

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: ClientMessageType.REJOIN,
          sessionId,
          reconnectToken,
        }));
      };

      // ... same pattern as connect
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;
        if (msg.type === ServerMessageType.JOINED) {
          set({ connected: true });
          resolve();
        }
        const listeners = get().listeners.get(msg.type);
        if (listeners) for (const handler of listeners) handler(msg);
      };

      ws.onclose = () => {
        set({ connected: false, ws: null });
      };

      set({ ws });
    });
  },

  disconnect: () => {
    get().ws?.close();
    set({ ws: null, connected: false, sessionId: null, playerId: null, reconnectToken: null });
  },

  send: (data) => {
    const ws = get().ws;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  },

  on: (type, handler) => {
    const listeners = get().listeners;
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(handler);
    set({ listeners: new Map(listeners) });
    return () => {
      get().listeners.get(type)?.delete(handler);
    };
  },
}));
```

### Step 5.5: phone/app/store/game.ts

```ts
import { create } from 'zustand';
import type { PhaseState } from '@boredless/shared';

interface GameState {
  phase: PhaseState | null;
  privateState: Record<string, unknown> | null;
  timerRemainingMs: number | null;

  setPhase: (phase: PhaseState) => void;
  setPrivateState: (state: Record<string, unknown>) => void;
  setTimer: (ms: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: null,
  privateState: null,
  timerRemainingMs: null,

  setPhase: (phase) => set({ phase }),
  setPrivateState: (state) => set({ privateState: state }),
  setTimer: (ms) => set({ timerRemainingMs: ms }),
  reset: () => set({ phase: null, privateState: null, timerRemainingMs: null }),
}));
```

### Step 5.6: phone/app/lobby.tsx

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useConnectionStore } from './store/connection';
import { useGameStore } from './store/game';
import { ServerMessageType } from '@boredless/shared';

export default function LobbyScreen() {
  const on = useConnectionStore((s) => s.on);
  const setPhase = useGameStore((s) => s.setPhase);
  const setPrivateState = useGameStore((s) => s.setPrivateState);

  useEffect(() => {
    const unsub1 = on(ServerMessageType.GAME_STARTED, (msg) => {
      const m = msg as any;
      setPhase(m.phase);
      router.replace('/game');
    });

    const unsub2 = on(ServerMessageType.PRIVATE_STATE, (msg) => {
      const m = msg as any;
      setPrivateState(m.state);
    });

    const unsub3 = on(ServerMessageType.PHASE_CHANGED, (msg) => {
      const m = msg as any;
      setPhase(m.phase);
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>You're In!</Text>
      <Text style={styles.subtitle}>Waiting for the host to start a game...</Text>
      <Text style={styles.hint}>Look at the big screen 📺</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#030712' },
  title: { fontSize: 36, fontWeight: 'bold', color: '#10b981', marginBottom: 8 },
  subtitle: { fontSize: 18, color: '#9ca3af', textAlign: 'center', marginBottom: 24 },
  hint: { fontSize: 24 },
});
```

### Step 5.7: phone/app/game.tsx

```tsx
import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useConnectionStore } from './store/connection';
import { useGameStore } from './store/game';
import { ServerMessageType, GameId, PhaseType } from '@boredless/shared';
import { BBPhone } from './games/bluff-battle/BBPhone';
import { VillagePhone } from './games/village/VillagePhone';

export default function GameScreen() {
  const on = useConnectionStore((s) => s.on);
  const phase = useGameStore((s) => s.phase);
  const privateState = useGameStore((s) => s.privateState);
  const setPhase = useGameStore((s) => s.setPhase);
  const setPrivateState = useGameStore((s) => s.setPrivateState);
  const setTimer = useGameStore((s) => s.setTimer);

  useEffect(() => {
    const unsubs = [
      on(ServerMessageType.PHASE_CHANGED, (msg: any) => setPhase(msg.phase)),
      on(ServerMessageType.PRIVATE_STATE, (msg: any) => setPrivateState(msg.state)),
      on(ServerMessageType.TIMER_TICK, (msg: any) => setTimer(msg.remainingMs)),
      on(ServerMessageType.INPUT_ACCEPTED, () => { /* Could show confirmation */ }),
      on(ServerMessageType.INPUT_REJECTED, (msg: any) => {
        // Could show error toast
        console.warn('Input rejected:', (msg as any).reason);
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, []);

  if (!phase || !privateState) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  const gameId = (privateState as any).gameId;

  switch (gameId) {
    case 'bluff_battle':
      return <BBPhone phase={phase} privateState={privateState} />;
    case 'village_of_shadows':
      return <VillagePhone phase={phase} privateState={privateState} />;
    default:
      return (
        <View style={styles.container}>
          <Text style={styles.text}>Unknown game</Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#030712' },
  text: { color: '#fff', fontSize: 18 },
});
```

### Step 5.8: phone/app/games/bluff-battle/BBPhone.tsx

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useConnectionStore } from '../../store/connection';
import { useGameStore } from '../../store/game';
import type { PhaseState, BBPrivateState } from '@boredless/shared';
import { PhaseType, ClientMessageType, InputType, BB_MAX_ANSWER_LENGTH } from '@boredless/shared';

interface Props {
  phase: PhaseState;
  privateState: Record<string, unknown>;
}

export function BBPhone({ phase, privateState }: Props) {
  const state = privateState as unknown as BBPrivateState;
  const send = useConnectionStore((s) => s.send);
  const timerMs = useGameStore((s) => s.timerRemainingMs);
  const [answer, setAnswer] = useState('');

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;

  const handleSubmit = () => {
    if (!answer.trim()) return;
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.TEXT,
      payload: { answer: answer.trim() },
    });
    setAnswer('');
  };

  const handleVote = (answerId: string) => {
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.VOTE,
      payload: { answerId },
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {seconds !== null && (
        <Text style={[styles.timer, seconds <= 5 ? styles.timerUrgent : null]}>{seconds}</Text>
      )}

      {/* Submit phase */}
      {phase.phaseType === PhaseType.BB_SUBMIT && !state.hasSubmitted && (
        <View style={styles.section}>
          <Text style={styles.prompt}>{state.prompt}</Text>
          <Text style={styles.hint}>Write a fake answer that could fool others!</Text>
          <TextInput
            style={styles.input}
            value={answer}
            onChangeText={setAnswer}
            placeholder="Your fake answer..."
            placeholderTextColor="#6b7280"
            maxLength={BB_MAX_ANSWER_LENGTH}
            multiline
          />
          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>Submit</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase.phaseType === PhaseType.BB_SUBMIT && state.hasSubmitted && (
        <View style={styles.section}>
          <Text style={styles.title}>✅ Submitted!</Text>
          <Text style={styles.subtitle}>Waiting for others...</Text>
          <Text style={styles.ownAnswer}>Your answer: "{state.ownAnswer}"</Text>
        </View>
      )}

      {/* Voting phase */}
      {phase.phaseType === PhaseType.BB_VOTING && !state.hasVoted && state.voteOptions && (
        <View style={styles.section}>
          <Text style={styles.title}>Which is the REAL answer?</Text>
          {state.voteOptions.map((option) => (
            <TouchableOpacity
              key={option.answerId}
              style={styles.voteOption}
              onPress={() => handleVote(option.answerId)}
            >
              <Text style={styles.voteText}>{option.text}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {phase.phaseType === PhaseType.BB_VOTING && state.hasVoted && (
        <View style={styles.section}>
          <Text style={styles.title}>🗳️ Vote Cast!</Text>
          <Text style={styles.subtitle}>Waiting for others...</Text>
        </View>
      )}

      {/* Waiting/reveal phases */}
      {(phase.phaseType === PhaseType.BB_REVEAL || phase.phaseType === PhaseType.BB_SCORES) && (
        <View style={styles.section}>
          <Text style={styles.title}>Look at the big screen! 📺</Text>
        </View>
      )}

      {phase.phaseType === PhaseType.INSTRUCTIONS && (
        <View style={styles.section}>
          <Text style={styles.title}>🎭 Bluff Battle</Text>
          <Text style={styles.subtitle}>Get ready!</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#030712' },
  section: { width: '100%', alignItems: 'center', gap: 16 },
  timer: { fontSize: 48, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  timerUrgent: { color: '#ef4444' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#9ca3af', textAlign: 'center' },
  prompt: { fontSize: 22, fontWeight: 'bold', color: '#818cf8', textAlign: 'center', marginBottom: 8 },
  hint: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  input: { width: '100%', backgroundColor: '#1f2937', borderRadius: 12, padding: 16, color: '#fff', fontSize: 18, minHeight: 80, textAlignVertical: 'top' },
  button: { backgroundColor: '#6366f1', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  ownAnswer: { fontSize: 14, color: '#6b7280', fontStyle: 'italic' },
  voteOption: { width: '100%', backgroundColor: '#1f2937', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#374151' },
  voteText: { color: '#fff', fontSize: 18 },
});
```

### Step 5.9: phone/app/games/village/VillagePhone.tsx

```tsx
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useConnectionStore } from '../../store/connection';
import { useGameStore } from '../../store/game';
import type { PhaseState, VillagePrivateState } from '@boredless/shared';
import { PhaseType, ClientMessageType, InputType, VillageRole } from '@boredless/shared';
import { getRoleInfo } from './roleInfo';

interface Props {
  phase: PhaseState;
  privateState: Record<string, unknown>;
}

export function VillagePhone({ phase, privateState }: Props) {
  const state = privateState as unknown as VillagePrivateState;
  const send = useConnectionStore((s) => s.send);
  const timerMs = useGameStore((s) => s.timerRemainingMs);

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const roleInfo = getRoleInfo(state.role);

  const handleNightAction = (targetPlayerId: string) => {
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.NIGHT_ACTION,
      payload: { targetPlayerId },
    });
  };

  const handleVote = (targetPlayerId: string) => {
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.VOTE,
      payload: { answerId: targetPlayerId },
    });
  };

  // Dead player view
  if (!state.isAlive) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>💀 You have been eliminated</Text>
        <Text style={styles.subtitle}>You were the {roleInfo.name}</Text>
        <Text style={styles.hint}>Watch the game unfold on the big screen</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Timer */}
      {seconds !== null && (
        <Text style={[styles.timer, seconds <= 5 ? styles.timerUrgent : null]}>{seconds}</Text>
      )}

      {/* Role badge */}
      <View style={[styles.roleBadge, { backgroundColor: roleInfo.color + '33', borderColor: roleInfo.color }]}>
        <Text style={styles.roleEmoji}>{roleInfo.emoji}</Text>
        <Text style={[styles.roleName, { color: roleInfo.color }]}>{roleInfo.name}</Text>
      </View>

      {/* Role reveal */}
      {phase.phaseType === PhaseType.VOS_ROLE_REVEAL && (
        <View style={styles.section}>
          <Text style={styles.title}>Your Role</Text>
          <Text style={styles.description}>{roleInfo.description}</Text>
          {state.werewolfTeammates.length > 0 && (
            <Text style={styles.hint}>Your fellow werewolves are in the room... 🐺</Text>
          )}
        </View>
      )}

      {/* Night phase */}
      {phase.phaseType === PhaseType.VOS_NIGHT && !state.hasActed && state.nightTargets && (
        <View style={styles.section}>
          <Text style={styles.title}>
            {state.role === VillageRole.WEREWOLF && '🐺 Choose a victim'}
            {state.role === VillageRole.SEER && '🔮 Choose who to inspect'}
            {state.role === VillageRole.DOCTOR && '💉 Choose who to protect'}
          </Text>
          {state.nightTargets.map((target) => (
            <TouchableOpacity
              key={target.playerId}
              style={styles.targetButton}
              onPress={() => handleNightAction(target.playerId)}
            >
              <Text style={styles.targetText}>{target.playerName}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {phase.phaseType === PhaseType.VOS_NIGHT && state.hasActed && (
        <View style={styles.section}>
          <Text style={styles.title}>✅ Action submitted</Text>
          <Text style={styles.subtitle}>Waiting for night to end...</Text>
        </View>
      )}

      {phase.phaseType === PhaseType.VOS_NIGHT && state.role === VillageRole.VILLAGER && (
        <View style={styles.section}>
          <Text style={styles.title}>🌙 Night</Text>
          <Text style={styles.subtitle}>You are sleeping... close your eyes 😴</Text>
        </View>
      )}

      {/* Seer result */}
      {state.seerResult && phase.phaseType === PhaseType.VOS_NIGHT_RESULT && (
        <View style={styles.section}>
          <Text style={styles.title}>🔮 Seer Vision</Text>
          <Text style={styles.subtitle}>
            {state.seerResult.targetPlayerName} is{' '}
            {state.seerResult.isWerewolf ? '🐺 a WEREWOLF!' : '✅ NOT a werewolf'}
          </Text>
        </View>
      )}

      {/* Day phase */}
      {phase.phaseType === PhaseType.VOS_DAY && (
        <View style={styles.section}>
          <Text style={styles.title}>☀️ Discussion Time</Text>
          <Text style={styles.subtitle}>Talk to the other players. Who seems suspicious?</Text>
        </View>
      )}

      {/* Vote phase */}
      {phase.phaseType === PhaseType.VOS_VOTE && !state.hasVoted && state.voteTargets && (
        <View style={styles.section}>
          <Text style={styles.title}>🗳️ Vote to Eliminate</Text>
          {state.voteTargets.map((target) => (
            <TouchableOpacity
              key={target.playerId}
              style={styles.targetButton}
              onPress={() => handleVote(target.playerId)}
            >
              <Text style={styles.targetText}>{target.playerName}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {phase.phaseType === PhaseType.VOS_VOTE && state.hasVoted && (
        <View style={styles.section}>
          <Text style={styles.title}>🗳️ Vote Cast!</Text>
          <Text style={styles.subtitle}>Waiting for results...</Text>
        </View>
      )}

      {/* Result phases */}
      {(phase.phaseType === PhaseType.VOS_NIGHT_RESULT ||
        phase.phaseType === PhaseType.VOS_VOTE_RESULT) && !state.seerResult && (
        <View style={styles.section}>
          <Text style={styles.title}>Look at the big screen! 📺</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#030712' },
  section: { width: '100%', alignItems: 'center', gap: 12 },
  timer: { fontSize: 48, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  timerUrgent: { color: '#ef4444' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#9ca3af', textAlign: 'center' },
  description: { fontSize: 14, color: '#d1d5db', textAlign: 'center', paddingHorizontal: 16 },
  hint: { fontSize: 14, color: '#6b7280', fontStyle: 'italic' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 2, marginBottom: 16 },
  roleEmoji: { fontSize: 24 },
  roleName: { fontSize: 16, fontWeight: 'bold' },
  targetButton: { width: '100%', backgroundColor: '#1f2937', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#374151' },
  targetText: { color: '#fff', fontSize: 18, textAlign: 'center' },
});
```

### Step 5.10: phone/app/games/village/roleInfo.ts

```ts
import { VillageRole } from '@boredless/shared';

interface RoleDisplayInfo {
  name: string;
  description: string;
  emoji: string;
  color: string;
}

export function getRoleInfo(role: VillageRole): RoleDisplayInfo {
  switch (role) {
    case VillageRole.VILLAGER:
      return {
        name: 'Villager',
        description: 'Find and eliminate the werewolves through discussion and voting. Trust your instincts!',
        emoji: '🏘️',
        color: '#10b981',
      };
    case VillageRole.WEREWOLF:
      return {
        name: 'Werewolf',
        description: 'Each night, choose a villager to eliminate. During the day, blend in and avoid suspicion.',
        emoji: '🐺',
        color: '#ef4444',
      };
    case VillageRole.SEER:
      return {
        name: 'Seer',
        description: 'Each night, inspect one player to learn if they are a werewolf. Use your knowledge wisely.',
        emoji: '🔮',
        color: '#8b5cf6',
      };
    case VillageRole.DOCTOR:
      return {
        name: 'Doctor',
        description: 'Each night, choose one player to protect. If the werewolves target them, they survive.',
        emoji: '💉',
        color: '#3b82f6',
      };
  }
}
```

---

## 9. PHASE 8: INTEGRATION & POLISH

### Step 8.1: README.md

```markdown
# Boredless

Social gaming platform — TV displays public game state, phones act as controllers.

## Quick Start

```bash
# Install all dependencies
npm install

# Build shared types
npm run build:shared

# Start development (server + display)
npm run dev

# In another terminal, start phone client
npm run dev:phone
```

## Architecture

- `packages/shared` — TypeScript types, enums, constants shared across all packages
- `server` — Fastify + WebSocket game server (port 3100)
- `display` — Vite React SPA for TV/shared screen (port 5173)
- `phone` — Expo React Native app for phone controllers

## Games

1. **Bluff Battle** — Submit fake answers, vote for the truth, fool your friends
2. **Village of Shadows** — Hidden roles, night actions, village voting
```

### Step 8.2: Sound Effects

For MVP, create placeholder sound files. The display client references these files in
`display/src/sounds/`. Create empty .mp3 files (or use free sound effects from freesound.org):

- `join.mp3` — Player join chime
- `countdown.mp3` — Timer countdown beep
- `reveal.mp3` — Answer reveal fanfare
- `vote.mp3` — Vote confirmation click
- `eliminate.mp3` — Elimination dramatic sound
- `victory.mp3` — Victory celebration

**For MVP, sounds are optional. The components reference them but can be implemented later.**

### Step 8.3: Environment Variables

Create `.env.example` in the repository root:

```env
# Server
PORT=3100
HOST=0.0.0.0
BASE_URL=http://localhost:3100
CORS_ORIGINS=http://localhost:5173,http://localhost:8081

# Phone (Expo)
EXPO_PUBLIC_SERVER_URL=http://localhost:3100
```

---

## 12. APPENDIX A: COMPLETE API REFERENCE

### REST Endpoints

| Method | Path              | Description             | Request Body | Response                      |
|--------|-------------------|-------------------------|-------------|-------------------------------|
| GET    | /api/health       | Health check            | None        | `{ status: "ok", timestamp }` |
| POST   | /api/rooms        | Create new room         | None        | `{ roomId, code, qrDataUrl }` |
| GET    | /api/rooms/:code  | Get room info           | None        | `{ code, status, playerCount, maxPlayers, hostName }` |

### WebSocket Endpoint

`GET /ws` — Upgrade to WebSocket connection

---

## 13. APPENDIX B: WEBSOCKET MESSAGE REFERENCE

### Client → Server Messages

| Type           | Fields                                          | When                          |
|----------------|------------------------------------------------|-------------------------------|
| join_room      | roomCode, playerName, preferredColor            | Phone connecting to room      |
| rejoin         | sessionId, reconnectToken                       | Phone reconnecting            |
| join_display   | roomId                                          | Display connecting to room    |
| select_game    | gameId                                          | Host selecting game (lobby)   |
| start_game     | (none)                                          | Host starting game            |
| submit_input   | inputType, payload                              | Player submitting game input  |
| kick_player    | playerId                                        | Host kicking a player         |
| return_to_lobby| (none)                                          | Host returning to lobby       |
| close_room     | (none)                                          | Host closing room             |
| ping           | timestamp                                       | Heartbeat                     |

### Server → Client Messages

| Type            | Fields                                         | When                          |
|-----------------|------------------------------------------------|-------------------------------|
| joined          | result: { sessionId, playerId, reconnectToken, room } | After successful join  |
| room_state      | room, phase, gamePublicState                    | Full state sync               |
| player_joined   | playerId, playerName, playerColor, playerCount  | New player joined             |
| player_left     | playerId, playerName, playerCount               | Player disconnected           |
| player_kicked   | playerId, playerName                            | Player was kicked             |
| game_selected   | gameId, gameName                                | Host selected a game          |
| game_started    | gameId, phase, gamePublicState                  | Game has started              |
| phase_changed   | phase, gamePublicState                          | Phase transition              |
| timer_tick      | remainingMs                                     | Timer countdown (every 1s)    |
| timer_expired   | phaseType                                       | Timer reached zero            |
| input_accepted  | inputType                                       | Player input was valid        |
| input_rejected  | inputType, reason                               | Player input was invalid      |
| private_state   | state                                           | Player-specific private data  |
| score_update    | scores[]                                        | Score change                  |
| game_over       | result: { winnerId, winnerName, winnerTeam, finalScores, gameId } | Game ended |
| room_closed     | reason                                          | Room was closed               |
| error           | code, message                                   | Error occurred                |
| pong            | timestamp, serverTime                           | Heartbeat response            |

---

## 15. APPENDIX D: ENVIRONMENT & DEPLOYMENT

### Development Setup

1. Clone the repository
2. Run `npm install` from root
3. Build shared types: `npm run build:shared`
4. Start server: `npm run dev:server` (port 3100)
5. Start display: `npm run dev:display` (port 5173, proxies to 3100)
6. Start phone: `npm run dev:phone` (Expo dev server)
7. Open display in browser: http://localhost:5173
8. Click "Create Room"
9. On phone: open Expo Go or web browser, enter room code

### Production Build

```bash
npm run build
# Server: node server/dist/index.js
# Display: serve display/dist/ with any static file server (nginx, caddy, etc.)
# Phone: expo build (EAS)
```

### Deployment Options

- **Server:** Any VPS, container, or machine with Node.js 20+
- **Display:** Any static file host (Cloudflare Pages, Vercel, Netlify, Nginx, S3)
- **Phone:** App Store / Play Store via Expo EAS, or web fallback

### Nginx Example (Display)

```nginx
server {
    listen 80;
    server_name play.boredless.com;

    location / {
        root /var/www/boredless/display/dist;
        try_files $uri /index.html;
    }

    location /api {
        proxy_pass http://localhost:3100;
    }

    location /ws {
        proxy_pass http://localhost:3100;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## IMPLEMENTATION ORDER (FOR AGENT)

Execute phases in EXACTLY this order. Do NOT skip ahead.

1. **Phase 1** — Create all config files (package.json, tsconfig, etc.)
2. **Phase 2** — Build `@boredless/shared` package, run `npm run build:shared`
3. **Phase 3** — Build server, verify it starts with `npm run dev:server`
4. **Phase 4** — Build display client, verify it renders with `npm run dev:display`
5. **Phase 5** — Build phone client (or web equivalent)
6. **Phase 8** — Integration testing and polish

### Verification Checkpoints

After each phase, verify:

- **Phase 2:** `npm run build:shared` succeeds with no errors
- **Phase 3:** `npm run dev:server` starts, `curl http://localhost:3100/api/health` returns OK
- **Phase 4:** `npm run dev:display` opens in browser, create room works
- **Phase 5:** Phone app connects, enters room code, appears in lobby
- **End-to-end:** Create room → join from phone → start Bluff Battle → play full round

---

*END OF BUILD SPECIFICATION*
*This document is the single source of truth. Follow it mechanically.*
