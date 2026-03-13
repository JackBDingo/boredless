# Scoring & Victory System

**Phase:** 4.3 — Scoring & Victory (Declarative)  
**Status:** Complete  
**Location:** `server/src/runtime/scoring-system/`

---

## Purpose

The Scoring & Victory System makes game scoring fully declarative: all points, score tracks, win conditions, and tiebreak rules are defined in the game schema (YAML/JSON), not in TypeScript.

This replaces the V1 pattern where each game had bespoke scoring functions (e.g. `calculateBBScores()` in `games/bluff-battle/server/scoring.ts`).

---

## Quick Start

```yaml
# game.yaml — scoring section
scoring:
  tracks:
    - id: points
      name: "Points"
      initial: 0
      direction: higher-better
      display:
        suffix: " pts"
        icon: "⭐"

    - id: lives
      name: "Lives"
      initial: 3
      min: 0
      direction: lower-better
      display:
        icon: "❤️"

  rules:
    - id: correct_answer
      name: "Correct Answer"
      track: points
      trigger: manual
      targets: specific
      formula:
        type: expression
        expr: "10 * round"

    - id: wrong_answer
      track: lives
      trigger: manual
      targets: specific
      formula:
        type: fixed
        amount: -1

  victory:
    type: round_limit
    maxRounds: 10
    thenBy: highest_score
    track: points

  tiebreak:
    method: secondary_track
    track: lives
```

---

## File Structure

```
scoring-system/
  index.ts              — Public API (import from here only)
  types.ts              — All TypeScript interfaces
  score-manager.ts      — ScoreManager class
  formula-evaluator.ts  — Safe arithmetic expression parser (no eval())
  victory-evaluator.ts  — Victory condition + tiebreak logic
  schema-integration.ts — Zod validation schemas
  README.md             — This file
  DECISIONS.md          — Architecture decisions
  __tests__/
    scoring-system.test.ts — 66 tests covering all functionality
```

---

## API Reference

### ScoreManager

The main entry point for runtime scoring.

```ts
import { ScoreManager } from './scoring-system/index.js';

const manager = new ScoreManager(scoringConfig, ['player1', 'player2']);

// Read scores
manager.getScore('player1', 'points');          // → number
manager.getAllScores('player1');                 // → { points: 0, lives: 3 }
manager.getTrackScores('points');               // → { player1: 0, player2: 0 }
manager.getLeaderboard('points');               // → [{ playerId, score, rank }]

// Apply scores
manager.applyScore('player1', 'points', 100, 'rule-id');  // raw delta
manager.applyScoringRule('correct_answer', context);       // via rule

// Check victory
manager.checkVictory({ round: 5 });            // → VictoryResult

// State management
manager.addPlayer('player3');
manager.removePlayer('player3');
manager.reset();
manager.getSnapshot();                          // deep copy
manager.getHistory('player1');                 // audit trail
```

### ScoringRuleContext

```ts
interface ScoringRuleContext {
  playerId?: string;                            // for 'active-player' / 'specific' targets
  state: Record<string, unknown>;              // full game state (for conditions + expressions)
  event?: { type: string; data?: Record<string, unknown> };
  round?: number;                              // used in expression formulas
}
```

---

## Score Formula Types

| Type | Example | Description |
|------|---------|-------------|
| `fixed` | `amount: 10` | Always adds/subtracts the same amount |
| `expression` | `expr: "round * 10"` | Arithmetic over context fields |
| `multiplier` | `base: 5, multiplier: "speed"` | `base × context[multiplier]` |
| `lookup` | `key: "difficulty", table: {easy:10}` | Maps context key → points |

**Expression safety:** The expression evaluator is a custom recursive-descent parser. No `eval()` or `new Function()` is used. Supports: `+`, `-`, `*`, `/`, parentheses, numeric literals, dot-notation field access.

---

## Victory Condition Types

| Type | Trigger | Description |
|------|---------|-------------|
| `highest_score` | On-demand | Player(s) with most points. Always gameOver=true when checked. |
| `target_score` | After each score | First to reach target score wins. |
| `last_standing` | After each elimination | One player remains (others hit track min). |
| `round_limit` | After each round | Game ends after N rounds, winner by score. |
| `custom` | On-demand | Expression-based custom logic. |

---

## Tiebreak Methods

| Method | Description |
|--------|-------------|
| `none` | Multiple winners allowed. |
| `secondary_track` | Compare another track to break ties. |
| `most_recent_gain` | Whoever scored most recently wins. |
| `sudden_death` | Signal to continue playing (no automatic winner). |
| `random` | Randomly select one winner from tied players. |

---

## Schema Validation

```ts
import { ScoringConfigSchema } from './scoring-system/index.js';

const result = ScoringConfigSchema.safeParse(yamlData.scoring);
if (!result.success) {
  console.error(result.error.issues);
}
```

---

## Test Coverage

66 tests covering:
- ScoreManager basic operations (12)
- Leaderboard sorting (4)
- Scoring rules — all formula types + targeting + conditions (9)
- History / audit trail (4)
- Victory evaluator — all types (9)
- Tiebreak logic (4)
- Formula evaluator (12)
- Schema validation (9)
- Integration: Quiz game scenario (2)

Run: `npx vitest run src/runtime/scoring-system/__tests__/scoring-system.test.ts`
