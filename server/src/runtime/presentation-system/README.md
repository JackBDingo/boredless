# Presentation System

The Presentation System lets game schemas declare screen templates and per-game themes, enabling the display (TV) and phone clients to render consistently without any game-specific frontend code.

## Architecture

```
presentation-system/
  types.ts              — All type definitions (ScreenDeclaration, GameTheme, ResolvedScreen, ...)
  theme-engine.ts       — defaultTheme, mergeTheme, validateTheme, resolveThemeCSS
  screen-resolver.ts    — resolveScreen, getScreensForSurface, getScreenForPhase
  template-library.ts   — getDefaultTemplate (built-in component lists per template type)
  schema-integration.ts — Zod schemas + parse helpers for game YAML
  index.ts              — Public API (import only from here)
  __tests__/
    presentation-system.test.ts — Comprehensive test suite
```

## Core Concepts

### Screen Declarations

A game schema declares one or more `ScreenDeclaration` objects in its `presentation.screens` array. Each screen has:

- **id** — stable identifier; by convention matches the phase name or `<phase>_<surface>`
- **template** — which built-in template to use (`lobby`, `prompt`, `vote`, `reveal`, `scoreboard`, `results`, `timer`, `info`, `media`, `custom`)
- **surface** — which client renders it (`display`, `phone`, or `both`)
- **components** — optional list of UI components; overrides the template defaults
- **animations** — optional enter/exit transitions

### Themes

Games declare a partial theme in YAML. At runtime, `mergeTheme()` fills in defaults from `defaultTheme`. The resolved theme is a complete `GameTheme` with a full color palette, typography, spacing, etc.

`resolveThemeCSS()` converts a `GameTheme` to CSS custom properties:

```ts
const css = resolveThemeCSS(theme);
// { '--color-primary': '#FF5722', '--font-family': 'Inter, sans-serif', ... }
```

### Screen Resolution

`resolveScreen(declaration, state, theme)` binds component `binding` fields to live game state values:

```ts
const screen = resolveScreen(decl, gameState, theme);
// screen.bindings['globals.round'] === 3
// screen.bindings['phase.timeRemaining'] === 18000
// screen.theme === resolvedTheme
```

### Surface Filtering

```ts
const displayScreens = getScreensForSurface(screens, 'display');
// Returns screens with surface === 'display' OR surface === 'both'

const screen = getScreenForPhase(screens, 'play', 'display');
// Looks for 'play_display' first, then 'play', then 'play_*' prefix
```

## Game YAML Schema

```yaml
presentation:
  theme:
    colors:
      primary: "#FF5722"
      secondary: "#2196F3"
      accent: "#FFC107"
      background: "#1a1a2e"
      surface: "#16213e"
      text: "#ffffff"
    typography:
      fontFamily: "Inter, sans-serif"
      headingFont: "Poppins, sans-serif"
      fontSize: medium
    borderRadius: "12px"
    darkMode: true

  screens:
    - id: lobby
      template: lobby
      surface: both
      title: "Welcome!"
      animations:
        enter: fade
        duration: 300

    - id: play_display
      template: prompt
      surface: display
      title: "Round {{globals.round}}"
      components:
        - type: text
          props: { text: "{{content.currentPrompt}}" }
          style: { fontSize: "2rem" }
        - type: timer
          binding: "phase.timeRemaining"
        - type: player-list
          props: { showScores: true }

    - id: play_phone
      template: prompt
      surface: phone
      components:
        - type: text
          props: { text: "{{content.currentPrompt}}" }
        - type: input
          props: { placeholder: "Type your answer..." }
```

## Template Types

| Template | Components | Layout |
|----------|-----------|--------|
| `lobby` | player-list + text + button-group | centered |
| `prompt` | text + text + timer + input | stack |
| `vote` | text + button-group + timer | grid (2 cols) |
| `reveal` | text + player-list | centered |
| `scoreboard` | score-table + text | list |
| `results` | text + text + score-table + button-group | centered |
| `timer` | timer + text | fullscreen |
| `info` | text + text | centered |
| `media` | image | fullscreen |
| `custom` | (empty) | stack |

## Usage

```ts
import {
  mergeTheme,
  resolveScreen,
  getScreenForPhase,
  getScreensForSurface,
  resolveThemeCSS,
  parsePresentationConfig,
} from '../presentation-system/index.js';

// Parse from YAML
const config = parsePresentationConfig(rawYaml.presentation);

// Resolve theme
const theme = mergeTheme(config.theme ?? {});
const css = resolveThemeCSS(theme);

// Find screen for current phase
const screen = getScreenForPhase(config.screens, 'play', 'display');
if (screen) {
  const resolved = resolveScreen(screen, gameState, theme);
  // resolved.bindings, resolved.theme, resolved.declaration
}
```

## Test Coverage

725 total tests (as of Phase 3.2). The presentation-system suite covers:
- Theme defaults, merge, validate, CSS resolution
- Screen resolution with bindings, missing paths
- Surface filtering (display/phone/both)
- Phase-to-screen matching with priority rules
- All 10 template types
- Zod schema validation for all types
- Full integration pipeline

## Constraints

- **Server-side only** — no React components; this is the declaration layer
- **No game-specific code** — pure data transformation
- **No imports from other V2 subsystems** — standalone, fully unit-testable
- **Phase 3.3 (Asset References) not included** — separate task
