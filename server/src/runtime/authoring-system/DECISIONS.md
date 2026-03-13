# Authoring System — Architecture Decisions

## Decision 1: No Runtime Imports

**Choice:** The authoring system imports zero code from other runtime subsystems.

**Rationale:** This system's job is to analyze and document game YAML data — it doesn't execute anything. Importing runtime code (PhaseMachine, StateManager, etc.) would create circular dependencies and couple the authoring layer to execution details that may change.

**Consequence:** Introspection is done by reading raw YAML object shapes, not by instantiating runtime objects. This is intentional — it mirrors how an LLM would see game data.

---

## Decision 2: Pure Functions (No Classes)

**Choice:** All modules export pure functions, not classes.

**Rationale:** This system is stateless by nature — it takes data in, returns analysis out. Classes would add unnecessary complexity and make the functions harder to test/compose.

**Exception:** None planned.

---

## Decision 3: Validator Returns, Never Throws

**Choice:** `validateGamePackage()` always returns a `ValidationResult`, even for completely broken packages.

**Rationale:** Validation is a UX-layer concern. Callers (CLI tools, LLM pipelines, developer dashboards) need to collect ALL errors at once and present them, not crash on the first one. Throwing on validation failure would force callers to wrap everything in try/catch loops.

---

## Decision 4: Complexity Tiers Are Hard-Coded Thresholds

**Choice:** simple ≤3 phases, moderate ≤6, complex ≤10, advanced = beyond.

**Rationale:** These thresholds match the distribution of existing V2 games:
- Most party/trivia games: 4-6 phases (moderate)
- Social deduction games: 6-8 phases (moderate/complex)
- Board games with custom renderers: 8+ phases + extensions (complex/advanced)

The thresholds are not configurable because they're meant to communicate intent to LLMs ("how hard is this to generate?"), not provide precise measurement.

---

## Decision 5: Templates Are Complete Playable Games

**Choice:** Every template produces a schema that passes `validateGamePackage()`.

**Rationale:** Templates that don't work teach bad patterns. Every template was hand-crafted to be valid, sensible, and immediately playable (within the bounds of what the runtime supports).

**Tradeoff:** Some templates (drawing, board) declare extensions that require custom component code. These are flagged in the README and listed in `suggestedExtensions`.

---

## Decision 6: Content in Templates Uses File Sources (Not Inline)

**Choice:** Party and trivia templates reference `./prompts.json` rather than embedding content inline.

**Rationale:** Inline content in templates would teach the wrong pattern — most real games need external content files. The templates generate `prompts.json` as a TemplateFile alongside `game.yaml`, showing the correct co-location pattern.

---

## Decision 7: YAML Examples in CapabilityDocs Are Verbatim

**Choice:** The `yamlExample` field in each CapabilityDoc is a real, indented YAML snippet.

**Rationale:** These examples are intended to be pasted directly into LLM prompts via `generateSchemaReference()`. If examples are pseudo-code or abstract, they'll generate incorrect games. Verbatim examples that work in actual schemas are worth the extra effort to write correctly.

---

## Decision 8: generateSchemaReference() Is LLM-First

**Choice:** The output of `generateSchemaReference()` is optimized for LLM consumption, not for human reading in a browser.

**Rationale:** The primary use case is: "include this in the system prompt when asking an LLM to write a game." Human developers would read the README or Storybook docs. The reference document prioritizes YAML examples and concise descriptions over navigation structure.

---

## Decision 9: Validator Handles Both V1 Legacy and V2 Declarative Scoring

**Choice:** `validateGamePackage()` validates V2 scoring (`tracks` + `rules` array) but skips deep validation of V1 legacy scoring (`{ correct_answer: 100 }`).

**Rationale:** V1 games may use legacy scoring format. Deep validation only makes sense for V2 declarative scoring where track IDs can be cross-referenced. Legacy format is a key→number map — there's nothing to cross-reference.

---

## Decision 10: Phase Reachability Uses BFS from First Phase

**Choice:** The orphan-detection algorithm does BFS from the first phase in the phases object.

**Rationale:** The V2 schema doesn't have an explicit `initial_phase` field — the first declared phase is the initial one (matching YAML insertion order semantics). This is consistent with how the Phase Machine determines the starting phase.

**Risk:** If a developer reorders phases in their YAML, the initial phase changes. This is a known schema design limitation, not an authoring system bug. A future improvement could add an explicit `initial_phase` field to the manifest.
