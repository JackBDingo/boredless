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
- `phone` — Vite React SPA for phone controllers (port 5174)

## Games

1. **Bluff Battle** — Submit fake answers, vote for the truth, fool your friends
2. **Village of Shadows** — Hidden roles, night actions, village voting

## How to Play

### Setup
1. Open the display client on a TV or shared screen (`npm run dev:display`)
2. Click **Create Room** — a QR code appears
3. Each player scans the QR code on their phone (or opens the phone URL)
4. Enter your name and join

### Bluff Battle
- Each round, players see a trivia question and submit a fake (but convincing) answer
- All answers (fakes + the real one) are displayed anonymously
- Players vote for which answer they think is correct
- **Score 1000 pts** for picking the correct answer
- **Score 500 pts** for each player you fool into picking your fake
- 3 rounds, highest score wins

### Village of Shadows
- Players are secretly assigned roles: Werewolf, Seer, Doctor, or Villager
- **Night phase**: Werewolves pick a victim; Seer inspects a player; Doctor protects someone
- **Day phase**: Village discusses and votes to eliminate a suspect
- Werewolves win if they equal or outnumber villagers
- Villagers win if all werewolves are eliminated

## Development

```bash
# Run all tests
npm test

# Run shared package tests
npm test --workspace=packages/shared

# Run server tests (includes E2E)
npm test --workspace=server

# Build all packages
npm run build
```

## API Reference

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/rooms` | Create a new room |
| GET | `/api/rooms/:code` | Get room info by code |

### WebSocket

Connect to `ws://localhost:3100/ws`

See `packages/shared/src/types/messages.ts` for full message protocol.

## Project Structure

```
boredless/
├── packages/
│   └── shared/          # Shared types, constants, validation
├── server/              # Fastify game server (port 3100)
├── display/             # TV display client (port 5173)
├── phone/               # Phone controller client (port 5174)
├── BUILD_SPEC.md        # Architecture and implementation details
├── TESTS.md             # Test specifications
└── CHECKLIST.md         # Build progress tracker
```
