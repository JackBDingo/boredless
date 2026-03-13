/**
 * rule-engine.ts — Main RuleEngine class.
 *
 * Evaluates a set of RuleDeclarations against a RuleContext and returns
 * RuleResult objects. The engine does NOT execute actions — callers
 * (interpreter/game module) are responsible for acting on results.
 *
 * Design principles:
 * - Pure evaluation: no side effects, no state mutation
 * - Priority ordering: higher priority rules evaluate first
 * - Runtime control: enable/disable/add/remove rules dynamically
 * - Custom actions: register handlers for 'custom' action types
 */

import type {
  RuleDeclaration,
  RuleResult,
  RuleContext,
  RuleAction,
} from './types.js';
import { evaluateCondition } from './condition-evaluator.js';

// ---------------------------------------------------------------------------
// Custom action handler type
// ---------------------------------------------------------------------------

/**
 * A registered custom action handler.
 * Called when a custom action is returned and the caller processes results.
 * Returns additional RuleActions to be appended to the result set.
 */
export type CustomActionHandler = (
  params: Record<string, unknown>,
  context: RuleContext,
) => RuleAction[];

// ---------------------------------------------------------------------------
// RuleEngine class
// ---------------------------------------------------------------------------

/**
 * Evaluates declarative game rules against runtime context.
 *
 * @example
 * const engine = new RuleEngine(gamePackage.rules);
 * const results = engine.evaluate(context);
 * for (const result of results) {
 *   if (result.matched) {
 *     executeActions(result.actions);
 *   }
 * }
 */
export class RuleEngine {
  private rules: Map<string, RuleDeclaration>;
  private ruleOrder: string[]; // maintains insertion order for same-priority sorting
  private customActionHandlers: Map<string, CustomActionHandler>;

  constructor(rules: RuleDeclaration[]) {
    this.rules = new Map();
    this.ruleOrder = [];
    this.customActionHandlers = new Map();

    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  // ---------------------------------------------------------------------------
  // Core evaluation
  // ---------------------------------------------------------------------------

  /**
   * Evaluate ALL enabled rules against the given context.
   * Returns results sorted by priority (higher first).
   * Disabled rules are skipped.
   *
   * @param context - Runtime context (state, event, players, phase, round)
   * @returns Array of RuleResult, sorted by priority descending
   */
  evaluate(context: RuleContext): RuleResult[] {
    const sorted = this.getSortedRules();
    const results: RuleResult[] = [];

    for (const rule of sorted) {
      if (rule.enabled === false) continue;
      results.push(this.evaluateSingleRule(rule, context));
    }

    return results;
  }

  /**
   * Evaluate a single rule by ID.
   *
   * @param ruleId - ID of the rule to evaluate
   * @param context - Runtime context
   * @returns RuleResult for the specified rule
   * @throws Error if rule ID not found
   */
  evaluateRule(ruleId: string, context: RuleContext): RuleResult {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`[rule-engine] Rule not found: '${ruleId}'`);
    }
    return this.evaluateSingleRule(rule, context);
  }

  // ---------------------------------------------------------------------------
  // Rule management
  // ---------------------------------------------------------------------------

  /**
   * Add a rule to the engine.
   * If a rule with the same ID exists, it will be replaced.
   */
  addRule(rule: RuleDeclaration): void {
    if (!this.rules.has(rule.id)) {
      this.ruleOrder.push(rule.id);
    }
    this.rules.set(rule.id, { ...rule });
  }

  /**
   * Remove a rule from the engine.
   * No-op if the rule doesn't exist.
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    this.ruleOrder = this.ruleOrder.filter((id) => id !== ruleId);
  }

  /**
   * Enable a rule (sets enabled = true).
   * @throws Error if rule ID not found
   */
  enable(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`[rule-engine] Rule not found: '${ruleId}'`);
    this.rules.set(ruleId, { ...rule, enabled: true });
  }

  /**
   * Disable a rule (sets enabled = false).
   * Disabled rules are skipped during evaluate().
   * @throws Error if rule ID not found
   */
  disable(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (!rule) throw new Error(`[rule-engine] Rule not found: '${ruleId}'`);
    this.rules.set(ruleId, { ...rule, enabled: false });
  }

  /**
   * Get all rules in priority order.
   */
  getRules(): RuleDeclaration[] {
    return this.getSortedRules();
  }

  // ---------------------------------------------------------------------------
  // Custom action handlers
  // ---------------------------------------------------------------------------

  /**
   * Register a custom action handler.
   * Called by the game interpreter when processing 'custom' actions.
   *
   * @param name - Handler name matching CustomAction.handler
   * @param handler - Function that receives params + context and returns actions
   */
  registerCustomAction(
    name: string,
    handler: CustomActionHandler,
  ): void {
    this.customActionHandlers.set(name, handler);
  }

  /**
   * Get a registered custom action handler by name.
   */
  getCustomActionHandler(name: string): CustomActionHandler | undefined {
    return this.customActionHandlers.get(name);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Evaluate a single rule and return its result.
   * Handles the then/else logic.
   */
  private evaluateSingleRule(rule: RuleDeclaration, context: RuleContext): RuleResult {
    let matched: boolean;

    try {
      matched = evaluateCondition(rule.when, context);
    } catch (err) {
      // Condition evaluation errors result in a non-match with empty actions
      // Re-throw to allow callers to handle gracefully
      throw new Error(
        `[rule-engine] Error evaluating rule '${rule.id}': ${(err as Error).message}`,
      );
    }

    let actions: RuleAction[];
    if (matched) {
      actions = rule.then;
    } else if (rule.else) {
      actions = rule.else;
    } else {
      actions = [];
    }

    return {
      ruleId: rule.id,
      matched,
      actions,
    };
  }

  /**
   * Return rules sorted by priority descending (higher priority first),
   * with insertion order as tiebreaker.
   */
  private getSortedRules(): RuleDeclaration[] {
    return this.ruleOrder
      .map((id) => this.rules.get(id))
      .filter((r): r is RuleDeclaration => r !== undefined)
      .sort((a, b) => {
        const pa = a.priority ?? 0;
        const pb = b.priority ?? 0;
        if (pb !== pa) return pb - pa; // higher priority first
        // Preserve insertion order for same priority
        return this.ruleOrder.indexOf(a.id) - this.ruleOrder.indexOf(b.id);
      });
  }
}
