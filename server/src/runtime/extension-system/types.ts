/**
 * types.ts — Core type definitions for the Extension System.
 *
 * Extensions are declared escape hatches that let game authors register:
 * - Custom renderer components (for display/phone surfaces)
 * - Custom rule evaluators (typed functions for complex rule logic)
 * - Custom interaction widgets (custom input primitives)
 * - Lifecycle hooks (callbacks for game lifecycle events)
 *
 * KEY PRINCIPLE: Extensions receive sandboxed copies of state — they cannot
 * access engine internals or mutate game state directly. The runtime remains
 * authoritative at all times.
 *
 * Subsystem: extension-system
 * Phase: 4.2
 */

// ---------------------------------------------------------------------------
// Extension Declaration (from game schema)
// ---------------------------------------------------------------------------

/**
 * An extension declaration as it appears in the game schema.
 * Declares that this game uses a specific extension capability.
 */
export interface ExtensionDeclaration {
  id: string;
  name: string;
  version?: string;
  description?: string;
  type: 'renderer' | 'rule' | 'interaction' | 'lifecycle' | 'composite';
  /** Path to extension module (for code extensions — future work). */
  entryPoint?: string;
}

// ---------------------------------------------------------------------------
// Extension Capabilities
// ---------------------------------------------------------------------------

/**
 * What an extension actually provides when registered.
 * An extension can provide any combination of capabilities.
 */
export interface ExtensionCapabilities {
  renderers?: RendererExtension[];
  rules?: RuleExtension[];
  interactions?: InteractionExtension[];
  lifecycleHooks?: LifecycleHookExtension[];
}

// ---------------------------------------------------------------------------
// Renderer Extension
// ---------------------------------------------------------------------------

/**
 * A custom renderer extension registers a named component type.
 * Game schemas reference this by componentType in screen declarations.
 */
export interface RendererExtension {
  id: string;
  name: string;
  /** The component type name referenced in game schema screen declarations. */
  componentType: string;
  /** Which surfaces this renderer supports. */
  surfaces: ('display' | 'phone')[];
  /** JSON Schema for the props this renderer expects. */
  propsSchema?: Record<string, unknown>;
  description?: string;
}

// ---------------------------------------------------------------------------
// Rule Extension
// ---------------------------------------------------------------------------

/**
 * A custom rule extension provides an evaluate function for a named rule type.
 * Game schemas reference this by ruleType in condition declarations.
 */
export interface RuleExtension {
  id: string;
  name: string;
  /** The rule type name referenced in game schema rule conditions. */
  ruleType: string;
  /** JSON Schema for the params this rule accepts. */
  paramSchema?: Record<string, unknown>;
  description?: string;
  /** The evaluation function — receives sandboxed context, returns boolean. */
  evaluate: (context: RuleExtensionContext) => boolean;
}

// ---------------------------------------------------------------------------
// Interaction Extension
// ---------------------------------------------------------------------------

/**
 * A custom interaction widget extension provides a named widget type.
 * Game schemas reference this by widgetType in interaction declarations.
 */
export interface InteractionExtension {
  id: string;
  name: string;
  /** The widget type name referenced in game schema interaction declarations. */
  widgetType: string;
  /** JSON Schema for the input this widget accepts. */
  inputSchema?: Record<string, unknown>;
  /** JSON Schema for the output this widget produces. */
  outputSchema?: Record<string, unknown>;
  description?: string;
}

// ---------------------------------------------------------------------------
// Lifecycle Hook Extension
// ---------------------------------------------------------------------------

/** Named lifecycle events the runtime fires at defined points. */
export type LifecycleHookName =
  | 'onGameStart'
  | 'onGameEnd'
  | 'onPhaseEnter'
  | 'onPhaseExit'
  | 'onPlayerJoin'
  | 'onPlayerLeave'
  | 'onRoundStart'
  | 'onRoundEnd';

/**
 * A lifecycle hook extension registers a handler for a named lifecycle event.
 * Handlers are called with a sandboxed context — they cannot mutate game state.
 */
export interface LifecycleHookExtension {
  id: string;
  hook: LifecycleHookName;
  /** The handler function — called when the lifecycle event fires. */
  handler: (context: LifecycleContext) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Sandboxed Contexts (no engine internals accessible)
// ---------------------------------------------------------------------------

/**
 * The context provided to rule extension evaluate functions.
 * All fields are read-only — extensions cannot mutate game state.
 */
export interface RuleExtensionContext {
  state: Readonly<Record<string, unknown>>;
  players: ReadonlyArray<string>;
  phase?: string;
  round?: number;
  /** Rule-specific params declared in the game schema. */
  params?: Record<string, unknown>;
  /** The event that triggered this rule evaluation (if any). */
  event?: { type: string; data?: Record<string, unknown> };
}

/**
 * The context provided to lifecycle hook handlers.
 * All state fields are read-only — extensions cannot mutate game state.
 */
export interface LifecycleContext {
  state: Readonly<Record<string, unknown>>;
  players: ReadonlyArray<string>;
  phase?: string;
  round?: number;
  gameId: string;
  /** The event that triggered this lifecycle hook (if any). */
  event?: { type: string; data?: Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Loaded Extension
// ---------------------------------------------------------------------------

/**
 * An extension after it has been registered with the ExtensionRegistry.
 * Tracks both the original declaration and the resolved capabilities.
 */
export interface LoadedExtension {
  declaration: ExtensionDeclaration;
  capabilities: ExtensionCapabilities;
  status: 'loaded' | 'error' | 'disabled';
  error?: string;
}
