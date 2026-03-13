/**
 * event-engine.ts — EventEngine class for the Boredless V2 Event System.
 *
 * The EventEngine evaluates declarative event rules at runtime.
 * Rules are defined in game schemas (YAML/JSON); this engine interprets them
 * without any game-specific code.
 *
 * DESIGN CONTRACT:
 * - No game-specific logic. EventEngine doesn't know what games mean.
 * - State mutations go through the stateManager interface, never direct access.
 * - Complex effects (announce, broadcast, etc.) delegate to the onEffect callback.
 * - EventEngine is standalone — it does NOT subscribe to StateManager.onChange().
 *   Callers are responsible for calling emit() at the right moments.
 */

import type {
  EventTrigger,
  EventEffect,
  EventRule,
  FiredEvent,
  EffectContext,
  EventEngineOptions,
} from './types.js';

// ---------------------------------------------------------------------------
// Internal rule runtime state
// ---------------------------------------------------------------------------

/**
 * Per-rule runtime bookkeeping.
 * Tracks enable state and whether a once-only rule has already fired.
 */
interface RuleState {
  enabled: boolean;
  hasFired: boolean; // only meaningful when rule.once === true
}

// ---------------------------------------------------------------------------
// Trigger matching
// ---------------------------------------------------------------------------

/**
 * Determine whether a trigger declaration matches an emitted trigger event.
 *
 * Matching rules:
 * 1. trigger.type must equal emitted.type (exact match required)
 * 2. If trigger.phase is set, emitted.phase must equal it
 * 3. If trigger.field is set, emitted.field must equal it
 *
 * Note: trigger.condition is NOT checked here — it's checked later after
 * the trigger matches, as a guard condition.
 */
function triggerMatches(declared: EventTrigger, emitted: EventTrigger): boolean {
  if (declared.type !== emitted.type) return false;

  if (declared.phase !== undefined && declared.phase !== emitted.phase) {
    return false;
  }

  if (declared.field !== undefined && declared.field !== emitted.field) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// State target parsing
// ---------------------------------------------------------------------------

/**
 * Parse a "scope.field" target string into its components.
 * Supports: "globals.fieldname", "per_player.fieldname"
 */
function parseTarget(target: string): { scope: 'globals' | 'per_player' | 'unknown'; field: string } {
  if (target.startsWith('globals.')) {
    return { scope: 'globals', field: target.slice('globals.'.length) };
  }
  if (target.startsWith('per_player.')) {
    return { scope: 'per_player', field: target.slice('per_player.'.length) };
  }
  return { scope: 'unknown', field: target };
}

// ---------------------------------------------------------------------------
// EventEngine
// ---------------------------------------------------------------------------

export class EventEngine {
  private readonly rules: EventRule[];
  private readonly options: EventEngineOptions;

  /** Per-rule runtime state (keyed by rule ID). */
  private readonly ruleStates: Map<string, RuleState>;

  /** Ordered history of all fired events (for debugging and replay). */
  private readonly history: FiredEvent[];

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /**
   * Create an EventEngine with the given rules and options.
   *
   * @param rules   - Declarative event rules (from game schema or parseEventRules())
   * @param options - State manager, effect callback, condition evaluator
   */
  constructor(rules: EventRule[], options: EventEngineOptions) {
    this.rules = rules;
    this.options = options;
    this.history = [];

    // Initialize per-rule runtime state from rule declarations
    this.ruleStates = new Map();
    for (const rule of rules) {
      this.ruleStates.set(rule.id, {
        enabled: rule.enabled !== false, // default: true
        hasFired: false,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Fire a trigger event. Finds all matching rules, executes their effects,
   * and returns the list of fired events.
   *
   * Processing order:
   * 1. Find all rules with at least one matching trigger
   * 2. Filter to enabled rules
   * 3. Filter out once-only rules that have already fired
   * 4. Check guard conditions (if present)
   * 5. Sort by priority (higher first), then by declaration order within same priority
   * 6. Execute all effects for each rule in order
   * 7. Mark once-only rules as fired
   * 8. Append to history
   *
   * @param trigger - The event that occurred (type + optional phase/field context)
   * @returns List of FiredEvent records for every rule that executed
   */
  emit(trigger: EventTrigger): FiredEvent[] {
    const fired: FiredEvent[] = [];

    // Step 1-4: Find matching, eligible rules
    const eligibleRules = this.findEligibleRules(trigger);

    // Step 5: Sort by priority descending, preserving declaration order for ties
    const sorted = this.sortByPriority(eligibleRules);

    // Step 6-8: Execute each rule
    for (const rule of sorted) {
      const firedEvent: FiredEvent = {
        ruleId: rule.id,
        trigger,
        timestamp: Date.now(),
      };

      // Execute all effects in order
      this.executeEffects(rule, trigger);

      // Mark once-only rules as exhausted
      const state = this.ruleStates.get(rule.id);
      if (state && rule.once) {
        state.hasFired = true;
      }

      this.history.push(firedEvent);
      fired.push(firedEvent);
    }

    return fired;
  }

  /**
   * Enable a rule by ID. Disabled rules do not fire.
   * No-ops if the rule ID is not found.
   */
  enableRule(ruleId: string): void {
    const state = this.ruleStates.get(ruleId);
    if (state) {
      state.enabled = true;
    }
  }

  /**
   * Disable a rule by ID. The rule will not fire until re-enabled.
   * No-ops if the rule ID is not found.
   */
  disableRule(ruleId: string): void {
    const state = this.ruleStates.get(ruleId);
    if (state) {
      state.enabled = false;
    }
  }

  /**
   * Return a copy of the full history of fired events.
   * Useful for debugging, testing assertions, and replay.
   */
  getHistory(): FiredEvent[] {
    return [...this.history];
  }

  /**
   * Clear all fired history and reset once-only rules back to unfired state.
   * Does NOT change enabled/disabled status.
   * Use in tests to reset engine state between assertions.
   */
  reset(): void {
    this.history.length = 0;
    for (const state of this.ruleStates.values()) {
      state.hasFired = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private: rule matching
  // ---------------------------------------------------------------------------

  /**
   * Find all rules that should fire for the given trigger.
   * Applies: trigger matching, enabled check, once-fired check, condition guard.
   */
  private findEligibleRules(trigger: EventTrigger): EventRule[] {
    const eligible: EventRule[] = [];

    for (const rule of this.rules) {
      const state = this.ruleStates.get(rule.id);
      if (!state) continue;

      // 1. Must be enabled
      if (!state.enabled) continue;

      // 2. Once-only rules that already fired are skipped
      if (rule.once && state.hasFired) continue;

      // 3. At least one trigger must match the emitted trigger
      const matchingTrigger = rule.triggers.find((t) => triggerMatches(t, trigger));
      if (!matchingTrigger) continue;

      // 4. Check guard condition (from the matching trigger)
      // We use the condition from the matching trigger (not all triggers in the rule)
      const condition = matchingTrigger.condition;
      if (condition !== undefined) {
        if (!this.evaluateGuardCondition(condition)) {
          continue; // Guard failed — skip this rule
        }
      }

      eligible.push(rule);
    }

    return eligible;
  }

  /**
   * Evaluate a guard condition expression.
   * Delegates to the evaluateCondition option if provided.
   * If no evaluator is provided, all conditions pass (useful for simple tests).
   */
  private evaluateGuardCondition(condition: string): boolean {
    if (!this.options.evaluateCondition) {
      // No evaluator supplied — default to true (permissive)
      return true;
    }
    try {
      return this.options.evaluateCondition(condition);
    } catch (err) {
      // Condition evaluation failed — treat as false (don't fire)
      console.error('[event-engine] Guard condition evaluation failed:', condition, err);
      return false;
    }
  }

  /**
   * Sort rules by priority (higher first).
   * Stable sort: rules with equal priority preserve their original declaration order.
   */
  private sortByPriority(rules: EventRule[]): EventRule[] {
    // Use a stable sort by annotating with original index first
    return rules
      .map((rule, idx) => ({ rule, idx }))
      .sort((a, b) => {
        const priorityA = a.rule.priority ?? 0;
        const priorityB = b.rule.priority ?? 0;
        if (priorityB !== priorityA) return priorityB - priorityA; // higher priority first
        return a.idx - b.idx; // preserve declaration order for ties
      })
      .map(({ rule }) => rule);
  }

  // ---------------------------------------------------------------------------
  // Private: effect execution
  // ---------------------------------------------------------------------------

  /**
   * Execute all effects for a rule in declaration order.
   * Native effects are handled here; others delegate to onEffect.
   */
  private executeEffects(rule: EventRule, trigger: EventTrigger): void {
    const context: EffectContext = { trigger, rule };

    for (const effect of rule.effects) {
      this.executeEffect(effect, context);
    }
  }

  /**
   * Execute a single effect.
   *
   * Native effects:
   *   set_state  → stateManager.setGlobal / setPlayer
   *   increment  → get current + amount, set
   *   decrement  → get current - amount, set
   *
   * All others → delegate to onEffect callback
   */
  private executeEffect(effect: EventEffect, context: EffectContext): void {
    switch (effect.type) {
      case 'set_state':
        this.executeSetState(effect);
        break;

      case 'increment':
        this.executeIncrement(effect, 1);
        break;

      case 'decrement':
        this.executeIncrement(effect, -1);
        break;

      default:
        // Delegate to caller-provided handler
        this.options.onEffect(effect, context);
        break;
    }
  }

  /**
   * Execute set_state: assign a value to a state target.
   */
  private executeSetState(effect: EventEffect): void {
    if (!effect.target) {
      console.warn('[event-engine] set_state effect missing target field');
      return;
    }

    const { scope, field } = parseTarget(effect.target);

    if (scope === 'globals') {
      this.options.stateManager.setGlobal(field, effect.value ?? null);
    } else if (scope === 'per_player') {
      // For per_player targets without a playerId, this is a no-op.
      // Per-player set_state should include a playerId in the data payload,
      // or use a specialized effect type (e.g. set_player_state).
      // Document this limitation: per_player.field without playerId is not supported
      // natively — use the onEffect callback for player-targeted effects.
      console.warn(
        '[event-engine] set_state with per_player target requires playerId — ' +
          'use onEffect callback for player-targeted set_state. Target:', effect.target,
      );
    } else {
      console.warn('[event-engine] set_state: unknown target scope:', effect.target);
    }
  }

  /**
   * Execute increment / decrement: add a signed delta to a state field.
   *
   * @param effect    - The effect declaration
   * @param sign      - +1 for increment, -1 for decrement
   */
  private executeIncrement(effect: EventEffect, sign: number): void {
    if (!effect.target) {
      console.warn('[event-engine] increment/decrement effect missing target field');
      return;
    }

    const { scope, field } = parseTarget(effect.target);
    const amount = (effect.amount ?? 1) * sign;

    if (scope === 'globals') {
      const current = this.options.stateManager.getGlobal(field);
      const next = (Number(current) || 0) + amount;
      this.options.stateManager.setGlobal(field, next);
    } else if (scope === 'per_player') {
      // Same limitation as set_state — per_player without explicit playerId
      // is delegated to the onEffect callback via the effect type chain.
      // For now, warn and no-op.
      console.warn(
        '[event-engine] increment/decrement with per_player target requires playerId — ' +
          'use onEffect callback. Target:', effect.target,
      );
    } else {
      console.warn('[event-engine] increment/decrement: unknown target scope:', effect.target);
    }
  }
}
