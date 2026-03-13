/**
 * extension-registry.ts — Registry for game extensions.
 *
 * The ExtensionRegistry is the central store for all registered extensions.
 * Extensions are registered by game authors at game-load time and provide
 * custom renderers, rule evaluators, interaction widgets, and lifecycle hooks.
 *
 * VALIDATION RULES:
 * - Duplicate extension IDs are rejected
 * - Duplicate componentType / ruleType / widgetType names are rejected
 * - Each type name must be unique across ALL registered extensions
 *
 * ISOLATION: One ExtensionRegistry instance per game room (created by the
 * interpreter). Extensions from different games never share a registry.
 *
 * Subsystem: extension-system
 * Phase: 4.2
 */

import type {
  ExtensionDeclaration,
  ExtensionCapabilities,
  LoadedExtension,
  RendererExtension,
  RuleExtension,
  InteractionExtension,
  LifecycleHookExtension,
} from './types.js';

export class ExtensionRegistry {
  /** All registered extensions keyed by declaration ID. */
  private readonly _extensions = new Map<string, LoadedExtension>();

  /** Index of componentType → RendererExtension for O(1) lookup. */
  private readonly _rendererIndex = new Map<string, RendererExtension>();

  /** Index of ruleType → RuleExtension for O(1) lookup. */
  private readonly _ruleIndex = new Map<string, RuleExtension>();

  /** Index of widgetType → InteractionExtension for O(1) lookup. */
  private readonly _interactionIndex = new Map<string, InteractionExtension>();

  /** Index of hook name → array of LifecycleHookExtension for O(1) lookup. */
  private readonly _lifecycleIndex = new Map<string, LifecycleHookExtension[]>();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * Register an extension with the registry.
   *
   * @throws Error if the extension ID is already registered
   * @throws Error if any componentType / ruleType / widgetType is already taken
   */
  register(declaration: ExtensionDeclaration, capabilities: ExtensionCapabilities): void {
    // Validate: duplicate extension ID
    if (this._extensions.has(declaration.id)) {
      throw new Error(
        `Extension '${declaration.id}' is already registered. Each extension ID must be unique.`
      );
    }

    // Validate: duplicate renderer componentTypes
    if (capabilities.renderers) {
      for (const renderer of capabilities.renderers) {
        if (this._rendererIndex.has(renderer.componentType)) {
          throw new Error(
            `Renderer componentType '${renderer.componentType}' is already registered by another extension. ` +
              `Component type names must be unique across all extensions.`
          );
        }
      }
    }

    // Validate: duplicate rule ruleTypes
    if (capabilities.rules) {
      for (const rule of capabilities.rules) {
        if (this._ruleIndex.has(rule.ruleType)) {
          throw new Error(
            `Rule ruleType '${rule.ruleType}' is already registered by another extension. ` +
              `Rule type names must be unique across all extensions.`
          );
        }
      }
    }

    // Validate: duplicate interaction widgetTypes
    if (capabilities.interactions) {
      for (const interaction of capabilities.interactions) {
        if (this._interactionIndex.has(interaction.widgetType)) {
          throw new Error(
            `Interaction widgetType '${interaction.widgetType}' is already registered by another extension. ` +
              `Widget type names must be unique across all extensions.`
          );
        }
      }
    }

    // All validations passed — register everything

    // Store the loaded extension
    const loaded: LoadedExtension = {
      declaration,
      capabilities,
      status: 'loaded',
    };
    this._extensions.set(declaration.id, loaded);

    // Index renderers
    if (capabilities.renderers) {
      for (const renderer of capabilities.renderers) {
        this._rendererIndex.set(renderer.componentType, renderer);
      }
    }

    // Index rules
    if (capabilities.rules) {
      for (const rule of capabilities.rules) {
        this._ruleIndex.set(rule.ruleType, rule);
      }
    }

    // Index interactions
    if (capabilities.interactions) {
      for (const interaction of capabilities.interactions) {
        this._interactionIndex.set(interaction.widgetType, interaction);
      }
    }

    // Index lifecycle hooks
    if (capabilities.lifecycleHooks) {
      for (const hook of capabilities.lifecycleHooks) {
        const existing = this._lifecycleIndex.get(hook.hook) ?? [];
        existing.push(hook);
        this._lifecycleIndex.set(hook.hook, existing);
      }
    }
  }

  /**
   * Remove an extension from the registry.
   * Silently no-ops if the extension ID is not registered.
   */
  unregister(extensionId: string): void {
    const loaded = this._extensions.get(extensionId);
    if (!loaded) {
      // Not registered — no-op (idempotent unregister)
      return;
    }

    // Remove from main registry
    this._extensions.delete(extensionId);

    // Remove from renderer index
    if (loaded.capabilities.renderers) {
      for (const renderer of loaded.capabilities.renderers) {
        this._rendererIndex.delete(renderer.componentType);
      }
    }

    // Remove from rule index
    if (loaded.capabilities.rules) {
      for (const rule of loaded.capabilities.rules) {
        this._ruleIndex.delete(rule.ruleType);
      }
    }

    // Remove from interaction index
    if (loaded.capabilities.interactions) {
      for (const interaction of loaded.capabilities.interactions) {
        this._interactionIndex.delete(interaction.widgetType);
      }
    }

    // Remove from lifecycle index
    if (loaded.capabilities.lifecycleHooks) {
      for (const hook of loaded.capabilities.lifecycleHooks) {
        const existing = this._lifecycleIndex.get(hook.hook);
        if (existing) {
          const updated = existing.filter((h) => h !== hook);
          if (updated.length === 0) {
            this._lifecycleIndex.delete(hook.hook);
          } else {
            this._lifecycleIndex.set(hook.hook, updated);
          }
        }
      }
    }
  }

  /**
   * Remove all registered extensions. Resets all indexes.
   */
  clear(): void {
    this._extensions.clear();
    this._rendererIndex.clear();
    this._ruleIndex.clear();
    this._interactionIndex.clear();
    this._lifecycleIndex.clear();
  }

  // ---------------------------------------------------------------------------
  // Lookup
  // ---------------------------------------------------------------------------

  /**
   * Get a loaded extension by its declaration ID.
   */
  get(extensionId: string): LoadedExtension | undefined {
    return this._extensions.get(extensionId);
  }

  /**
   * Get all registered extensions.
   */
  getAll(): LoadedExtension[] {
    return Array.from(this._extensions.values());
  }

  /**
   * Find a renderer extension by its componentType name.
   */
  getRenderer(componentType: string): RendererExtension | undefined {
    return this._rendererIndex.get(componentType);
  }

  /**
   * Find a rule extension by its ruleType name.
   */
  getRule(ruleType: string): RuleExtension | undefined {
    return this._ruleIndex.get(ruleType);
  }

  /**
   * Find an interaction extension by its widgetType name.
   */
  getInteraction(widgetType: string): InteractionExtension | undefined {
    return this._interactionIndex.get(widgetType);
  }

  /**
   * Get all lifecycle hooks registered for a specific lifecycle event.
   * Returns an empty array if no hooks are registered for that event.
   */
  getLifecycleHooks(hook: string): LifecycleHookExtension[] {
    return this._lifecycleIndex.get(hook) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Existence checks
  // ---------------------------------------------------------------------------

  hasRenderer(componentType: string): boolean {
    return this._rendererIndex.has(componentType);
  }

  hasRule(ruleType: string): boolean {
    return this._ruleIndex.has(ruleType);
  }

  hasInteraction(widgetType: string): boolean {
    return this._interactionIndex.has(widgetType);
  }

  // ---------------------------------------------------------------------------
  // List all of a capability type
  // ---------------------------------------------------------------------------

  listRenderers(): RendererExtension[] {
    return Array.from(this._rendererIndex.values());
  }

  listRules(): RuleExtension[] {
    return Array.from(this._ruleIndex.values());
  }

  listInteractions(): InteractionExtension[] {
    return Array.from(this._interactionIndex.values());
  }
}
