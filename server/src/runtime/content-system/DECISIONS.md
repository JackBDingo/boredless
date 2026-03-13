# Content System — Design Decisions

**Phase:** 3.1  
**Date:** 2026-03-13

---

## D1: ContentPool receives pre-loaded items (not a loader reference)

**Decision:** `ContentPool` constructor takes `(config, items[])` — it does not call the loader internally.

**Rationale:**
- Clear separation of concerns: loading is I/O (loader's job), pool management is in-memory state.
- `ContentPool` is testable without any file system or I/O fixtures.
- Multiple pools can share items loaded from the same source without double-loading.
- Consistent with how `ObjectRegistry` and `StateManager` work — construction receives ready data.

**Rejected alternative:** Pool receives a loader reference and calls it lazily. Rejected because it mixes concerns and makes lazy-load timing unpredictable.

---

## D2: Separate ContentLoader and ContentRegistry

**Decision:** `ContentLoader` handles I/O and pack registration; `ContentRegistry` manages the pool lifecycle.

**Rationale:**
- A loader can be shared across rooms (content packs are global per process), while a registry is per-room.
- This enables expansion pack registration before any game rooms are created.
- Tests can create a `ContentRegistry` with a custom `ContentLoader` instance, enabling file mocking.

**Rejected alternative:** Single unified `ContentManager` class. Rejected because it would bundle global state (packs) with per-room state (pools), making isolation harder.

---

## D3: Pre-filters applied at construction, not at draw time

**Decision:** `ContentPoolConfig.filters` are applied once in the `ContentPool` constructor. The resulting `_allItems` array excludes filtered-out items permanently.

**Rationale:**
- Pre-filters represent semantic pool composition ("this pool is hard questions") — they're not dynamic queries.
- Items excluded by pre-filters never waste "slots" in sequential/shuffle order.
- `getAll()` and `getState().total` accurately reflect the pool's effective size.
- Runtime filter queries (`pool.filter(filters)`) work on `_allItems` — already pre-filtered content.

**Trade-off:** Pre-filters cannot be changed after construction. Acceptable — pools are rebuilt when game rooms restart.

---

## D4: noRepeat default is true, recyclable default is true

**Decision:** Both `noRepeat` and `recyclable` default to `true` (must be explicitly set to `false`).

**Rationale:**
- 95% of game content pools should not repeat within a session (you don't want the same trivia question twice).
- Recycling by default prevents games from silently failing when they run out of content.
- Explicit opt-out (`recyclable: false`) is the uncommon path and should be intentional.

**Rejected alternative:** Default both to `false`. Rejected because it makes the most common game design pattern verbose.

---

## D5: Shuffle strategy vs. noRepeat behavior

**Decision:** `shuffle` strategy performs one initial shuffle of the pool, then draws sequentially from the shuffled order. `noRepeat: true` (default) removes items as they're drawn.

**Rationale:**
- `shuffle` and `random` differ: random re-rolls each draw (can repeat even with large pools); shuffle guarantees uniform distribution and no repeat without needing explicit `noRepeat`.
- The semantic is "deal from a shuffled deck" which is intuitive for card/prompt games.
- On recycle, `shuffle` reshuffles — each cycle has a fresh random order.

**Notable:** For `shuffle` with `noRepeat: false` — draws sequentially from shuffled array, wrapping around. Uncommon use case but supported for completeness.

---

## D6: Filter field 'tag' uses any-match semantics

**Decision:** When `filter.field === 'tag'`, an item passes if it has **at least one** of the specified tag values (OR within the tag filter). Multiple filters combine with AND.

**Rationale:**
- Tags are a multi-valued field (an item can have `['adult', 'dating', 'funny']`).
- "Show me items tagged with either 'adult' OR 'funny'" is the useful query.
- Cross-filter combination is AND: "hard AND science-tagged" finds the intersection.

**Example:**
```ts
pool.filter([
  { field: 'tag', value: ['adult', 'funny'] },  // item must have at least one of these
  { field: 'difficulty', value: 'hard' },         // AND must be hard
])
```

---

## D7: ContentSectionSchema uses 'pools' array, not flat record

**Decision:** The schema uses:
```yaml
content:
  pools:
    - id: prompts
      ...
    - id: categories
      ...
```
Rather than:
```yaml
content:
  prompts:
    type: prompt_pool
    ...
```

**Rationale:**
- The architecture plan had a preliminary sketch with the flat format, but an array of named pool configs is more consistent with other V2 schema patterns (phases is a record, but content benefits from array because pool order can matter for sequential/shuffle).
- Zod discriminated unions work more naturally with an array of typed objects than with dynamic record keys.
- `ContentPoolConfigSchema` can be used standalone (validated per-pool).
- Pool order in the array matches the intended sequential draw order when `selection: sequential`.

**Trade-off:** Slightly more verbose in YAML vs. flat record keys. Acceptable for the consistency gain.

---

## D8: defaultContentLoader singleton export

**Decision:** Exporting a `defaultContentLoader` singleton from `content-loader.ts` (and re-exported in `index.ts`).

**Rationale:**
- Most games will register content packs once at startup and share the loader across rooms.
- Games that need isolation (e.g., tests, unique pack sets) can create their own `new ContentLoader()` instances.
- Pattern consistent with other Node.js ecosystem libraries.

---

## D9: ContentSchema in schema-engine replaced with ContentSectionSchema

**Decision:** `server/src/runtime/schema-engine/schema.ts` now imports `ContentSectionSchema` from the content-system and uses it as `ContentSchema` instead of `z.record(z.any())`.

**Rationale:**
- The architecture plan requires schema-first design — the content section should be typed, not an opaque record.
- A game YAML with an invalid content section should fail at load time with clear field paths in the error, not silently pass validation.
- One test in `schema-engine.test.ts` was updated to use the proper content section format.

**Non-breaking:** The `content:` field is still optional in `GamePackageSchema`. Only the type of a present content section changed.

---

## D10: No imports from event-system, turn-system, or object-models

**Decision:** Content System is strictly standalone — it imports only from `zod` and Node.js built-ins.

**Rationale:**
- Anti-Drift Protocol Rule 2: subsystem boundaries are non-negotiable.
- Content pools are pure data transformation — no need for events, turns, or objects.
- Standalone design enables use in isolation for tooling (content pack validators, authoring tools).
