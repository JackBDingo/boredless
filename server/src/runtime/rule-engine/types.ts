/**
 * types.ts — Type definitions for the Rule Engine subsystem.
 *
 * The Rule Engine allows game schemas to define rules as data:
 * conditions, actions, and constraints — without writing TypeScript.
 *
 * Design: declarative, schema-first, game-agnostic.
 * No game-specific code belongs here — only structural contracts.
 */

// ---------------------------------------------------------------------------
// RuleDeclaration — top-level rule structure
// ---------------------------------------------------------------------------

/**
 * A single rule declaration in a game schema.
 * Rules are evaluated by the RuleEngine when triggered.
 */
export interface RuleDeclaration {
  /** Unique identifier for this rule within the game package. */
  id: string;

  /** Human-readable name (for debugging and tooling). */
  name?: string;

  /** Description of what this rule does. */
  description?: string;

  /** Condition to evaluate. When true, `then` actions are returned. */
  when: RuleCondition;

  /** Actions to execute when the condition is true. */
  then: RuleAction[];

  /** Optional: actions to execute when the condition is false. */
  else?: RuleAction[];

  /**
   * Evaluation order. Higher values are evaluated first.
   * Default: 0.
   */
  priority?: number;

  /**
   * Whether this rule is active. Disabled rules are skipped during evaluation.
   * Default: true.
   */
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// RuleCondition — condition variants
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all condition types supported by the Rule Engine.
 */
export type RuleCondition =
  | ComparisonCondition
  | LogicalCondition
  | ExpressionCondition
  | BuiltInCondition;

/**
 * Compare two values using a comparison operator.
 * Left and right can be field paths (e.g., "globals.score") or literals.
 */
export interface ComparisonCondition {
  type: 'comparison';

  /** Left-hand side: field path (e.g., "globals.score") or numeric literal. */
  left: string | number;

  /** Comparison operator. */
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'in';

  /** Right-hand side: field path, literal, or array for 'in' operator. */
  right: string | number | boolean | string[] | number[];
}

/**
 * Boolean composition of conditions.
 * - 'and': all conditions must be true
 * - 'or': at least one condition must be true
 * - 'not': first condition must be false (only first element used)
 */
export interface LogicalCondition {
  type: 'and' | 'or' | 'not';
  conditions: RuleCondition[];
}

/**
 * Evaluate a free-form expression string.
 * Uses the rule engine's expression evaluator (no eval()).
 *
 * @example
 * { type: 'expression', expr: "globals.score > 100 && phase.name == 'play'" }
 */
export interface ExpressionCondition {
  type: 'expression';
  expr: string;
}

/**
 * Reference a named built-in rule pattern.
 * Built-ins handle common game logic (all players submitted, timer expired, etc.)
 */
export interface BuiltInCondition {
  type: 'builtin';

  /** Name of the registered built-in rule. */
  rule: string;

  /** Optional parameters passed to the built-in evaluator. */
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// RuleAction — action variants
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all action types the Rule Engine can return.
 * Actions are NOT executed by the Rule Engine — callers execute them.
 */
export type RuleAction =
  | SetStateAction
  | EmitEventAction
  | TransitionAction
  | IncrementAction
  | CustomAction;

/**
 * Set a state field to a value.
 * Value can contain $-prefixed expression paths.
 */
export interface SetStateAction {
  type: 'set';

  /** Dotted path into game state (e.g., "globals.winner", "per_player.score"). */
  path: string;

  /** Value to set. May reference context via $expressions. */
  value: unknown;
}

/**
 * Emit a named event into the event system.
 */
export interface EmitEventAction {
  type: 'emit';

  /** Name of the event to emit. */
  event: string;

  /** Optional data payload for the emitted event. */
  data?: Record<string, unknown>;
}

/**
 * Trigger a phase machine transition.
 */
export interface TransitionAction {
  type: 'transition';

  /** Target phase ID to transition to. */
  to: string;
}

/**
 * Increment a numeric state field.
 */
export interface IncrementAction {
  type: 'increment';

  /** Dotted path to the numeric field to increment. */
  path: string;

  /**
   * Amount to increment by. Can be a number or an expression string.
   * Default: 1.
   */
  amount?: number | string;
}

/**
 * Invoke a registered custom action handler.
 */
export interface CustomAction {
  type: 'custom';

  /** Name of the registered custom action handler. */
  handler: string;

  /** Optional parameters passed to the handler. */
  params?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// RuleContext — evaluation context
// ---------------------------------------------------------------------------

/**
 * Context provided to all rule evaluations.
 * Contains the full game state snapshot and runtime metadata.
 */
export interface RuleContext {
  /** Full game state (globals, per_player, etc.). */
  state: Record<string, unknown>;

  /** The event that triggered evaluation, if any. */
  event?: {
    type: string;
    data?: Record<string, unknown>;
  };

  /** Active player IDs in the current room. */
  players: string[];

  /** Current phase name, if known. */
  phase?: string;

  /** Current round number, if applicable. */
  round?: number;
}

// ---------------------------------------------------------------------------
// RuleResult — evaluation output
// ---------------------------------------------------------------------------

/**
 * The result of evaluating a single rule.
 * The caller decides what to do with the matched actions.
 */
export interface RuleResult {
  /** ID of the rule that was evaluated. */
  ruleId: string;

  /** Whether the condition matched (true) or not (false). */
  matched: boolean;

  /**
   * Actions to execute:
   * - If matched: the rule's `then` actions
   * - If not matched and `else` is defined: the `else` actions
   * - If not matched and no `else`: empty array
   */
  actions: RuleAction[];
}

// ---------------------------------------------------------------------------
// BuiltInRule — registered built-in rule type
// ---------------------------------------------------------------------------

/**
 * A registered built-in rule evaluator function.
 */
export type BuiltInRuleFn = (
  context: RuleContext,
  params?: Record<string, unknown>,
) => boolean;

/**
 * Registry entry for a built-in rule.
 */
export interface BuiltInRule {
  name: string;
  evaluate: BuiltInRuleFn;
}
