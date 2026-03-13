/**
 * builtin-rules.ts — Built-in rule patterns for common game mechanics.
 *
 * Built-in rules let game schemas reference common game logic by name
 * instead of writing custom expressions for every case.
 *
 * Usage in schema:
 *   when:
 *     type: builtin
 *     rule: all_players_submitted
 *
 * Custom rules can be registered at runtime:
 *   registerBuiltIn('my_rule', (context, params) => ...)
 */

import type { BuiltInRule, BuiltInRuleFn, RuleContext } from './types.js';

// ---------------------------------------------------------------------------
// Built-in registry
// ---------------------------------------------------------------------------

const registry = new Map<string, BuiltInRule>();

/**
 * Register a built-in rule evaluator function.
 * If a rule with the same name already exists, it will be overwritten.
 */
export function registerBuiltIn(name: string, fn: BuiltInRuleFn): void {
  registry.set(name, { name, evaluate: fn });
}

/**
 * Look up a registered built-in rule by name.
 * Returns undefined if not found.
 */
export function getBuiltIn(name: string): BuiltInRule | undefined {
  return registry.get(name);
}

/**
 * List all registered built-in rule names.
 */
export function listBuiltIns(): string[] {
  return Array.from(registry.keys()).sort();
}

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Deep-traverse an object using a dotted path.
 * Supports wildcard '*' to iterate over all values of an object or array.
 */
function deepGet(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  return deepGetParts(obj, parts);
}

function deepGetParts(obj: unknown, parts: string[]): unknown {
  if (parts.length === 0) return obj;
  if (obj === null || obj === undefined) return undefined;

  const [head, ...rest] = parts;

  if (head === '*') {
    // Wildcard: return array of values for all keys
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      return undefined;
    }
    const values: unknown[] = Object.values(obj as Record<string, unknown>);
    if (rest.length === 0) return values;
    return values.map((v) => deepGetParts(v, rest)).filter((v) => v !== undefined);
  }

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    return deepGetParts((obj as Record<string, unknown>)[head], rest);
  }
  if (Array.isArray(obj)) {
    const idx = parseInt(head, 10);
    if (!isNaN(idx)) return deepGetParts(obj[idx], rest);
  }
  return undefined;
}

/**
 * Get all player submissions from state.
 * Checks state.per_player.* for a 'submitted' or 'submission' boolean/truthy field.
 */
function getPlayerSubmissions(context: RuleContext): Record<string, unknown> {
  const perPlayer = context.state['per_player'];
  if (typeof perPlayer !== 'object' || !perPlayer) return {};
  return perPlayer as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Built-in rule implementations
// ---------------------------------------------------------------------------

/**
 * all_players_submitted — true when every active player has submitted input.
 * Checks state.per_player[playerId].submitted === true for each active player.
 */
registerBuiltIn('all_players_submitted', (context: RuleContext): boolean => {
  if (context.players.length === 0) return false;
  const perPlayer = getPlayerSubmissions(context);
  return context.players.every((playerId) => {
    const playerState = perPlayer[playerId];
    if (typeof playerState === 'object' && playerState !== null) {
      return Boolean((playerState as Record<string, unknown>)['submitted']);
    }
    return false;
  });
});

/**
 * timer_expired — true when context.event.type === 'timer_expired'.
 */
registerBuiltIn('timer_expired', (context: RuleContext): boolean => {
  return context.event?.type === 'timer_expired';
});

/**
 * min_players — true when active player count >= params.min.
 * params: { min: number }
 */
registerBuiltIn('min_players', (context: RuleContext, params?: Record<string, unknown>): boolean => {
  const min = typeof params?.['min'] === 'number' ? params['min'] : 0;
  return context.players.length >= min;
});

/**
 * max_players — true when active player count <= params.max.
 * params: { max: number }
 */
registerBuiltIn('max_players', (context: RuleContext, params?: Record<string, unknown>): boolean => {
  const max = typeof params?.['max'] === 'number' ? params['max'] : Infinity;
  return context.players.length <= max;
});

/**
 * score_reached — true when any player's score at the given path meets or exceeds the target.
 * params: { target: number, path: string }
 * path supports wildcards: "players.*.score"
 */
registerBuiltIn('score_reached', (context: RuleContext, params?: Record<string, unknown>): boolean => {
  const target = typeof params?.['target'] === 'number' ? params['target'] : 0;
  const path = typeof params?.['path'] === 'string' ? params['path'] : 'globals.score';

  const value = deepGet(context.state, path);
  if (Array.isArray(value)) {
    return value.some((v) => typeof v === 'number' && v >= target);
  }
  if (typeof value === 'number') return value >= target;
  return false;
});

/**
 * all_equal — true when all values at the given state path are equal.
 * params: { path: string }
 * path supports wildcards: "per_player.*.vote"
 */
registerBuiltIn('all_equal', (context: RuleContext, params?: Record<string, unknown>): boolean => {
  const path = typeof params?.['path'] === 'string' ? params['path'] : '';
  if (!path) return false;

  const value = deepGet(context.state, path);
  if (!Array.isArray(value) || value.length === 0) return false;

  const first = value[0];
  return value.every((v) => v === first);
});

/**
 * majority_vote — true when a majority of players voted for the same option.
 * params: { path: string } — path to per-player vote values (supports wildcards)
 */
registerBuiltIn('majority_vote', (context: RuleContext, params?: Record<string, unknown>): boolean => {
  const path = typeof params?.['path'] === 'string' ? params['path'] : 'per_player.*.vote';

  const votes = deepGet(context.state, path);
  if (!Array.isArray(votes) || votes.length === 0) return false;

  const counts = new Map<unknown, number>();
  for (const vote of votes) {
    if (vote !== null && vote !== undefined) {
      counts.set(vote, (counts.get(vote) ?? 0) + 1);
    }
  }

  const majority = Math.floor(votes.length / 2) + 1;
  for (const count of counts.values()) {
    if (count >= majority) return true;
  }
  return false;
});

/**
 * last_standing — true when only one non-eliminated player remains.
 * Checks state.per_player[playerId].eliminated for all active players.
 */
registerBuiltIn('last_standing', (context: RuleContext): boolean => {
  if (context.players.length === 0) return false;
  const perPlayer = getPlayerSubmissions(context);

  const alive = context.players.filter((playerId) => {
    const playerState = perPlayer[playerId];
    if (typeof playerState === 'object' && playerState !== null) {
      return !Boolean((playerState as Record<string, unknown>)['eliminated']);
    }
    return true; // no eliminated field = still alive
  });

  return alive.length === 1;
});

/**
 * round_limit — true when round >= params.max.
 * Uses context.round first, falls back to state.globals.round.
 * params: { max: number }
 */
registerBuiltIn('round_limit', (context: RuleContext, params?: Record<string, unknown>): boolean => {
  const max = typeof params?.['max'] === 'number' ? params['max'] : 0;
  const round = context.round ?? (deepGet(context.state, 'globals.round') as number | undefined) ?? 0;
  return round >= max;
});

/**
 * items_remaining — check item count at a path using a comparison operator.
 * params: { path: string, operator: '<' | '>' | '<=' | '>=' | '==' | '!=', count: number }
 */
registerBuiltIn('items_remaining', (context: RuleContext, params?: Record<string, unknown>): boolean => {
  const path = typeof params?.['path'] === 'string' ? params['path'] : '';
  const operator = typeof params?.['operator'] === 'string' ? params['operator'] : '>';
  const target = typeof params?.['count'] === 'number' ? params['count'] : 0;

  if (!path) return false;

  const value = deepGet(context.state, path);
  let count: number;

  if (Array.isArray(value)) {
    count = value.length;
  } else if (typeof value === 'number') {
    count = value;
  } else {
    return false;
  }

  switch (operator) {
    case '<':  return count < target;
    case '>':  return count > target;
    case '<=': return count <= target;
    case '>=': return count >= target;
    case '==': return count === target;
    case '!=': return count !== target;
    default:   return false;
  }
});
