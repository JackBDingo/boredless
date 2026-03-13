/**
 * types.ts — Type definitions for the Event System subsystem.
 *
 * The Event System allows game schemas to declare trigger → effect rules
 * without writing TypeScript. Rules are evaluated by the EventEngine at runtime.
 *
 * Design: event-driven, declarative, schema-first.
 * No game-specific code belongs here — only structural contracts.
 */

// ---------------------------------------------------------------------------
// EventTrigger — when something happens
// ---------------------------------------------------------------------------

/**
 * Describes the condition under which an EventRule activates.
 *
 * - phase_enter / phase_exit: fires when the Phase Machine enters or exits a named phase
 * - state_change: fires when a specific state field changes value
 * - input_received: fires when any player submits input in the current phase
 * - timer_expire: fires when a phase timer expires
 * - game_start: fires once when the game session begins
 * - game_end: fires once when the game session ends
 */
export interface EventTrigger {
  /** The class of event this trigger responds to. */
  type:
    | 'phase_enter'
    | 'phase_exit'
    | 'state_change'
    | 'input_received'
    | 'timer_expire'
    | 'game_start'
    | 'game_end';

  /**
   * For phase_enter / phase_exit: which phase to match.
   * If omitted, matches ANY phase transition of the given type.
   */
  phase?: string;

  /**
   * For state_change: which field to watch (e.g. "globals.round").
   * If omitted, fires on ANY state change.
   */
  field?: string;

  /**
   * Optional guard condition expression. If present, the rule only fires
   * when this expression evaluates to true.
   * Syntax is the same as Phase Machine conditions:
   *   "globals.round == globals.total_rounds"
   */
  condition?: string;
}

// ---------------------------------------------------------------------------
// EventEffect — what to do when triggered
// ---------------------------------------------------------------------------

/**
 * Describes a side effect executed when an EventRule fires.
 *
 * Effects handled natively by EventEngine:
 *   set_state, increment, decrement
 *
 * Effects delegated to onEffect callback:
 *   add_points, broadcast, play_sound, announce, advance_phase, custom
 */
export interface EventEffect {
  /** The type of effect to execute. */
  type:
    | 'set_state'
    | 'increment'
    | 'decrement'
    | 'add_points'
    | 'broadcast'
    | 'play_sound'
    | 'announce'
    | 'advance_phase'
    | 'custom';

  /**
   * State field target for set_state / increment / decrement.
   * Format: "globals.fieldname" or "per_player.fieldname"
   */
  target?: string;

  /** Value to set for set_state. */
  value?: unknown;

  /** Amount to add/subtract for increment / decrement / add_points. Defaults to 1. */
  amount?: number;

  /** Message text for announce / broadcast. */
  message?: string;

  /** Sound identifier for play_sound. */
  sound?: string;

  /** Named custom effect — looked up by the onEffect handler. */
  custom?: string;

  /** Arbitrary key-value data passed to custom effects and onEffect. */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EventRule — a complete trigger → effect declaration
// ---------------------------------------------------------------------------

/**
 * A fully declared event rule: any trigger fires all effects in order.
 *
 * Rules are evaluated in priority order (higher first).
 * Rules with the same priority execute in declaration order.
 */
export interface EventRule {
  /** Unique identifier for this rule within a game package. */
  id: string;

  /** Human-readable name (for debugging and tooling). */
  name?: string;

  /**
   * One or more triggers. The rule fires if ANY trigger matches.
   * (Triggers within a rule are OR'd; effects within a rule are AND'd.)
   */
  triggers: EventTrigger[];

  /** Effects to execute in order when the rule fires. */
  effects: EventEffect[];

  /**
   * Execution priority. Higher values execute first.
   * Rules with the same priority execute in declaration order.
   * Default: 0.
   */
  priority?: number;

  /**
   * If true, this rule fires at most once per game session.
   * After firing, it is marked as exhausted and skipped on subsequent triggers.
   * Call reset() to re-enable for testing.
   * Default: false.
   */
  once?: boolean;

  /**
   * Whether this rule is currently active. Can be toggled at runtime
   * via EventEngine.enableRule() / disableRule().
   * Default: true.
   */
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// FiredEvent — audit trail entry
// ---------------------------------------------------------------------------

/**
 * A record of a rule that fired during the session.
 * Used for debugging, testing, and replay.
 */
export interface FiredEvent {
  /** ID of the rule that fired. */
  ruleId: string;

  /** The specific trigger that activated the rule. */
  trigger: EventTrigger;

  /** Unix timestamp (Date.now()) when the rule fired. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// EffectContext — passed to the onEffect callback
// ---------------------------------------------------------------------------

/**
 * Context provided to the onEffect callback alongside the effect definition.
 * Enables the handler to know which trigger caused the effect.
 */
export interface EffectContext {
  /** The trigger that caused this effect to fire. */
  trigger: EventTrigger;

  /** The rule that contains this effect. */
  rule: EventRule;
}

// ---------------------------------------------------------------------------
// EventEngineOptions — constructor configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for constructing an EventEngine.
 */
export interface EventEngineOptions {
  /**
   * StateManager instance for native state-mutation effects
   * (set_state, increment, decrement).
   */
  stateManager: {
    getGlobal(field: string): unknown;
    setGlobal(field: string, value: unknown): void;
    getPlayer(playerId: string, field: string): unknown;
    setPlayer(playerId: string, field: string, value: unknown): void;
  };

  /**
   * Callback for effects not handled natively by the EventEngine.
   * Covers: add_points, broadcast, play_sound, announce, advance_phase, custom.
   */
  onEffect: (effect: EventEffect, context: EffectContext) => void;

  /**
   * Expression evaluator for guard conditions.
   * Signature matches evaluateCondition from phase-machine/expression-eval.ts.
   *
   * Must return true to allow the rule to fire.
   * If omitted, all conditions evaluate to true (useful for testing simple rules).
   */
  evaluateCondition?: (expression: string) => boolean;
}
