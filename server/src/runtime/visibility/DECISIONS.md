# Visibility & Projection — Design Decisions

## Phase 2.1 — 2026-03-13

---

## Decision 1: Pure Projection (No State Mutation)

**Choice:** `project()` is a pure function — takes a snapshot, returns filtered state, no side effects.

**Rationale:** Idempotent, testable, composable. The engine can be called multiple times per tick (once per player) without risk of corrupting state. Snapshots are already immutable deep copies from `StateManager.snapshot()`.

**Alternative considered:** Project directly from the live StateManager (getters). Rejected because it couples projection to a specific state store and makes testing harder.

---

## Decision 2: Visibility Map Compiled at Construction Time

**Choice:** `ProjectionEngine` compiles the visibility map from `StateModel` in the constructor, not in every `project()` call.

**Rationale:** Games have many players but one schema. Compiling once per room avoids redundant schema traversal. Per-call overhead is O(fields × players) — already unavoidable.

**Trade-off:** If schema could change at runtime (it doesn't), we'd need to rebuild the engine. Not a concern in V2 — schema is immutable once loaded.

---

## Decision 3: Eliminated Players See Public Only

**Choice:** `eliminated` audience type is more restricted than `player` — sees only `public` fields (not `spectator`, not their own `private`).

**Rationale:** Consistent with game design expectations. An eliminated player in Village of Shadows shouldn't suddenly see other players' roles because they're dead. They can watch but have no information advantage.

**Alternative considered:** Eliminated sees same as spectator. Rejected — spectator scope is for observers who never had game state. Eliminated players are a distinct audience that had private info and lost it.

---

## Decision 4: Fields Without Visibility Declarations Default to Public

**Choice:** Any field in the snapshot that lacks a visibility declaration in the schema is treated as `public` — visible to all audiences.

**Rationale:** Fail-open for display purposes. A game author forgetting to declare visibility should result in over-sharing (which is usually fine), not under-sharing (which breaks the game). If a field is supposed to be hidden, it MUST be declared.

**Security note:** This is a design game, not a security product. "Hidden" means "not sent to clients who shouldn't see it" — not cryptographic protection.

---

## Decision 5: Team Visibility Stubs to Private (Phase 2.4 Deferred)

**Choice:** `team` scope currently behaves as `private` — only the owning player (and host) can see it. True team membership lookup is deferred to Phase 2.4.

**Rationale:** Phase 2.4 will build team tracking. Adding a stub now allows games to declare `visibility: team` in their schema without breaking compilation. The behavior will automatically improve when Phase 2.4 ships.

**How to upgrade:** Phase 2.4 should inject a `teamMembershipResolver` into `ProjectionEngine` (or pass team data in the snapshot) so `canSeeScope('team')` can do a real lookup.

---

## Decision 6: ProjectedState Includes `meta.redactedFields`

**Choice:** The projection output includes a list of field paths that were redacted (e.g., `["players.bob.hand", "globals.secret_code"]`).

**Rationale:** Debugging visibility issues is painful. A host or debug view can inspect `meta.redactedFields` to confirm the engine is working as expected. No production cost — field path strings are cheap to build.

**Alternative considered:** Log to console. Rejected — structured data in the response is more useful than logs.

---

## Decision 7: Schema Extended with `redaction` and `placeholder` Fields

**Choice:** Extended `StateFieldSchema` with optional `redaction: RedactionStrategySchema` and `placeholder: z.unknown()`. Also added `'team'` to `VisibilityScopeSchema`.

**Rationale:** The schema must be the source of truth for visibility behavior. Adding redaction configuration to the schema means game authors can declare visibility behavior in one place without touching TypeScript.

**Breaking change assessment:** Non-breaking. Both fields are optional; existing game packages validate fine. Games that don't declare `redaction` get the default `'omit'` behavior.

---

## Decision 8: ProjectionEngine Wired into DeclarativeGameModule

**Choice:** `DeclarativeGameModule` creates a `ProjectionEngine` during `setup()` and uses it in `buildPublicState()` and `buildPrivateState()`. The old `StateManager.getPublicState()` / `getPrivateState()` methods remain (for direct testing) but are no longer called by the interpreter.

**Rationale:** Backwards-compatible swap. The kernel interface (`getPublicState(roomId)`, `getPrivateState(roomId, playerId)`) is unchanged. Internally, the data source improved.

**Output shape change:** The previous methods returned `{ globals, players }`. The new projection returns `{ globals, players, teams, phase, meta }`. The `meta` field is new; existing clients that ignore unknown fields (most do) will not break.

---

## Subsystem Boundaries

**Imports from:**
- `../schema-engine/index.js` — `StateModel` type only
- `../state-manager/index.js` — `StateSnapshot` type only

**Imported by:**
- `../interpreter/declarative-game-module.ts` — uses `ProjectionEngine`, `Audience`

**Does NOT import from:**
- Any game-specific code
- Any internal files of other subsystems (only their `index.ts`)
- Phase Machine, Interaction Primitives, or any other subsystem (not needed)

---

## Future Improvement Paths

1. **Phase 2.4 — Team Visibility:** Inject a team membership resolver into `ProjectionEngine` so `team` scope works correctly.
2. **Role Visibility:** Add `role:<id>` scope for role-restricted information (only players with a specific role can see).
3. **Computed Visibility:** Allow visibility to be a formula expression (e.g., "visible when globals.round > 3").
4. **Transform Operations:** Beyond redaction, allow field value transformation (e.g., show partial information: first letter of a word).
