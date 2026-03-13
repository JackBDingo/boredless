# Schema Engine — Architectural Decisions

**Phase:** 0.1  
**Subsystem:** `server/src/runtime/schema-engine/`  
**Author:** Jack Vincent  
**Date:** 2026-03-13

---

## Decision 1: Zod as the schema definition and validation library

**Context:** The existing codebase (`manifest-schema.ts`, `validation.ts` in shared) already uses Zod. The new `GamePackageSchema` needed to extend the existing manifest concept into a full game package definition.

**Decision:** Define all V2 schema types in Zod. Zod provides:
- Runtime validation (YAML input is untyped `unknown`)
- TypeScript type inference (`z.infer<typeof Schema>`)
- Structured error reporting with field paths (used in `formatZodErrors`)
- `safeParse` for non-throwing validation

**Alternatives considered:**
- **JSON Schema + ajv:** More portable, but no TypeScript type inference without code generation. Two separate representations (schema + types) would drift.
- **Hand-written validators:** No type inference, more code to maintain.
- **TypeBox:** Newer, potentially better performance, but unfamiliar to the codebase.

**Trade-off:** Zod validation is slower than raw type checks, but game packages are validated once at load time, not on every request. Performance is irrelevant here.

---

## Decision 2: `schema_version: "2.0"` as a literal discriminant

**Context:** The kernel needs to distinguish V1 game packages (no `schema_version`) from V2 packages at load time.

**Decision:** Use `z.literal('2.0')` as the `schema_version` field type. Any value other than exactly `"2.0"` fails validation. This is the primary discriminant for hybrid loader routing.

**Why not a range check?** A literal is simpler, more explicit, and fails fast. Version negotiation is a separate concern — handled by the migration strategy, not runtime validation.

**Future:** When V2.1 introduces breaking changes, `SchemaVersionSchema` becomes `z.union([z.literal('2.0'), z.literal('2.1')])` and the loader selects the right validator based on the detected version.

---

## Decision 3: Optional domains use `z.any()` stubs

**Context:** The full schema includes content, events, roles, teams, objects, rules, extensions, and authoring sections — none of which have fully designed schemas at Phase 0.1.

**Decision:** Optional sections are defined as `z.record(z.any())` or `z.array(z.any())` stubs. They accept any valid YAML object/array, providing no structural validation.

**Why not omit them entirely?** Games may already include these sections (e.g. `content` with a prompts pool). Rejecting them would break valid game files. Stubs accept them without failing.

**Trade-off:** No validation on content, events, etc. until those subsystems are built and their schemas are formalized. The stubs will be replaced with real schemas as each phase is implemented.

---

## Decision 4: `loadGamePackage` throws; `validateGamePackage` returns a result

**Context:** Two use cases exist: (1) "load this game and fail loudly if invalid" (startup, CLI), and (2) "check if this data is valid without crashing" (testing, future CLI validate command).

**Decision:** Two separate functions with different error contracts:
- `loadGamePackage(path)` — throws `Error` with human-readable message including field paths. Preferred for production use.
- `validateGamePackage(data)` — returns `{ valid: boolean; errors?: string[] }`. Preferred for testing and tooling.

**Why `formatZodErrors`?** Zod's raw error structure is verbose. `formatZodErrors` maps each issue to `"path.to.field: message"` — matching the error style documented in the architecture plan.

---

## Decision 5: `manifest.id` must match `/^[a-z0-9-]+$/`

**Context:** Game IDs are used as directory names, URL segments, and identifiers in the kernel. Arbitrary strings would cause filesystem and routing bugs.

**Decision:** Enforce lowercase alphanumeric + hyphens via Zod `z.string().regex(...)`. Rejects spaces, uppercase, underscores, dots.

**Examples rejected:** `"My Game"`, `"my_game"`, `"MyGame"`, `"my.game"`  
**Examples accepted:** `"my-game"`, `"bluffalo"`, `"test-v2-fixture"`

---

## Decision 6: `phases` first key is the initial phase

**Context:** The Phase Machine needs to know which phase to start with. Options: explicit `initial_phase` field, or convention (first key).

**Decision:** Convention — the first key in the `phases` object is the initial phase. JavaScript objects preserve insertion order for string keys (ES2015+). YAML objects preserve insertion order when parsed by the `yaml` library.

**Why not an explicit field?** An explicit `initial_phase: "instructions"` adds redundancy and a validation requirement (must match an actual phase key). The convention is simpler and matches how game authors naturally write phase graphs (top-to-bottom).

**Risk:** If YAML parsers reorder keys alphabetically, this breaks. The `yaml` library (used here) preserves order. Document this assumption clearly.

---

## Decision 7: `scoring` is `Record<string, number>` — not a typed formula language

**Context:** The architecture plan envisions declarative scoring formulas. Phase 0.1 does not implement the formula evaluator.

**Decision:** `ScoringSchema = z.record(z.number())` — a flat map of named point values. Games declare `{ correct_answer: 100, first_correct: 50 }`. The interpreter reads these values; the scoring formula language is Phase 4.

**Trade-off:** No runtime enforcement that scoring keys are used in actions. A game can declare `{ bonus: 500 }` and never use it — the schema won't catch it. Semantic validation (are scoring keys referenced by actions?) is deferred.

---

## Subsystem Boundary

**Schema Engine imports from:**
- `zod` (npm dependency)
- `yaml` (npm dependency — the `yaml` package)
- `node:fs` (Node.js built-in)

**Schema Engine does NOT import from:**
- Any other V2 subsystem
- Any V1 engine internals (room-manager, game-module, etc.)

**Other subsystems import from Schema Engine:**
- `state-manager/` — imports `StateModel`, `StateField`
- `phase-machine/` — imports `Phases`, `PhaseNode`, `PhaseAction`
- `interpreter/` — imports `GamePackage`, `PhaseAction`, `PhaseNode`

Always import from `schema-engine/index.ts`, never from `schema.ts` or `loader.ts` directly.
