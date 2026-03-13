# Cards Against Humanity — Game Module Requirements

## Overview
A digital Cards Against Humanity implementation for the Boredless platform. Uses the official open-source card data (CC BY-NC-SA 4.0). Players use their phones as controllers, TV displays the shared game state.

## Card Data
- **Source:** https://raw.githubusercontent.com/crhallberg/json-against-humanity/latest/cah-all-full.json
- **Format:** Array of packs. Each pack has `name`, `white` (response cards), `black` (prompt cards)
- **Black cards** have `text` (with `_` for blanks) and `pick` (number of white cards to play, default 1)
- **White cards** have `text` (the response)
- **Initial launch:** Use "CAH Base Set" only. Other packs can be added later as expansion options.
- Download and store locally at `games/cards-against/data/cards.json` — pre-process into a clean format:
  ```ts
  interface CardData {
    black: { text: string; pick: number }[];
    white: { text: string }[];
  }
  ```

## Game Flow

### Phase 1: DEAL (`cah_deal`)
- Each player is dealt 10 white cards (their "hand")
- The first Card Czar is randomly chosen
- Duration: instant (no timer, auto-advance)

### Phase 2: PROMPT (`cah_prompt`)
- Draw a black card and display it on TV
- Card Czar sees "You're the Card Czar — sit back and wait"
- All other players see their hand and must pick card(s) matching the `pick` count
- Duration: 60 seconds
- If `pick > 1`, players must select that many cards in order
- Auto-advance when all non-czar players have submitted

### Phase 3: READING (`cah_reading`)
- TV shows the black card with all submitted answers (anonymized, shuffled)
- Card Czar's phone shows all submissions and they tap to pick the winner
- Other players see "Card Czar is choosing..." on their phones
- Duration: 60 seconds
- Advance when Card Czar picks winner

### Phase 4: REVEAL (`cah_reveal`)
- TV shows winning answer highlighted, who played it
- Winner gets 1 Awesome Point
- All answers revealed with who played them
- Duration: 8 seconds

### Phase 5: SCORES (`cah_scores`)
- Standard platform scoreboard
- Duration: 6 seconds
- After scores: rotate Card Czar to next player, go back to PROMPT
- Players draw back up to 10 cards (replenish what they played)

### Game End
- Play continues for a set number of rounds (default: 10 rounds, configurable)
- OR first to X points wins (future option)
- After final round → GAME_OVER with final scoreboard

## Scoring
- **Winning answer selected by Czar:** 1000 points (1 Awesome Point)
- That's it. Simple.

## Player Counts
- **Min:** 3 (1 czar + 2 players minimum)
- **Max:** 8

## Phone UI

### Hand View (PROMPT phase, non-czar)
- Show all white cards in hand as a scrollable list/grid
- Selected card(s) highlighted with order number if `pick > 1`
- Submit button at bottom (disabled until correct number selected)
- Timer bar at top (thin, consistent with other games)
- Show the black card text at top so players can read it while choosing

### Czar View (PROMPT phase)
- Show black card
- "You're the Card Czar" badge
- "Waiting for players to submit..." with progress (3/5 submitted)

### Czar Judging (READING phase)
- Show each submission as a card they can tap
- "Pick the funniest answer"
- Selected answer highlighted, confirm button

### Waiting View
- "Card Czar is judging..." with animation
- Maybe show the submissions on phone too (read-only)

### Post-Submit
- "Answer submitted!" with checkmark
- Show what they played

## TV Display

### PROMPT Phase
- Large black card text in center
- Blank slots shown as `________`
- Progress: "3/5 players submitted"
- Timer bar at top
- Card Czar name shown: "Card Czar: PlayerName"

### READING Phase
- Black card at top
- All submitted white card answers displayed as cards below
- Lettered (A, B, C...) for reference
- Clean card-like styling — white cards should look like actual white cards (white bg, dark text, rounded)

### REVEAL Phase
- Winning answer highlighted (green glow / animation)
- "Winner: PlayerName" shown
- Other answers fade slightly
- +1000 points animation

### SCORES Phase
- Standard leaderboard (reuse ScoreList pattern from Bluff Battle)
- "Awesome Points" instead of just "Points" for flavor

## Visual Style
- **Accent color:** neutral/white — the cards themselves are the visual identity
- **Black cards:** Dark background (#000 or very dark), white bold text, rounded corners
- **White cards:** White/off-white background, dark text, rounded corners, slight shadow
- **Overall:** Dark theme consistent with platform, but cards pop with contrast
- **Icon:** `layers` from lucide-react

## File Structure (MUST follow exactly)
```
games/cards-against/
├── manifest.yaml
├── index.ts              # exports createModule()
├── types.ts              # CAH-specific types
├── phases.ts             # Phase constants
├── constants.ts          # Game constants (hand size, timers, points)
├── data/
│   └── cards.json        # Pre-processed card data
├── server/
│   ├── index.ts          # CAHModule implements GameModule
│   ├── deck.ts           # Card deck management (shuffle, draw, discard)
│   └── scoring.ts        # Simple scoring logic
├── display/
│   └── CAHDisplay.tsx    # TV component
└── phone/
    └── CAHPhone.tsx      # Phone controller component
```

## Platform Integration

### Imports (follow Bluff Battle pattern exactly)
- Server: `import type { GameModule } from '@game-platform/game-module.js'`
- Server: `import type { GameContext } from '@game-platform/game-context.js'`
- Server: `import { PhaseType, InputType, ServerMessageType, RoomStatus } from '@boredless/shared'`
- Display: `import type { DisplayProps } from '@display/games/types'`
- Phone: `import type { PhoneProps } from '@phone/games/types'`
- Phone: `import { PoweredByLogo } from '@phone/components/PoweredByLogo'`

### Input Types
- **`InputType.VOTE`** — Used for both card selection (player submitting cards) AND czar picking winner
  - Player submission: `{ answerId: string[] }` (array of card IDs from hand)
  - Czar pick: `{ answerId: string }` (single submission ID)
- Distinguish by phase: PROMPT phase = player submission, READING phase = czar pick

### Key Platform Patterns (from Bluff Battle reference)
1. `setup()` → init scores, set room status, broadcast GAME_STARTED, send private states, start timer
2. `broadcastPhase()` for every phase transition
3. `broadcastPrivateState()` with per-player function for personalized hands
4. `broadcastScores()` during score phase
5. `broadcastGameOver()` at end
6. Timers: `startTimer()` / `stopTimer()` — always stop before starting new one
7. Guard against double-calls on phase transitions

### manifest.yaml
```yaml
id: cards-against
name: Cards Against Humanity
tagline: A party game for horrible people
description: >
  One player draws a black prompt card. Everyone else plays their funniest
  white response card. The Card Czar picks the winner. Repeat until
  someone loses all their dignity.
players:
  min: 3
  max: 8
estimatedMinutes: 15
icon: layers
accentColor: neutral
categories: [party, humor, cards]
phases:
  deal:
    duration: 0
  prompt:
    duration: 60
  reading:
    duration: 60
  reveal:
    duration: 8
  scores:
    duration: 6
scoring:
  awesome_point: 1000
```

## Important Notes
- Cards Against Humanity content is NSFW/adult. This is expected and correct — it's the actual game.
- The game is free (matches CAH's open-source license: CC BY-NC-SA 4.0)
- Card text must be used exactly as provided — don't censor or modify
- The `_` in black card text represents where white card text gets inserted
- Some black cards have `pick: 2` or `pick: 3` — handle these correctly
- When displaying filled-in answers on TV, replace `_` with the white card text (styled differently)

## Reference Files
The sub-agent MUST read these files to understand the full platform architecture:
- `games/bluff-battle/server/index.ts` — Complete server module reference
- `games/bluff-battle/display/BBDisplay.tsx` — Display component reference
- `games/bluff-battle/phone/BBPhone.tsx` — Phone component reference
- `games/bluff-battle/types.ts` — Type definitions reference
- `server/src/games/game-module.ts` — GameModule interface
- `server/src/games/game-context.ts` — GameContext interface
- `packages/shared/src/enums.ts` — All shared enums
- `phone/src/games/types.ts` — PhoneProps interface
- `display/src/games/types.ts` — DisplayProps interface
