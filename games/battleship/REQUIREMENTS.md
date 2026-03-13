# Battleship — Game Module Requirements

## Overview
A digital Battleship implementation for the Boredless platform. Classic two-player naval strategy — each player secretly places ships on their grid, then takes turns firing shots to sink the opponent's fleet. Phones are private controllers (own grid + targeting), TV display shows both grids side by side.

**This is a 2-player game.** The platform supports rooms with more players, but Battleship is 1v1. Min and max players: 2.

## Game Flow

### Phase 1: SETUP (`bs_setup`)
- Each player places their fleet on a 10×10 grid
- Phone shows their grid with drag/drop ship placement
- Ships can be rotated (horizontal/vertical) via a rotate button
- Ships cannot overlap or go out of bounds
- "Ready" button when all ships are placed
- Duration: 120 seconds (auto-place randomly if timer expires)
- Auto-advance when both players are ready
- TV display shows "Players are positioning their fleets..." with a status indicator per player (ready/not ready)

### Fleet (standard Battleship):
| Ship | Size |
|------|------|
| Carrier | 5 |
| Battleship | 4 |
| Cruiser | 3 |
| Submarine | 3 |
| Destroyer | 2 |

### Phase 2: BATTLE (`bs_battle`)
- Players alternate turns firing at the opponent's grid
- Active player's phone shows opponent's grid (fog of war) with previous hits/misses marked
- Active player taps a cell to fire → result: HIT or MISS
- When all cells of a ship are hit → SUNK (announce which ship)
- Duration per turn: 30 seconds (random shot if timer expires)
- TV display: shows both grids side by side
  - Left grid: Player 1's ocean (shows their ships + opponent's hits/misses on them)
  - Right grid: Player 2's ocean (same)
  - Active player indicated with glow/highlight on their name
  - Hits shown as red, misses as white/gray, sunk ships fully revealed
- Inactive player sees their own grid (with incoming hits) and "Waiting for opponent..."

### Phase 3: RESULT (`bs_result`)
- Triggered when one player's entire fleet is sunk
- TV shows "VICTORY" with winner's name and both final grids revealed
- Duration: 8 seconds
- Then → SCORES → GAME_OVER

### Phase 4: SCORES (`bs_scores`)
- Standard platform scoreboard
- Winner gets points, loser gets consolation points based on hits landed
- Duration: 6 seconds
- Then → GAME_OVER

### Game End
- Single round game (no multi-round). One battle = one game.
- After SCORES → GAME_OVER with final scoreboard

## Scoring
- **Sinking a ship:** 200 points per ship sunk (regardless of ship size)
- **Winning the game:** 1000 bonus points
- **Each hit:** 50 points
- This means the winner gets: (5 ships × 200) + 1000 + (hits × 50) = 2000 + hit bonus
- Loser gets: (ships sunk × 200) + (hits × 50)

## Player Count
- **Min:** 2
- **Max:** 2

## Grid System
- 10×10 grid, columns labeled A-J, rows labeled 1-10
- Cells identified as `"A1"`, `"B5"`, `"J10"`, etc.
- Internal representation: `{ row: number, col: number }` (0-indexed)
- Display: convert to letter+number for UI (`col 0 = A`, `row 0 = 1`)

## Types

```ts
/** Ship definition */
interface Ship {
  id: string;          // 'carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'
  name: string;        // Display name
  size: number;
}

/** Placed ship on a grid */
interface PlacedShip {
  shipId: string;
  cells: string[];     // Array of cell IDs, e.g. ["A1", "A2", "A3"]
  hits: string[];      // Cells that have been hit
  sunk: boolean;
}

/** Cell state for display */
type CellState = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk';

/** A single shot record */
interface Shot {
  cell: string;        // e.g. "B5"
  result: 'hit' | 'miss';
  sunkShip?: string;   // Ship ID if this shot sunk a ship
}

/** Player's board state */
interface PlayerBoard {
  ships: PlacedShip[];
  incomingShots: Shot[];  // Shots the opponent has fired at this board
}

/** Public state for display */
interface BSPublicState {
  gameId: 'battleship';
  player1: { playerId: string; playerName: string; board: DisplayBoard };
  player2: { playerId: string; playerName: string; board: DisplayBoard };
  activePlayerId: string;  // Whose turn it is
  lastShot: { playerId: string; cell: string; result: 'hit' | 'miss'; sunkShip?: string } | null;
  turnNumber: number;
}

/** Board as shown on TV — ships visible only where hit/sunk */
interface DisplayBoard {
  hits: string[];       // Cells with hits
  misses: string[];     // Cells with misses
  sunkShips: PlacedShip[];  // Fully sunk ships (revealed)
  shipsRemaining: number;   // How many ships still afloat
}

/** Private state for phone */
interface BSPrivateState {
  gameId: 'battleship';
  phase: string;
  isActivePlayer: boolean;
  myBoard: {
    ships: PlacedShip[];      // Full ship positions (own ships always visible)
    incomingShots: Shot[];    // Where opponent has fired
  };
  opponentBoard: {
    hits: string[];           // My successful hits on opponent
    misses: string[];         // My misses on opponent
    sunkShips: PlacedShip[];  // Ships I've sunk (revealed)
  };
  // Setup phase only
  availableShips?: Ship[];    // Ships not yet placed
  placedShips?: PlacedShip[]; // Ships placed so far
  isReady?: boolean;
}
```

## Phone UI

### Setup Phase (Ship Placement)
- 10x10 grid filling most of the screen
- Grid cells are tappable
- Ship tray at bottom showing unplaced ships (silhouettes with size labels)
- Tap a ship in the tray to select it, then tap a grid cell to place starting position
- Rotate button to toggle horizontal/vertical before placing
- Already-placed ships shown on grid in player's color
- Tap a placed ship to pick it up (move it)
- "Ready!" button at bottom — disabled until all 5 ships are placed
- Timer bar at top
- Grid should have letter labels (A-J) on top and number labels (1-10) on left

### Battle Phase — Active Player (Your Turn)
- Show opponent's grid (fog of war view)
- Previous hits marked red, misses marked with dot
- Sunk ships fully revealed on the grid
- Tap a cell to target, "FIRE!" button to confirm
- Selected cell highlighted before confirming
- Timer bar at top ("Your Turn! 25s")
- Small view of own board at bottom (thumbnail) showing where you've been hit

### Battle Phase — Inactive Player (Waiting)
- Show own board with hits/misses from opponent
- "Waiting for opponent..." indicator
- Can review the game state but can't act

### Result Phase
- Winner: celebration animation, "You Won!"
- Loser: "Defeated" with score summary

## TV Display

### Setup Phase
- Split screen or centered message
- "Players are positioning their fleets..."
- Player 1: Ready / Placing ships status
- Player 2: Ready / Placing ships status
- Timer bar at top

### Battle Phase
- Two 10x10 grids side by side
- Left: Player 1's board (their ships visible where hit/sunk, incoming shots shown)
- Right: Player 2's board (same)
- Active player's grid has a glowing border or highlighted name
- Grid labels: A-J columns, 1-10 rows
- Hit animation when a shot lands (brief red flash)
- "Player1's turn" indicator above the grids
- Color coding:
  - Water/empty: dark blue/navy
  - Miss: white circle on dark cell
  - Hit: red/orange marker
  - Sunk ship: full ship shape revealed in gray/red
- Status bar below grids: ship status per player (which ships sunk/alive)
- Last shot callout: "B5 — HIT!" or "G8 — Miss" (brief animation)
- Turn counter: "Turn 14"

### Result Phase
- Winner announcement with large text
- Both grids fully revealed (all ships visible)
- Winner's grid highlighted/glowing
- Score summary

### Scores Phase
- Standard leaderboard (reuse ScoreList pattern)

## Visual Style
- **Accent color:** Navy/ocean blue — nautical theme
- **Grid:** Dark navy background, lighter grid lines, cells clearly delineated
- **Ships:** Solid colored blocks (player color) on the grid
- **Water:** Deep blue/dark
- **Hits:** Bright red/orange
- **Misses:** White/gray splash marker
- **Overall:** Dark theme consistent with platform, military/naval aesthetic
- **Icon:** `anchor` from lucide-react

## Input Types
- **`InputType.CONFIRM`** — Used during setup phase for ship placement
  - Payload: `{ ships: PlacedShip[] }` — all 5 ships with their cell positions
  - Sent when player taps "Ready!"
- **`InputType.VOTE`** — Used during battle phase for firing shots
  - Payload: `{ cell: string }` — target cell, e.g. "B5"
  - Sent when active player taps "FIRE!"

## Ship Placement Validation (Server-Side)
The server MUST validate all ship placements:
1. Exactly 5 ships placed (one of each type)
2. Each ship occupies the correct number of cells for its size
3. Ship cells are contiguous and in a straight line (horizontal or vertical)
4. No ships overlap (no shared cells)
5. All cells within bounds (A-J, 1-10)
6. If validation fails, reject and send error back to phone

## Random Placement Algorithm
Used when timer expires and player hasn't finished placing:
1. For each ship (largest first): try random position + orientation
2. Check no overlap with already-placed ships
3. Check within bounds
4. Retry up to 100 times per ship (grid is sparse enough this always works)

## Turn Management
- Random player goes first
- After each shot, turn passes to the other player
- If active player's timer expires, fire at a random un-targeted cell
- Server tracks all shots to prevent duplicate targeting (phone should gray out already-fired cells)

## File Structure (MUST follow exactly)
```
games/battleship/
├── REQUIREMENTS.md
├── manifest.yaml
├── index.ts              # exports createModule()
├── types.ts              # Battleship-specific types
├── phases.ts             # Phase constants
├── constants.ts          # Game constants (timers, points, fleet config)
├── server/
│   ├── index.ts          # BattleshipModule implements GameModule
│   ├── board.ts          # Board/grid logic, ship placement, validation
│   └── scoring.ts        # Scoring logic
├── display/
│   └── BSDisplay.tsx     # TV component
└── phone/
    └── BSPhone.tsx       # Phone controller component
```

## Platform Integration

### Imports (follow Bluff Battle pattern exactly)
- Server: `import type { GameModule } from '@game-platform/game-module.js'`
- Server: `import type { GameContext } from '@game-platform/game-context.js'`
- Server: `import { PhaseType, InputType, ServerMessageType, RoomStatus } from '@boredless/shared'`
- Display: `import type { DisplayProps } from '@display/games/types'`
- Phone: `import type { PhoneProps } from '@phone/games/types'`

### Key Platform Patterns (from Bluff Battle reference)
1. `setup()` → init scores, set room status, broadcast GAME_STARTED, send private states, start timer
2. `broadcastPhase()` for every phase transition
3. `broadcastPrivateState()` with per-player function for personalized boards
4. `broadcastScores()` during score phase
5. `broadcastGameOver()` at end
6. Timers: `startTimer()` / `stopTimer()` — always stop before starting new one
7. Guard against double-calls on phase transitions

### manifest.yaml
```yaml
id: battleship
name: Battleship
tagline: You sunk my battleship!
description: >
  Place your fleet, call your shots, and sink the enemy.
  Classic naval warfare — two captains, one ocean, no mercy.
players:
  min: 2
  max: 2
estimatedMinutes: 15
icon: anchor
accentColor: blue
categories: [strategy, classic, two-player]
phases:
  setup:
    duration: 120
  battle:
    duration: 30
  result:
    duration: 8
  scores:
    duration: 6
scoring:
  ship_sunk: 200
  hit: 50
  victory_bonus: 1000
```

## UI Component Patterns (CRITICAL — follow these from existing games)

### Phone Cards/Elements — DO NOT stretch to fill viewport
- Use `aspect-[3/4]` for card-shaped elements
- Use `max-w-xs mx-auto` to constrain grids/containers
- Use `auto-rows-min` on grids — NOT `flex-1`
- Grid cells should be square: use `aspect-square` on each cell

### Display (TV) — Constrain content width
- Main content area: `max-w-5xl mx-auto` or similar
- Grids should be fixed-size, not `w-full`
- Use `gap-8` or `gap-10` between the two player grids

### Styling Consistency
- Dark background: `bg-gray-950` or `bg-[#0a0a1a]`
- Timer bar: thin bar at top (reuse TimerBar pattern from other games)
- Score display: reuse ScoreList from platform
- Rounded corners: `rounded-2xl` for cards, `rounded-lg` for grid cells
- Transitions: `transition-all duration-150` for interactive elements

## Important Notes
- This is a 2-player only game — enforce min/max 2
- Ship placement is the most complex UI piece — focus on making it intuitive on mobile
- Grid must be large enough to tap accurately on phone (minimum 32px per cell)
- The server is authoritative — all hit/miss/sunk calculations happen server-side
- Phone never sees opponent's ship positions until they're sunk
- Display shows ships only where hit or sunk (fog of war for TV audience adds suspense)
- Consider colorblind accessibility: don't rely solely on red/green, use shapes/icons too

## Reference Files
The sub-agent MUST read these files to understand the full platform architecture:
- `games/bluff-battle/server/index.ts` — Complete server module reference
- `games/bluff-battle/display/BBDisplay.tsx` — Display component reference
- `games/bluff-battle/phone/BBPhone.tsx` — Phone component reference
- `games/bluff-battle/types.ts` — Type definitions reference
- `games/cards-against/display/CAHDisplay.tsx` — Display with grid layout reference
- `games/cards-against/phone/CAHPhone.tsx` — Phone with card selection reference
- `server/src/games/game-module.ts` — GameModule interface
- `server/src/games/game-context.ts` — GameContext interface
- `packages/shared/src/enums.ts` — All shared enums
- `phone/src/games/types.ts` — PhoneProps interface
- `display/src/games/types.ts` — DisplayProps interface
