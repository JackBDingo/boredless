/**
 * index.ts — Public API for the Presentation System.
 *
 * Only import from this file. Never import from internal modules directly.
 *
 * @module presentation-system
 */

// Types
export type {
  ScreenTemplateType,
  ScreenLayout,
  ScreenComponent,
  AnimationConfig,
  ScreenDeclaration,
  GameTheme,
  PresentationConfig,
  ResolvedScreen,
} from './types.js';

// Theme engine
export type { DeepPartialGameTheme } from './theme-engine.js';
export {
  defaultTheme,
  mergeTheme,
  validateTheme,
  resolveThemeCSS,
} from './theme-engine.js';

// Screen resolver
export {
  resolveScreen,
  getScreensForSurface,
  getScreenForPhase,
} from './screen-resolver.js';

// Template library
export {
  getDefaultTemplate,
  getTemplateTypes,
} from './template-library.js';

// Schema integration
export {
  ScreenTemplateTypeSchema,
  ScreenLayoutSchema,
  ScreenComponentSchema,
  AnimationConfigSchema,
  ScreenDeclarationSchema,
  GameThemeSchema,
  PartialGameThemeSchema,
  PresentationConfigSchema,
  parsePresentationConfig,
  safeParsePresentationConfig,
} from './schema-integration.js';

export type { PresentationConfigInput, PartialGameTheme } from './schema-integration.js';
