# Rule Engine — Architecture Decisions

**Subsystem:** `rule-engine`  
**Phase:** 4.1

---

## Decision 1: No eval() — Recursive Descent Parser

**Context:** The expression evaluator needs to handle a rich expression language. The obvious shortcut is `eval()` or `new Function()`, which would execute arbitrary JavaScript.

**Decision:** Implement a proper recursive descent parser in `expression-evaluator.ts`.

**Rationale:**
- Game schemas are potentially user-authored content. `eval()` would be a critical security hole.
- A recursive descent parser for this expression grammar is ~300 lines — manageable complexity for the safety guarantee it provides.
- The grammar is unambiguous and well-understood: ternary > or > and > equality > comparison > arithmetic > unary > postfix > primary.

**Tradeoff:** More code to maintain vs. any security shortcut. The right call for a platform where schemas come from untrusted authors.

---

## Decision 2: Rule Engine Returns Results, Does Not Execute

**Context:** When rules match, actions need to be executed (state mutations, event emissions, phase transitions). The engine *could* execute these directly.

**Decision:** RuleEngine evaluates and returns `RuleResult[]`. Callers execute the actions.

**Rationale:**
- Subsystem separation: action execution touches StateManager, EventEngine, PhaseMachine. Importing those would create circular dependencies.
- Testability: returning data is trivially testable. Executing side effects is not.
- Caller context: the interpreter knows what to do with actions; the rule engine doesn't.
- Mirrors the EventEngine's design in Phase 2.2 (effects delegated to onEffect callback).

---

## Decision 3: Built-in Registry as Module-Level Singleton

**Context:** Built-in rules need to be accessible from `condition-evaluator.ts` without passing them as constructor arguments.

**Decision:** Module-level `Map<string, BuiltInRule>` in `builtin-rules.ts`, populated at module load time.

**Rationale:**
- Built-ins are game-agnostic constants — registering them once at module load makes sense.
- Avoids dependency injection complexity for something that is effectively a static registry.
- `registerBuiltIn()` allows game-specific extensions without modifying the core module.

**Tradeoff:** Shared global state across tests. Mitigated because built-ins are idempotent and test isolation is maintained by not having side effects.

---

## Decision 4: Wildcard Support in Built-in Rule Paths

**Context:** Many game states have per-player data in a map: `{ p1: { score: 5 }, p2: { score: 8 } }`. Rules like `score_reached` need to check "any player's score".

**Decision:** Implement `*` wildcard in the `deepGet()` helper used by built-in rules. `players.*.score` returns `[5, 8]`.

**Rationale:**
- Without this, schema authors would need custom expressions for common patterns.
- Wildcard is a common convention (JSON Schema, JSONPath, glob).
- Keeps built-in rules expressive without adding a query language.

**Scope:** Wildcards only apply to built-in rule path params, not to the expression evaluator. Keeps the expression language simple.

---

## Decision 5: LogicalCondition Allows NOT with Multiple Conditions

**Context:** `LogicalCondition` has `type: 'and' | 'or' | 'not'` with `conditions: RuleCondition[]`. For `not`, semantically only the first condition matters.

**Decision:** For `not`, only the first element of `conditions` is evaluated. Extra elements are ignored (no error).

**Rationale:**
- Schema authors might write `not: conditions: [a, b]` thinking it means "not (a and b)". Rather than reject this, we evaluate only the first and let the author compose `and` + `not` explicitly.
- Simpler than adding a `NegationCondition` type for `not`.
- Documented in types.ts with `// for 'not', only first is used`.

---

## Decision 6: Comparison Operand Resolution Heuristic

**Context:** In a `ComparisonCondition`, `left` and `right` are `string | number | boolean | array`. When `left` is a string, it might be a field path (`"globals.score"`) or a literal string (`"active"`).

**Decision:** Heuristic resolution for string operands:
1. If string contains `.` → treat as field path
2. If string starts with `$` → treat as field path  
3. If string matches known state prefixes (`globals`, `per_player`, etc.) → field path
4. Otherwise → string literal

**Rationale:** Avoids requiring explicit quoting syntax for string literals in the `comparison` condition type (that's what `expression` conditions are for). Common game values like status strings (`"active"`, `"waiting"`) don't contain dots.

**Tradeoff:** Ambiguous cases (e.g., a string literal that happens to look like a path) should use `expression` condition type instead. Documented.

---

## Decision 7: Zod Schema Uses `z.lazy()` for Recursive Conditions

**Context:** `LogicalCondition.conditions: RuleCondition[]` creates a recursive type. Zod requires `z.lazy()` for self-referential schemas.

**Decision:** Use `z.lazy(() => z.discriminatedUnion(...))` for `RuleConditionSchema`.

**Rationale:**
- Standard Zod pattern for recursive types.
- Allows arbitrarily deep condition nesting (AND containing OR containing AND, etc.).
- Slight runtime overhead from lazy evaluation is negligible for schema parsing at load time.

---

## Decision 8: Expression Evaluator Handles Dotted Paths in Postfix

**Context:** `globals.score` could be parsed as identifier `globals` followed by `.score` (property access in the postfix rule), or as a single identifier path resolved directly.

**Decision:** The `resolveIdent()` method in the parser collects the full dotted path eagerly (as long as the next dot is followed by an identifier that is NOT followed by `(`) and passes it to `resolveValue()` as a single path string.

**Rationale:** This correctly handles `globals.players.p1.health` as a single path lookup rather than chained property access on intermediate values. Method calls (`.includes()`, `.startsWith()`) are still handled in `parsePostfix()` because they end with `(`.

**Note:** This means `globals.fn()` would fail (field `globals.fn` is not callable). This is intentional — the expression language does not support calling methods on arbitrary resolved values, only on string/array literals.
