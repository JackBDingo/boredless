# Extension System — Architecture Decision Records

**Subsystem:** extension-system  
**Phase:** 4.2  
**Date:** 2026-03-13

---

## Decision 1: No Dynamic Module Loading (Yet)

**Context:** The architecture plan mentions `entryPoint` for code extensions. We could implement dynamic `import()` of extension modules at game load time.

**Decision:** Do not implement dynamic module loading in Phase 4.2. The `entryPoint` field is stored in the schema but unused at runtime.

**Rationale:**
- Dynamic `import()` of arbitrary paths is a significant security surface
- VM2 / Node.js `--experimental-vm-modules` / Worker threads are required for true isolation
- The extension type system (registry + sandbox) provides the interface contract; dynamic loading is a separate concern
- Current V1 games that need extensions can register them in TypeScript at interpreter setup time

**Future:** Phase 5 or a dedicated security sprint should implement safe dynamic loading with Worker thread sandboxing.

---

## Decision 2: One Registry Per Game Room

**Context:** Should `ExtensionRegistry` be a singleton or per-instance?

**Decision:** `ExtensionRegistry` is instantiated per game room by the interpreter (not a singleton).

**Rationale:**
- Extensions are game-specific. A WordCraft extension must not be visible to a Blackjack game in another room.
- Per-instance ensures clean state at game end (just discard the registry).
- Singleton would require namespacing by gameId — which is exactly the "if gameId === ..." anti-pattern the architecture forbids.
- Matches the pattern of StateManager, PhaseMachine, etc. (all per-room).

---

## Decision 3: Deep Freeze via JSON.parse(JSON.stringify())

**Context:** How to create a sandboxed copy of game state?

**Decision:** Use `JSON.parse(JSON.stringify(state))` for deep copy + custom `deepFreeze()` for freezing.

**Rationale:**
- `JSON.parse(JSON.stringify())` is the simplest correct deep copy for JSON-serializable state. Game state is always JSON-serializable (it must be for WebSocket transmission).
- `structuredClone()` is an alternative but has slightly different behavior with non-serializable values; since game state is JSON, JSON round-trip is explicit about the contract.
- `deepFreeze()` recursively freezes so nested objects are also frozen (not just the top level).
- Extensions receive a reference they cannot mutate — TypeErrors throw on write attempts.

**Trade-off:** This is O(n) in state size. For large board states (e.g., 15×15 WordCraft board), this is still <1ms. Acceptable for the extension evaluation call rate.

---

## Decision 4: wrapRuleHandler Has No Hard Sync Timeout

**Context:** Rule extensions run synchronously. We want to protect against infinite loops.

**Decision:** `wrapRuleHandler` documents a 100ms timeout but doesn't enforce it synchronously. The `_timeoutMs` parameter is preserved for future use.

**Rationale:**
- True synchronous timeout enforcement in JavaScript requires Worker threads (there is no synchronous interrupt mechanism).
- Adding Worker threads for every rule evaluation is massively over-engineered for the current scale.
- The error-catching wrapper is the primary protection. A well-behaved game with registered extensions runs in a trusted context; malicious extensions are a Phase 5+ hardening concern.
- The architecture plan notes: "Runtime remains authoritative — extensions advise, runtime decides."

**Future:** If untrusted extension code becomes a requirement, implement in a Worker thread pool.

---

## Decision 5: Lifecycle Timeout Enforced via Promise.race

**Context:** Lifecycle handlers are async. We want to prevent a slow handler from blocking the game.

**Decision:** `wrapLifecycleHandler` uses `Promise.race([handlerPromise, timeoutPromise])` with a 1000ms default.

**Rationale:**
- Async handlers can legitimately need more time than sync rule evaluators (e.g., logging, external API calls).
- 1000ms is generous enough for legitimate work but tight enough to detect stuck handlers.
- `Promise.race` is the standard JavaScript pattern for async timeout.
- The timeout promise rejects → the outer try/catch logs and swallows it → runtime is unaffected.

**Note:** The underlying handler is not cancelled (JavaScript has no cancellation primitive without AbortController + explicit cooperation). The handler may continue running after timeout; it just can't affect the game.

---

## Decision 6: validateExtensionImports Is Static, Not Runtime

**Context:** How to enforce that extensions don't import from engine internals?

**Decision:** `validateExtensionImports()` is a static string analysis function (regex-based import scanning), not a runtime enforcement mechanism.

**Rationale:**
- Runtime import interception (e.g., module hooks) requires Node.js `--experimental-vm-modules` and is highly version-specific.
- Static analysis is simple, fast, and catches the obvious violations.
- The function is designed to be run by the CLI validator (`boredless validate`) before loading, not at production runtime.
- The architecture plan notes: "Declared in manifest — no dynamic loading." Static analysis enforces the declaration discipline.

**Blocked subsystems:** state-manager, phase-machine, interaction-primitives, rule-engine, presentation-system, event-system, content-system, asset-system, scoring-system, turn-system, object-models, visibility, interpreter.

**Allowed:** `extension-system/types` (the public extension contract).

---

## Decision 7: Renderer Extensions Store Metadata Only (No React Components)

**Context:** The architecture plan mentions custom React component registration.

**Decision:** `RendererExtension` stores metadata (componentType, surfaces, propsSchema) only — no actual React component reference.

**Rationale:**
- React components are client-side concerns (browser). The server-side runtime doesn't import React.
- The server needs to know: what component type name is registered, what surfaces it supports, and what props schema it expects.
- The actual component registration happens on the client (display/phone apps) with the same `componentType` name as the key.
- This matches the data/code split in the architecture: game packages declare what they need; the client provides the implementation.

---

## Decision 8: Duplicate Type Names Rejected Globally

**Context:** What if two extensions register the same componentType?

**Decision:** Duplicate componentType / ruleType / widgetType names are rejected globally within a registry (not just per-extension).

**Rationale:**
- Type names are the lookup key. If two renderers share a componentType, there's no deterministic winner.
- Rejecting at registration time is a loud failure (throws) — better than silent override.
- This matches how the built-in primitive registry and built-in rule registry work.
- Games must use unique, namespaced type names (e.g., `wordcraft_board`, not `board`).

---

## Decision 9: Schema Uses ExtensionsArraySchema (Array, Not Object Map)

**Context:** The old `ExtensionsSchema` stub used an object map `{ renderers: {...}, rules: {...} }`. The new schema uses an array.

**Decision:** The `extensions:` section in game YAML is an array of `ExtensionDeclaration` objects, not an object map.

**Rationale:**
- Arrays are simpler to iterate and validate in Zod.
- Each extension declaration has its own `id` and `type` — these are the natural keys.
- The object map format mixes the declaration (what's declared) with capabilities (what's implemented) — these are separate concerns.
- Capabilities (evaluate functions, etc.) cannot be in the YAML anyway (they're code). The YAML declares identity; runtime registers capabilities.
- Array format is consistent with the `rules:` section pattern.

---

## Decision 10: ExtensionCapabilities Is Open (Any Combination)

**Context:** An extension could be declared as `type: renderer` but provide both renderers and rules.

**Decision:** `ExtensionCapabilities` accepts any combination of renderers, rules, interactions, and lifecycleHooks, regardless of the `type` field in `ExtensionDeclaration`.

**Rationale:**
- `composite` type was added to `ExtensionDeclaration.type` for this exact case.
- Strict enforcement (renderer type → renderers only) would require complex cross-field validation.
- The `type` field in the declaration is documentation/metadata for tooling, not a runtime constraint.
- Most extensions will be single-purpose; composite extensions are the legitimate exception.
