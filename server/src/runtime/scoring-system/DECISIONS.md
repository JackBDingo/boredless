# Scoring & Victory System — Architecture Decisions

**Phase:** 4.3  
**Date:** 2026-03-13

---

## Decision 1: No eval() — Custom Expression Parser

**Decision:** Implement a recursive-descent parser for arithmetic expressions instead of using `eval()` or `new Function()`.

**Rationale:** Security. `eval()` in a game server context could allow arbitrary code execution if a malicious game package were loaded. The expression language needed is simple: arithmetic operators + dot-notation field access. A purpose-built parser is ~100 lines and completely safe.

**Tradeoff:** The expression language is limited. It supports `+`, `-`, `*`, `/`, parentheses, numeric literals, and field paths. No boolean operators, no ternary, no function calls. Games needing more complex logic should use extension evaluators.

**Alternative considered:** A sandboxed `vm.runInNewContext()` — rejected because it adds a Node.js VM overhead and still requires careful sandboxing of the context.

---

## Decision 2: ScoreManager Owns State, Returns Changes

**Decision:** `ScoreManager` is the authoritative score store. `applyScore()` mutates state and returns the `ScoreChange`. It does NOT follow a pure "return mutations, caller applies" model.

**Rationale:** The task specification says "return results, caller applies" but the `ScoreManager` IS the scoring subsystem's store — there's no external authoritative store for scores. The `StateManager` in state-manager owns game state broadly; `ScoreManager` owns score state specifically. Making `ScoreManager` return-only would require callers to re-implement the bounds checking, history tracking, and initialization — defeating the purpose of the subsystem.

**Tradeoff:** ScoreManager is stateful. It cannot be used as a pure function. Callers should hold a single instance per game room.

---

## Decision 3: Multiple Score Tracks

**Decision:** Support an arbitrary number of named score tracks per game, each with its own direction, bounds, and display config.

**Rationale:** V1 games use scores for different purposes: Bluff Battle uses a single `score`, but real games need lives, money, reputation, etc. A single `points` field is insufficient for any non-trivial game.

**Examples from existing games:**
- Blackjack: chips (money track) + hand value (temporary)
- Village of Shadows: reputation + vote count
- Texas Hold'em: chip stack + pot value

---

## Decision 4: LookupFormula Requires Explicit `key` Field

**Decision:** The `lookup` formula type has a `key` field (field path to look up in context) AND a `table` (the mapping). Earlier design in the task spec used the formula differently.

**Why:** The spec said `type: 'lookup'; table: Record<string, number>` without specifying how to get the key. We added `key` as the explicit context field path to look up, making the formula self-contained.

**Example:**
```yaml
formula:
  type: lookup
  key: "difficulty"          # context.difficulty = "hard"
  table:
    easy: 10
    medium: 20
    hard: 30
```

---

## Decision 5: VictoryResult Always Includes Rankings

**Decision:** `VictoryResult` always populates `rankings` even when `gameOver: false`.

**Rationale:** The game runtime (Phase Machine) can display live leaderboards at any point. Not requiring `gameOver: true` to get rankings enables mid-game leaderboard screens without separate queries.

---

## Decision 6: Tiebreak `secondary_track` — Higher Value Wins

**Decision:** When breaking ties using `secondary_track`, the player with the HIGHER value on the secondary track wins, regardless of the secondary track's `direction` config.

**Rationale:** The primary track's direction determines the victory ranking. The secondary track is purely a tiebreaker — the most natural interpretation of "use lives as a tiebreaker" is "more lives remaining = better." Using the track's direction config for tiebreaking would make the logic more complex and harder to reason about.

**Implication:** If a game wants "fewer lives remaining wins," they'd need to use a different tiebreak method or design a different track.

---

## Decision 7: GamePackageSchema — `scoring` as `z.unknown()`

**Decision:** The `scoring` field in `GamePackageSchema` uses `z.unknown()` instead of a union type to preserve backward compatibility.

**Rationale:** The existing schema-engine tests and the V1 fixture use `scoring: { correct_answer: 100 }` (V1 format). If we change the type to a Zod union, TypeScript forces callers to narrow the type before accessing fields — breaking existing V1 code.

**V2 callers who want typed scoring configs should:**
1. Read `pkg.scoring` as `unknown`
2. Validate with `ScoringConfigSchema.safeParse(pkg.scoring)` from the scoring-system public API
3. Use the typed result

This is the same pattern used by other subsystems that extend the schema.

---

## Decision 8: Standalone Subsystem — No Cross-Imports

**Decision:** The scoring-system imports from nothing except `zod`. It does NOT import from rule-engine, event-system, content-system, presentation-system, or asset-system.

**Rationale:** Prevents circular imports and keeps the subsystem self-contained and testable in isolation. The formula evaluator is simpler than the rule engine's expression evaluator but serves a narrower purpose (arithmetic only). Sharing the rule-engine's evaluator would create a dependency that violates subsystem boundaries.

---

## Decision 9: `ScoringRuleContext.state` — Flat Record

**Decision:** `state` in `ScoringRuleContext` is `Record<string, unknown>`, not a typed StateManager reference.

**Rationale:** The scoring-system must not depend on the state-manager subsystem. Callers (e.g., the DeclarativeGameModule interpreter) extract the relevant state snapshot and pass it in. This keeps the subsystem boundary clean and makes testing trivial (no mock StateManager needed).
