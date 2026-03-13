/**
 * theme-engine.ts — Theme management for the Presentation System.
 *
 * Provides:
 * - defaultTheme: sensible dark-mode defaults
 * - mergeTheme: merge partial user theme with defaults
 * - validateTheme: check color formats and required fields
 * - resolveThemeCSS: convert theme to CSS custom properties map
 */

import type { GameTheme } from './types.js';

// ---------------------------------------------------------------------------
// Default theme
// ---------------------------------------------------------------------------

/**
 * Default dark theme used when a game doesn't declare its own.
 *
 * Uses a deep navy/indigo palette with high contrast for TV display readability.
 */
export const defaultTheme: GameTheme = {
  name: 'default',
  colors: {
    primary: '#6366f1',
    secondary: '#4f46e5',
    accent: '#f59e0b',
    background: '#0f0f1a',
    surface: '#1a1a2e',
    text: '#f8fafc',
    textSecondary: '#94a3b8',
    error: '#ef4444',
    success: '#22c55e',
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    headingFont: 'Inter, system-ui, sans-serif',
    fontSize: 'medium',
  },
  borderRadius: '8px',
  spacing: 'normal',
  darkMode: true,
};

// ---------------------------------------------------------------------------
// mergeTheme
// ---------------------------------------------------------------------------

/**
 * Deep-merges a partial user theme with the defaultTheme.
 *
 * Only `colors` is deep-merged (so partial color overrides work).
 * Top-level scalars (borderRadius, spacing, darkMode) replace defaults.
 * Missing fields fall back to defaults.
 */
export type DeepPartialGameTheme = {
  name?: string;
  colors?: Partial<GameTheme['colors']>;
  typography?: Partial<NonNullable<GameTheme['typography']>>;
  borderRadius?: string;
  spacing?: GameTheme['spacing'];
  darkMode?: boolean;
};

export function mergeTheme(partial: DeepPartialGameTheme): GameTheme {
  const merged: GameTheme = {
    ...defaultTheme,
    ...partial,
    colors: {
      ...defaultTheme.colors,
      ...(partial.colors ?? {}),
    },
  };

  // Deep merge typography if provided
  if (partial.typography !== undefined) {
    merged.typography = {
      ...defaultTheme.typography,
      ...partial.typography,
    };
  }

  return merged;
}

// ---------------------------------------------------------------------------
// validateTheme
// ---------------------------------------------------------------------------

/**
 * CSS color validation.
 * Accepts:
 * - Hex: #rgb, #rrggbb, #rgba, #rrggbbaa (must end after hex chars)
 * - Functions: rgb(...), rgba(...), hsl(...), hsla(...)
 * - CSS named colors: a curated allowlist of common valid CSS color names
 * - 'transparent', 'currentColor', 'inherit', 'initial', 'unset'
 *
 * Rejects arbitrary hyphenated strings like 'not-a-color' or 'dark-background'.
 */

/** Common valid CSS named colors (not an exhaustive list but covers real use cases). */
const NAMED_CSS_COLORS = new Set([
  'aliceblue','antiquewhite','aqua','aquamarine','azure','beige','bisque','black',
  'blanchedalmond','blue','blueviolet','brown','burlywood','cadetblue','chartreuse',
  'chocolate','coral','cornflowerblue','cornsilk','crimson','cyan','darkblue','darkcyan',
  'darkgoldenrod','darkgray','darkgreen','darkgrey','darkkhaki','darkmagenta',
  'darkolivegreen','darkorange','darkorchid','darkred','darksalmon','darkseagreen',
  'darkslateblue','darkslategray','darkslategrey','darkturquoise','darkviolet',
  'deeppink','deepskyblue','dimgray','dimgrey','dodgerblue','firebrick','floralwhite',
  'forestgreen','fuchsia','gainsboro','ghostwhite','gold','goldenrod','gray','green',
  'greenyellow','grey','honeydew','hotpink','indianred','indigo','ivory','khaki',
  'lavender','lavenderblush','lawngreen','lemonchiffon','lightblue','lightcoral',
  'lightcyan','lightgoldenrodyellow','lightgray','lightgreen','lightgrey','lightpink',
  'lightsalmon','lightseagreen','lightskyblue','lightslategray','lightslategrey',
  'lightsteelblue','lightyellow','lime','limegreen','linen','magenta','maroon',
  'mediumaquamarine','mediumblue','mediumorchid','mediumpurple','mediumseagreen',
  'mediumslateblue','mediumspringgreen','mediumturquoise','mediumvioletred',
  'midnightblue','mintcream','mistyrose','moccasin','navajowhite','navy','oldlace',
  'olive','olivedrab','orange','orangered','orchid','palegoldenrod','palegreen',
  'paleturquoise','palevioletred','papayawhip','peachpuff','peru','pink','plum',
  'powderblue','purple','rebeccapurple','red','rosybrown','royalblue','saddlebrown',
  'salmon','sandybrown','seagreen','seashell','sienna','silver','skyblue','slateblue',
  'slategray','slategrey','snow','springgreen','steelblue','tan','teal','thistle',
  'tomato','turquoise','violet','wheat','white','whitesmoke','yellow','yellowgreen',
  // CSS keywords
  'transparent','currentcolor','inherit','initial','unset',
]);

/** Hex color pattern: #RGB, #RGBA, #RRGGBB, #RRGGBBAA — nothing after. */
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** CSS color function prefix — starts with rgb(, rgba(, hsl(, hsla(, oklch(, etc. */
const CSS_FUNC_RE = /^(rgb|rgba|hsl|hsla|oklch|oklab|lch|lab|color)\(/i;

function isValidCssColor(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();

  // Hex colors
  if (HEX_COLOR_RE.test(trimmed)) return true;

  // CSS function calls (rgb(), hsl(), etc.)
  if (CSS_FUNC_RE.test(trimmed)) return true;

  // Named CSS colors (lowercase comparison)
  if (NAMED_CSS_COLORS.has(trimmed.toLowerCase())) return true;

  return false;
}

/**
 * Validates a theme for correctness.
 *
 * Checks:
 * - All required color fields are present
 * - All color values are valid CSS color strings
 * - Optional color fields (if present) are valid CSS colors
 */
export function validateTheme(theme: GameTheme): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!theme.colors) {
    errors.push('colors is required');
    return { valid: false, errors };
  }

  const requiredColors: (keyof GameTheme['colors'])[] = [
    'primary',
    'secondary',
    'accent',
    'background',
    'surface',
    'text',
  ];

  for (const key of requiredColors) {
    const value = theme.colors[key];
    if (!value) {
      errors.push(`colors.${key} is required`);
    } else if (!isValidCssColor(value)) {
      errors.push(`colors.${key} has invalid color value: "${value}"`);
    }
  }

  // Check optional color fields if present
  const optionalColors: (keyof GameTheme['colors'])[] = [
    'textSecondary',
    'error',
    'success',
  ];

  for (const key of optionalColors) {
    const value = theme.colors[key];
    if (value !== undefined && value !== null && !isValidCssColor(value)) {
      errors.push(`colors.${key} has invalid color value: "${value}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// resolveThemeCSS
// ---------------------------------------------------------------------------

/**
 * Converts a theme to a CSS custom properties map.
 *
 * The keys are CSS variable names (e.g. `--color-primary`).
 * The values are the CSS values to assign.
 *
 * This map can be applied to a root element's style to theme the entire surface.
 */
export function resolveThemeCSS(theme: GameTheme): Record<string, string> {
  const css: Record<string, string> = {};

  // Colors
  css['--color-primary'] = theme.colors.primary;
  css['--color-secondary'] = theme.colors.secondary;
  css['--color-accent'] = theme.colors.accent;
  css['--color-background'] = theme.colors.background;
  css['--color-surface'] = theme.colors.surface;
  css['--color-text'] = theme.colors.text;

  if (theme.colors.textSecondary) {
    css['--color-text-secondary'] = theme.colors.textSecondary;
  }
  if (theme.colors.error) {
    css['--color-error'] = theme.colors.error;
  }
  if (theme.colors.success) {
    css['--color-success'] = theme.colors.success;
  }

  // Typography
  if (theme.typography?.fontFamily) {
    css['--font-family'] = theme.typography.fontFamily;
  }
  if (theme.typography?.headingFont) {
    css['--font-heading'] = theme.typography.headingFont;
  }
  if (theme.typography?.fontSize) {
    const sizeMap = { small: '14px', medium: '16px', large: '18px' };
    css['--font-size-base'] = sizeMap[theme.typography.fontSize];
  }

  // Misc
  if (theme.borderRadius) {
    css['--border-radius'] = theme.borderRadius;
  }
  if (theme.spacing) {
    const spacingMap = { compact: '8px', normal: '16px', relaxed: '24px' };
    css['--spacing-unit'] = spacingMap[theme.spacing];
  }

  return css;
}
