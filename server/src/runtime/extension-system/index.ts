/**
 * index.ts — Public API for the Extension System subsystem.
 *
 * IMPORT RULE: Only import from this file when using the Extension System
 * from other subsystems. Never import directly from internal modules.
 *
 * The Extension System lets game authors register:
 * - Custom renderers (named React components for display/phone surfaces)
 * - Custom rule evaluators (typed functions for complex rule logic)
 * - Custom interaction widgets (custom player input primitives)
 * - Lifecycle hooks (callbacks for game lifecycle events)
 *
 * Extensions are declared in the game schema (YAML) and registered at
 * game-load time. They receive sandboxed copies of game state and cannot
 * access engine internals.
 *
 * Subsystem: extension-system
 * Phase: 4.2
 */

// Core registry
export { ExtensionRegistry } from './extension-registry.js';

// Sandbox utilities
export {
  createSandboxedContext,
  validateExtensionImports,
  wrapRuleHandler,
  wrapLifecycleHandler,
} from './extension-sandbox.js';

// Schema integration
export {
  ExtensionTypeSchema,
  ExtensionDeclarationSchema,
  ExtensionsArraySchema,
  parseExtensions,
  safeParseExtensions,
} from './schema-integration.js';

export type {
  ExtensionDeclarationInput,
  ExtensionDeclarationOutput,
  ExtensionsArrayInput,
  ExtensionsArrayOutput,
} from './schema-integration.js';

// Types (re-exported for consumers)
export type {
  ExtensionDeclaration,
  ExtensionCapabilities,
  RendererExtension,
  RuleExtension,
  InteractionExtension,
  LifecycleHookExtension,
  LifecycleHookName,
  RuleExtensionContext,
  LifecycleContext,
  LoadedExtension,
} from './types.js';
