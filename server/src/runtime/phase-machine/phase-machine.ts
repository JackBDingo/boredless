/**
 * phase-machine.ts — PhaseMachine class for Boredless V2.
 *
 * The Phase Machine is the core orchestrator that drives declarative games
 * through their phase graph. It replaces the ad-hoc phase transition logic
 * that lives in each V1 game module (switch statements, startRound(), etc.).
 *
 * DESIGN CONTRACT:
 * - No game-specific logic. PhaseMachine doesn't know what games mean.
 * - All behavior is driven by the phase graph from the game schema.
 * - State mutations go through StateManager — never direct map access.
 * - Timer management delegates to the existing timerEngine singleton.
 * - Actions unknown to PhaseMachine are delegated to onAction callback.
 *
 * Phase Types:
 * - timed: runs for a duration, auto-advances on timer expiry via on_exit
 * - input_gate: waits for player input (or timeout), advances via on_complete
 * - conditional: evaluates condition instantly, branches to then/else target
 * - loop: stub — implemented as timed for Phase 1
 *
 * Timer Approach for Tests:
 * Use vi.useFakeTimers() in tests. The timerEngine uses setInterval internally,
 * so vi.useFakeTimers() will intercept it. However, timerEngine also calls
 * sendToSessions (WS), which will fail in unit tests.
 * Solution: PhaseMachine accepts an optional `timerImpl` in options for testing.
 * In production, it uses the real timerEngine singleton.
 */

import { timerEngine } from '../../engine/timer-engine.js';
import { StateManager } from '../state-manager/index.js';
import type { Phases, PhaseNode, PhaseAction } from '../schema-engine/index.js';
import { evaluateCondition } from './expression-eval.js';
import type { PhaseMachineOptions, ExpressionContext } from './types.js';

// ---------------------------------------------------------------------------
// Timer abstraction (enables clean unit testing without WS deps)
// ---------------------------------------------------------------------------

/**
 * Minimal timer interface that mirrors timerEngine.
 * In production: backed by timerEngine singleton.
 * In tests: can be replaced with a test double.
 */
export interface TimerImpl {
  start(
    roomId: string,
    phaseType: string,
    durationMs: number,
    sessionIds: string[],
    onExpire: () => void,
  ): void;
  stop(roomId: string): void;
  getRemaining(roomId: string): number | null;
}

// ---------------------------------------------------------------------------
// Duration parsing
// ---------------------------------------------------------------------------

/**
 * Parse a duration value from schema into milliseconds.
 * Accepts: number (seconds), "30s", "1m", "90s"
 */
function parseDurationMs(duration: number | string): number {
  if (typeof duration === 'number') {
    return duration * 1000;
  }
  const str = duration.trim();
  if (str.endsWith('m')) {
    return parseFloat(str) * 60 * 1000;
  }
  if (str.endsWith('s')) {
    return parseFloat(str) * 1000;
  }
  // Fallback: treat as numeric seconds string
  return parseFloat(str) * 1000;
}

// ---------------------------------------------------------------------------
// PhaseMachine
// ---------------------------------------------------------------------------

export class PhaseMachine {
  private readonly phases: Phases;
  private readonly stateManager: StateManager;
  private readonly options: PhaseMachineOptions;
  private readonly timer: TimerImpl;

  private currentPhaseId: string | null = null;
  private currentPhaseNode: PhaseNode | null = null;

  // input_gate tracking: set of player IDs who have submitted in this phase
  private submittedPlayerIds: Set<string> = new Set();

  // Prevent double-advance (e.g. input gate completes + timer fires simultaneously)
  private advancing = false;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /**
   * @param phases - The phases section from a validated GamePackage
   * @param stateManager - Initialized StateManager for this game session
   * @param options - Callbacks and identifiers
   * @param timerImpl - Optional timer implementation. Defaults to timerEngine singleton.
   *                    Provide a mock in unit tests to avoid WS dependencies.
   */
  constructor(
    phases: Phases,
    stateManager: StateManager,
    options: PhaseMachineOptions,
    timerImpl?: TimerImpl,
  ) {
    this.phases = phases;
    this.stateManager = stateManager;
    this.options = options;
    this.timer = timerImpl ?? timerEngine;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Enter the initial phase and begin phase execution.
   * Must be called exactly once per game session.
   */
  start(initialPhaseId: string): void {
    if (this.currentPhaseId !== null) {
      throw new Error(
        '[phase-machine] start() called more than once. Create a new PhaseMachine per session.',
      );
    }
    this.enterPhase(initialPhaseId);
  }

  /**
   * Get the current phase identifier and node.
   * Returns null before start() is called.
   */
  getCurrentPhase(): { id: string; node: PhaseNode } | null {
    if (this.currentPhaseId === null || this.currentPhaseNode === null) {
      return null;
    }
    return { id: this.currentPhaseId, node: this.currentPhaseNode };
  }

  /**
   * Submit a player input for input_gate phases.
   *
   * @param playerId - The ID of the submitting player
   * @param inputType - The primitive type (e.g. "text_submit", "vote")
   * @param payload - The submitted value
   * @returns true if input was accepted, false if rejected (wrong phase/player/type)
   */
  submitInput(playerId: string, inputType: string, payload: unknown): boolean {
    if (!this.currentPhaseNode || this.currentPhaseId === null) {
      return false;
    }

    if (this.currentPhaseNode.type !== 'input_gate') {
      return false;
    }

    if (this.advancing) {
      return false;
    }

    const inputDef = this.currentPhaseNode.input;
    if (!inputDef) {
      return false;
    }

    // Basic type check — if schema specifies a primitive, verify it matches
    if (inputDef.primitive && inputDef.primitive !== inputType) {
      return false;
    }

    // Apply input to state if target is declared
    if (inputDef.target) {
      this.applyStateTarget(inputDef.target, playerId, payload);
    }

    this.submittedPlayerIds.add(playerId);

    // Check if all required players have submitted
    if (this.checkInputGateComplete()) {
      this.completeInputGate();
    }

    return true;
  }

  /**
   * Clean up timers and stop the phase machine.
   * Call when the game session ends or the room is destroyed.
   */
  destroy(): void {
    this.timer.stop(this.options.roomId);
    this.currentPhaseId = null;
    this.currentPhaseNode = null;
    this.submittedPlayerIds.clear();
    this.advancing = false;
  }

  // ---------------------------------------------------------------------------
  // Phase lifecycle internals
  // ---------------------------------------------------------------------------

  /**
   * Transition into a named phase.
   * Executes on_enter actions, starts timers, etc.
   */
  private enterPhase(phaseId: string): void {
    const phaseNode = this.phases[phaseId];
    if (!phaseNode) {
      // No such phase — game is over
      this.options.onGameEnd();
      return;
    }

    // Stop any running timer from previous phase
    this.timer.stop(this.options.roomId);

    // Reset phase-local state
    this.submittedPlayerIds.clear();
    this.advancing = false;

    this.currentPhaseId = phaseId;
    this.currentPhaseNode = phaseNode;

    // Execute on_enter actions
    if (phaseNode.on_enter) {
      this.executeActions(phaseNode.on_enter);
    }

    // Notify caller of phase change (after on_enter, before timer starts)
    this.options.onPhaseChange(phaseId, phaseNode);

    // Start phase execution based on type
    switch (phaseNode.type) {
      case 'timed':
      case 'loop': // loop is a timed stub for Phase 1
        this.startTimedPhase(phaseNode);
        break;

      case 'input_gate':
        this.startInputGatePhase(phaseNode);
        break;

      case 'conditional':
        this.startConditionalPhase(phaseNode);
        break;
    }
  }

  /**
   * Execute on_exit actions and transition to the next phase.
   */
  private exitPhase(nextPhaseId: string | null): void {
    if (this.advancing) return;
    this.advancing = true;

    const phaseNode = this.currentPhaseNode;

    // Stop timer for this phase
    this.timer.stop(this.options.roomId);

    // Execute on_exit actions
    // NOTE: on_exit may itself contain an "advance" action that determines nextPhaseId
    // We capture the target from those actions.
    let overriddenNextId: string | null = null;

    if (phaseNode?.on_exit) {
      overriddenNextId = this.executeActionsForAdvance(phaseNode.on_exit);
    }

    const target = overriddenNextId ?? nextPhaseId;

    if (target === null) {
      this.options.onGameEnd();
      return;
    }

    this.enterPhase(target);
  }

  /**
   * Execute on_complete actions for input_gate phases.
   */
  private completePhase(nextPhaseId: string | null): void {
    if (this.advancing) return;
    this.advancing = true;

    const phaseNode = this.currentPhaseNode;

    this.timer.stop(this.options.roomId);

    let overriddenNextId: string | null = null;

    if (phaseNode?.on_complete) {
      overriddenNextId = this.executeActionsForAdvance(phaseNode.on_complete);
    }

    const target = overriddenNextId ?? nextPhaseId;

    if (target === null) {
      this.options.onGameEnd();
      return;
    }

    this.enterPhase(target);
  }

  // ---------------------------------------------------------------------------
  // Phase type implementations
  // ---------------------------------------------------------------------------

  private startTimedPhase(phaseNode: PhaseNode): void {
    if (!phaseNode.duration) {
      // No duration — this is a terminal timed phase (game ends after it)
      // We still fire on_exit after a microtask so the caller gets onPhaseChange first
      Promise.resolve().then(() => this.exitPhase(null));
      return;
    }

    const durationMs = parseDurationMs(phaseNode.duration);
    this.timer.start(
      this.options.roomId,
      phaseNode.type,
      durationMs,
      this.options.sessionIds(),
      () => {
        // Timer expired — execute on_exit and advance
        this.exitPhase(null);
      },
    );
  }

  private startInputGatePhase(phaseNode: PhaseNode): void {
    // Check immediately in case there are zero players
    if (this.checkInputGateComplete()) {
      this.completeInputGate();
      return;
    }

    // Start optional timeout timer
    if (phaseNode.duration) {
      const durationMs = parseDurationMs(phaseNode.duration);
      this.timer.start(
        this.options.roomId,
        phaseNode.type,
        durationMs,
        this.options.sessionIds(),
        () => {
          // Timeout — advance even if not all players submitted
          this.completeInputGate();
        },
      );
    }
  }

  private startConditionalPhase(phaseNode: PhaseNode): void {
    // Conditional phases are instant — evaluate and advance synchronously
    // Use a microtask so callers get onPhaseChange before the next enterPhase fires
    Promise.resolve().then(() => {
      if (!this.currentPhaseNode || this.currentPhaseNode !== phaseNode) {
        return; // Phase was destroyed before microtask ran
      }

      const condition = phaseNode.condition;
      if (!condition) {
        // No condition — game ends
        this.options.onGameEnd();
        return;
      }

      const context = this.buildExpressionContext();
      try {
        // Validate condition is parseable before proceeding
        evaluateCondition(condition, context);
      } catch (err) {
        // Expression error — end game
        console.error('[phase-machine] Condition evaluation failed:', err);
        this.options.onGameEnd();
        return;
      }

      // Conditional phases use on_exit actions (typically a conditional action)
      // to determine the next phase.
      this.exitPhase(null);
    });
  }

  // ---------------------------------------------------------------------------
  // Input gate completion
  // ---------------------------------------------------------------------------

  private completeInputGate(): void {
    this.completePhase(null);
  }

  private checkInputGateComplete(): boolean {
    const phaseNode = this.currentPhaseNode;
    if (!phaseNode || phaseNode.type !== 'input_gate') return false;

    const required = phaseNode.input?.required;

    if (required === 'all_players') {
      const allPlayers = this.stateManager.getPlayerIds();
      return allPlayers.length > 0 && allPlayers.every((id) => this.submittedPlayerIds.has(id));
    }

    // Default: if no required specified, advance once anyone submits
    if (!required) {
      return this.submittedPlayerIds.size > 0;
    }

    // required is an array of specific player IDs
    if (Array.isArray(required)) {
      return required.every((id: string) => this.submittedPlayerIds.has(id));
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Action execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a list of actions. Returns void.
   * (Does not process "advance" — use executeActionsForAdvance for that.)
   */
  private executeActions(actions: PhaseAction[]): void {
    for (const action of actions) {
      this.executeAction(action);
    }
  }

  /**
   * Execute a list of actions and return the target phase ID from
   * any "advance" or "conditional" action encountered.
   */
  private executeActionsForAdvance(actions: PhaseAction[]): string | null {
    let nextPhaseId: string | null = null;

    for (const action of actions) {
      const result = this.executeActionWithAdvance(action);
      if (result !== null) {
        nextPhaseId = result;
      }
    }

    return nextPhaseId;
  }

  /**
   * Execute a single action. Does NOT process advance targets.
   */
  private executeAction(action: PhaseAction): void {
    this.executeActionWithAdvance(action);
  }

  /**
   * Execute a single action. Returns the advance target phase ID if the
   * action produces one (advance/conditional), null otherwise.
   */
  private executeActionWithAdvance(action: PhaseAction): string | null {
    switch (action.action) {
      case 'advance':
        // Return the target for the caller to use
        return (action as { action: string; to?: string }).to ?? null;

      case 'conditional': {
        const conditionalAction = action as {
          action: string;
          condition?: string;
          then?: { advance_to?: string };
          else?: { advance_to?: string };
        };
        if (!conditionalAction.condition) return null;
        const context = this.buildExpressionContext();
        let result: boolean;
        try {
          result = evaluateCondition(conditionalAction.condition, context);
        } catch (err) {
          console.error('[phase-machine] Condition evaluation failed:', err);
          return null;
        }
        const branch = result ? conditionalAction.then : conditionalAction.else;
        return branch?.advance_to ?? null;
      }

      case 'increment': {
        const target = (action as { action: string; target?: string }).target;
        if (!target) break;
        const { scope, field } = parseStateTarget(target);
        if (scope === 'globals') {
          const current = this.stateManager.getGlobal(field);
          this.stateManager.setGlobal(field, (Number(current) || 0) + 1);
        }
        // per_player increment not supported in Phase 1 — no active player concept
        break;
      }

      case 'set': {
        const setAction = action as { action: string; target?: string; value?: unknown };
        if (!setAction.target) break;
        const { scope, field, playerId } = parseStateTarget(setAction.target);
        if (scope === 'globals') {
          this.stateManager.setGlobal(field, setAction.value ?? null);
        } else if (scope === 'per_player' && playerId) {
          this.stateManager.setPlayer(playerId, field, setAction.value ?? null);
        }
        break;
      }

      case 'reset_players': {
        const resetAction = action as { action: string; field?: string };
        if (!resetAction.field) break;
        // Reset all players' field to its schema default
        const defaultValue = this.getPerPlayerDefault(resetAction.field);
        this.stateManager.setPlayerAll(resetAction.field, defaultValue);
        break;
      }

      default:
        // Unknown action — delegate to interpreter layer
        this.options.onAction(action);
        break;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // State helpers
  // ---------------------------------------------------------------------------

  /**
   * Apply an input value to the declared target state field.
   * Handles "per_player.fieldname" for the submitting player.
   */
  private applyStateTarget(target: string, playerId: string, value: unknown): void {
    const { scope, field } = parseStateTarget(target);
    if (scope === 'per_player') {
      this.stateManager.setPlayer(playerId, field, value);
    } else if (scope === 'globals') {
      this.stateManager.setGlobal(field, value);
    }
  }

  /**
   * Build an ExpressionContext backed by this StateManager.
   */
  private buildExpressionContext(): ExpressionContext {
    return {
      getGlobal: (field: string) => this.stateManager.getGlobal(field),
      getPlayer: (playerId: string, field: string) =>
        this.stateManager.getPlayer(playerId, field),
    };
  }

  /**
   * Get the schema-declared default for a per_player field.
   * Returns null if no default is declared.
   */
  private getPerPlayerDefault(_field: string): unknown {
    // StateManager doesn't expose stateModel directly, so we read the current value
    // from the first player as a proxy — or return null.
    // In Phase 1, null is a safe default for resetting answers between rounds.
    // Full implementation would read from stateModel.per_player[field].default
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utility: parse "scope.field" state target strings
// ---------------------------------------------------------------------------

interface ParsedStateTarget {
  scope: 'globals' | 'per_player' | 'per_team' | 'unknown';
  field: string;
  playerId?: string; // present for explicit per_player.playerId.field targets
}

function parseStateTarget(target: string): ParsedStateTarget {
  if (target.startsWith('globals.')) {
    return { scope: 'globals', field: target.slice('globals.'.length) };
  }
  if (target.startsWith('per_player.')) {
    // Format: "per_player.fieldname" — applies to the active/submitting player
    return { scope: 'per_player', field: target.slice('per_player.'.length) };
  }
  if (target.startsWith('per_team.')) {
    return { scope: 'per_team', field: target.slice('per_team.'.length) };
  }
  return { scope: 'unknown', field: target };
}
