# Presentation System — Design Decisions

## D1: Partial theme at schema layer, full theme at runtime

**Decision:** `PresentationConfigSchema` accepts a partial theme (`colors` are optional). `mergeTheme()` fills defaults at runtime.

**Rationale:** Game authors want to declare only their accent color or just a few brand colors without specifying all 6 required fields. Rejecting `{ colors: { primary: '#FF5722' } }` at schema validation time would be hostile UX for the most common use case. The schema validates structure; `mergeTheme()` + `validateTheme()` ensure completeness at runtime before rendering.

**Alternative considered:** Require all colors in the schema. Rejected — too verbose for simple games.

---

## D2: `DeepPartialGameTheme` for `mergeTheme` input type

**Decision:** `mergeTheme` accepts `DeepPartialGameTheme` (all colors optional at the type level), not `Partial<GameTheme>`.

**Rationale:** `GameTheme.colors` has required fields. If `mergeTheme` took `Partial<GameTheme>`, callers could not pass `{ colors: { primary: '#red' } }` because `colors` would need all required color fields to satisfy the `colors` property type. A deep partial type enables natural, ergonomic usage.

---

## D3: `presentation` is optional in GamePackageSchema

**Decision:** Changed `presentation` from required to optional in `GamePackageSchema`.

**Rationale:** Simple games may not need a custom presentation config and can rely entirely on template defaults. Forcing every game to declare `presentation` even when using defaults adds friction to game authoring. Games with custom UI needs can opt in with a full declaration.

**Migration note:** The existing `_test-v2/game.yaml` was updated to use the new format.

---

## D4: `resolveScreen` never throws on missing bindings

**Decision:** `resolveScreen` resolves missing binding paths to `undefined` silently.

**Rationale:** Live game state may not have all fields populated at all times (e.g., `phase.timeRemaining` before a timer starts). A missing binding is expected behavior, not an error. The client renders a graceful empty/loading state for unbound components. Crashing the render pipeline for a missing state field would be a bad failure mode.

---

## D5: Screen matching priority in `getScreenForPhase`

**Decision:** Priority order:
1. `screen.id === "${phaseId}_${surface}"` — most specific
2. `screen.id === phaseId` — exact phase match
3. `screen.id.startsWith(phaseId + "_")` — prefixed variant

**Rationale:** Games often declare `play_display` and `play_phone` for a phase named `play`. The surface-specific id should always win. Falling back to the exact phase id allows a single `surface: 'both'` screen to serve both surfaces. The prefix fallback handles games that declare variant screens like `play_fast` or `play_bonus` that should render for the `play` phase.

---

## D6: Template defaults are copied, not shared

**Decision:** `getDefaultTemplate()` returns deep copies of component arrays (via `map` + spread).

**Rationale:** If game code mutates the returned component array (e.g., by pushing a component), shared references would corrupt subsequent calls to `getDefaultTemplate`. Defensive copying eliminates this footgun at negligible cost — component arrays are small.

---

## D7: `custom` template has empty components

**Decision:** The `custom` template type returns an empty component array.

**Rationale:** When a game declares `template: 'custom'`, it means the game is fully responsible for declaring all components. Providing any default components would be surprising and potentially harmful. The empty array is both the safest and most explicit behavior.

---

## D8: CSS custom properties naming convention

**Decision:** Theme colors map to `--color-{name}` (e.g., `--color-primary`). Typography maps to `--font-{property}` (e.g., `--font-family`). Spacing maps to `--spacing-unit`. Border radius maps to `--border-radius`.

**Rationale:** Consistent naming scheme that the display and phone clients can reference. Using `--color-` prefix avoids collisions with browser built-ins and makes the theme properties visually distinct in CSS files.

---

## D9: Color validation uses an allowlist for named colors, not pure regex

**Decision:** `validateTheme` checks named colors against a hardcoded allowlist of valid CSS color names rather than accepting any alphabetic string.

**Rationale:** A pure regex accepting `[a-zA-Z]+` would accept `not-a-color`, `dark-background`, or any arbitrary string. CSS named colors are a finite, well-known set. The allowlist approach is more correct and catches common mistakes like typos in color names, while still accepting all 140+ CSS named colors and keyword values like `transparent` and `currentColor`.

---

## D10: No imports from other V2 subsystems

**Decision:** The presentation-system has zero imports from event-system, turn-system, content-system, object-models, visibility, or phase-machine.

**Rationale:** Subsystem boundary rule from V2 Anti-Drift Protocol Rule 2. The presentation system is a pure data transformation layer — it receives state from the outside and produces resolved screen declarations. Coupling to other subsystems would create circular dependencies and make isolated testing impossible. Wire-up happens at the interpreter layer.
