# Asset System — Design Decisions

## Decision 1: AssetResolver is stateless (pure resolution)

**Decision:** `AssetResolver` performs pure resolution — given a manifest and options, it resolves paths deterministically. No mutable state after construction.

**Why:** Resolution is a read operation. Caching adds complexity without meaningful benefit at game-start timescales. Statelessness makes the class trivially testable and safe to share across threads.

**Alternatives considered:**
- Mutable cache of resolved assets — rejected because resolution is cheap (string concatenation) and a cache adds write-locking complexity.

---

## Decision 2: Index built at construction time

**Decision:** `AssetResolver` builds `Map<id, declaration>` once in the constructor, not per-call.

**Why:** Most uses involve multiple lookups (resolve, has, getAssetsByType). One O(n) scan at construction is better than O(n) per call.

**Trade-off:** If the manifest changes after construction, the resolver is stale. This is acceptable because manifests are loaded once per game package load and never mutated at runtime.

---

## Decision 3: baseUrl in manifest takes precedence over constructor options

**Decision:** `manifest.baseUrl` is checked before `options.publicUrlBase`, which is checked before `options.gameDir`.

**Why:** A game author explicitly setting `baseUrl` in their schema knows the correct URL for their assets. Options are fallbacks for when the game schema doesn't specify.

**Impact:** Runtime integration code can pass `publicUrlBase` as an option and trust it won't interfere with games that declare their own `baseUrl`.

---

## Decision 4: Max fallback depth of 3

**Decision:** Recursive fallback resolution stops at depth 3, returning the raw `src` of the deepest reachable asset.

**Why:** Prevents infinite loops from circular references. Depth 3 allows A → B → C → D (3 hops) which covers any realistic fallback chain. Most games use 0-1 levels of fallback.

**Alternative considered:** Track visited IDs to detect cycles explicitly — rejected because depth limit is simpler and the behavior difference is invisible in practice (games shouldn't have circular fallbacks).

---

## Decision 5: Fallback field is polymorphic (ID or URL)

**Decision:** The `fallback` field accepts both asset IDs and external URLs without a type discriminator.

**Why:** Mirrors how `src` works — both are strings; the resolver determines interpretation by checking for `http://`/`https://` prefix and then checking the asset index.

**Risk:** An asset ID that starts with `http` is ambiguous. Mitigated by the asset ID regex constraint (IDs are alphanumeric with underscores, per existing schema conventions) and by the URL check running first.

---

## Decision 6: Variants share the same base URL resolution logic

**Decision:** Variant `src` values are resolved using the same `_resolveUrl()` helper as the primary `src`.

**Why:** Consistency. A game author declaring variants shouldn't need to think about different URL rules for variants vs primary assets.

---

## Decision 7: No imports from other V2 subsystems

**Decision:** `asset-system` has no imports from `content-system`, `event-system`, `turn-system`, `object-models`, `interaction-primitives`, `phase-machine`, `state-manager`, or `interpreter`.

**Why:** Per architecture Anti-Drift Protocol Rule 2 and the task constraint. Asset resolution is orthogonal to game logic. Zero coupling means zero circular import risk.

---

## Decision 8: Zod `preload` defaults to `false`

**Decision:** `AssetDeclarationSchema` uses `.optional().default(false)` for `preload`.

**Why:** The safe default is to not preload — preloading has network cost. Games opt-in explicitly with `preload: true`.

**Note:** The TypeScript interface uses `preload?: boolean` (optional), but after Zod parse the field is always present. The resolver always reads `declaration.preload ?? false` defensively.

---

## Decision 9: GamePackageSchema extension is non-breaking

**Decision:** The `assets:` field added to `GamePackageSchema` is `.optional()`.

**Why:** All existing V2 game packages don't declare assets. Making it required would break them. Games opt-in by adding an `assets:` section.

---

## Decision 10: No file existence validation

**Decision:** `AssetResolver` does not check whether declared local files exist on disk.

**Why:** File I/O at resolution time would couple the resolver to the filesystem, break unit tests, and fail in environments where assets are served from CDN (not local disk). Existence checking belongs in a `boredless validate` CLI step (Phase 5).

**Future:** A `GamePackageValidator` in Phase 5 should walk the resolved local paths and warn on missing files.
