/**
 * declarative-game-module.ts — DeclarativeGameModule: the keystone of Phase 1.3.
 *
 * DeclarativeGameModule implements the V1 GameModule interface, allowing V2
 * declarative game packages (loaded from game.yaml) to run within the existing
 * kernel without modification. From the kernel's perspective, there is NO
 * difference between a V1 imperative module and a V2 declarative module.
 *
 * DESIGN CONTRACT:
 * - No game-specific logic. Everything is driven by the game schema.
 * - Delegates state management to StateManager.
 * - Delegates phase orchestration to PhaseMachine.
 * - Delegates input validation to Interaction Primitives.
 * - Uses GameContext exactly as V1 modules do.
 * - Zero `if (gameId === ...)` in this file.
 */

import type { GameModule } from '../../games/game-module.js';
import type { GameContext } from '../../games/game-context.js';
import type { Player, PhaseState, GameDefinition } from '@boredless/shared';
import { ServerMessageType, RoomStatus } from '@boredless/shared';
import type { GamePackage, PhaseAction, PhaseNode } from '../schema-engine/index.js';
import { StateManager } from '../state-manager/index.js';
import { PhaseMachine } from '../phase-machine/index.js';
import type { TimerImpl } from '../phase-machine/index.js';
import { InputCollector, createPrimitive } from '../interaction-primitives/index.js';

// ---------------------------------------------------------------------------
// Internal per-room state
// ---------------------------------------------------------------------------

interface RoomState {
  ctx: GameContext;
  stateManager: StateManager;
  phaseMachine: PhaseMachine;
  players: Player[];
  inputCollector: InputCollector | null;
  currentPhaseId: string;
}

// ---------------------------------------------------------------------------
// Utility: parse duration string to ms
// ---------------------------------------------------------------------------

function parseDurationMs(duration: number | string): number {
  if (typeof duration === 'number') return duration * 1000;
  const str = duration.trim();
  if (str.endsWith('m')) return parseFloat(str) * 60_000;
  if (str.endsWith('s')) return parseFloat(str) * 1_000;
  return parseFloat(str) * 1_000;
}

// ---------------------------------------------------------------------------
// DeclarativeGameModule
// ---------------------------------------------------------------------------

export class DeclarativeGameModule implements GameModule {
  readonly definition: GameDefinition;
  private readonly gamePackage: GamePackage;
  private readonly timerImpl: TimerImpl | undefined;

  /** Per-room state. One entry per active room. */
  private readonly rooms = new Map<string, RoomState>();

  /**
   * @param definition  - V1-compatible game definition (for catalog display)
   * @param gamePackage - The fully validated V2 game package
   * @param timerImpl   - Optional timer override for testing
   */
  constructor(definition: GameDefinition, gamePackage: GamePackage, timerImpl?: TimerImpl) {
    this.definition = definition;
    this.gamePackage = gamePackage;
    this.timerImpl = timerImpl;
  }

  // ---------------------------------------------------------------------------
  // GameModule.setup — called by kernel when host starts the game
  // ---------------------------------------------------------------------------

  setup(players: Player[], ctx: GameContext): void {
    const roomId = ctx.roomId;
    const playerIds = players.map(p => p.id);
    const pkg = this.gamePackage;

    // Initialize state from schema
    const stateManager = new StateManager(pkg.state_model, playerIds);

    // Determine initial phase
    const initialPhaseId = this.getInitialPhaseId();

    // Create room state object first, so onPhaseChange can update it via reference
    const roomState: RoomState = {
      ctx,
      stateManager,
      phaseMachine: null as unknown as PhaseMachine, // filled in below
      players: [...players],
      inputCollector: null,
      currentPhaseId: initialPhaseId,
    };

    this.rooms.set(roomId, roomState);

    // Build phase machine with callbacks wired to GameContext
    // NOTE: callbacks close over roomState by reference — mutations to roomState
    // are reflected immediately in subsequent callbacks.
    const phaseMachine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId,
        sessionIds: () => ctx.getAllSessionIds(),
        onPhaseChange: (phaseId: string, phaseNode: PhaseNode) => {
          const room = this.rooms.get(roomId);
          if (!room) return;

          // Update current phase ID in room state
          room.currentPhaseId = phaseId;

          // Set up input collector for the new phase
          this.setupInputCollector(roomId, phaseNode, playerIds);

          // Broadcast phase change to all clients
          const phaseState = this.buildPhaseState(phaseId, phaseNode, ctx);
          const publicState = this.buildPublicState(roomId);
          ctx.broadcastPhase(phaseState, publicState);

          // Send private state to each player
          ctx.broadcastPrivateState((playerId) => this.buildPrivateState(roomId, playerId));
        },
        onGameEnd: () => {
          this.handleGameEnd(roomId, ctx);
        },
        onAction: (action: PhaseAction) => {
          this.handleAction(roomId, action, ctx);
        },
      },
      this.timerImpl,
    );

    roomState.phaseMachine = phaseMachine;

    // Initialize scores
    ctx.initScores(playerIds);
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    // Broadcast game started — BEFORE starting PhaseMachine
    // (so clients know the game started before phase changes arrive)
    const initialPhaseNode = pkg.phases[initialPhaseId];
    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: pkg.manifest.id,
      phase: this.buildPhaseState(initialPhaseId, initialPhaseNode, ctx),
      gamePublicState: this.buildPublicState(roomId),
    });

    // Send initial private state
    ctx.broadcastPrivateState((playerId) => this.buildPrivateState(roomId, playerId));

    // Start the phase machine — this will fire onPhaseChange for the initial phase
    phaseMachine.start(initialPhaseId);
  }

  // ---------------------------------------------------------------------------
  // GameModule.getPhaseState
  // ---------------------------------------------------------------------------

  getPhaseState(roomId: string): PhaseState {
    const room = this.rooms.get(roomId);
    if (!room) {
      return {
        phaseType: 'lobby',
        roundNumber: 0,
        totalRounds: 0,
        timerRemainingMs: null,
        timerTotalMs: null,
      };
    }

    const phaseNode = this.gamePackage.phases[room.currentPhaseId];
    return this.buildPhaseState(room.currentPhaseId, phaseNode, room.ctx);
  }

  // ---------------------------------------------------------------------------
  // GameModule.getPublicState
  // ---------------------------------------------------------------------------

  getPublicState(roomId: string): Record<string, unknown> {
    return this.buildPublicState(roomId);
  }

  // ---------------------------------------------------------------------------
  // GameModule.getPrivateState
  // ---------------------------------------------------------------------------

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    return this.buildPrivateState(roomId, playerId);
  }

  // ---------------------------------------------------------------------------
  // GameModule.handleInput — route player input to PhaseMachine
  // ---------------------------------------------------------------------------

  handleInput(
    roomId: string,
    playerId: string,
    inputType: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { accepted: false, reason: 'Game not found' };
    }

    const phaseNode = this.gamePackage.phases[room.currentPhaseId];
    if (!phaseNode || phaseNode.type !== 'input_gate') {
      return { accepted: false, reason: 'Current phase does not accept input' };
    }

    const inputDef = phaseNode.input;
    if (!inputDef) {
      return { accepted: false, reason: 'No input declaration for current phase' };
    }

    // Validate the input type matches the declared primitive
    if (inputDef.primitive && inputDef.primitive !== inputType) {
      return {
        accepted: false,
        reason: `Expected input type "${inputDef.primitive}", got "${inputType}"`,
      };
    }

    // Extract the canonical value from the payload
    const inputValue = this.extractInputValue(payload, inputType);

    // Validate via InputCollector if available (validates + tracks submission)
    if (room.inputCollector) {
      const collectResult = room.inputCollector.submit(playerId, inputValue);
      if (!collectResult.accepted) {
        return { accepted: false, reason: collectResult.error };
      }
    }

    // Delegate to PhaseMachine (handles state storage + completion check)
    // PhaseMachine.submitInput expects the raw value (not the wrapped payload)
    const accepted = room.phaseMachine.submitInput(playerId, inputType, inputValue);

    if (!accepted) {
      // If inputCollector accepted but phaseMachine rejected, it's a duplicate
      // (phaseMachine has its own tracking of submitted players)
      return { accepted: false, reason: 'Input rejected by phase machine' };
    }

    // Send updated private state to the submitter
    room.ctx.sendToPlayer(playerId, {
      type: ServerMessageType.PRIVATE_STATE,
      state: this.buildPrivateState(roomId, playerId),
    });

    return { accepted: true };
  }

  // ---------------------------------------------------------------------------
  // GameModule.teardown — clean up room state
  // ---------------------------------------------------------------------------

  teardown(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.phaseMachine.destroy();
      room.ctx.stopTimer();
      room.ctx.clearScores();
    }
    this.rooms.delete(roomId);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Get the ID of the first phase in the schema (preserves insertion order). */
  private getInitialPhaseId(): string {
    const phaseIds = Object.keys(this.gamePackage.phases);
    if (phaseIds.length === 0) {
      throw new Error('[declarative-game-module] Game package has no phases defined');
    }
    return phaseIds[0];
  }

  /**
   * Set up (or tear down) an InputCollector for the given phase.
   * Called on every phase change. Resets the collector for fresh submissions.
   */
  private setupInputCollector(
    roomId: string,
    phaseNode: PhaseNode,
    playerIds: string[],
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (phaseNode.type !== 'input_gate' || !phaseNode.input) {
      room.inputCollector = null;
      return;
    }

    const inputDef = phaseNode.input;
    const primitiveType = inputDef.primitive;

    // Determine required players
    let required: string[] = playerIds;
    if (Array.isArray(inputDef.required)) {
      required = inputDef.required as string[];
    }
    // 'all_players' string is the default — use all playerIds

    // Create primitive (with options from schema if available)
    const primitiveConfig = inputDef.options ?? {};
    const primitive = createPrimitive(primitiveType, primitiveConfig);

    // Create a fresh collector for this phase instance
    room.inputCollector = new InputCollector(required, primitive);
  }

  /**
   * Build the PhaseState object expected by clients.
   * Reads timer info from GameContext.
   */
  private buildPhaseState(
    phaseId: string,
    phaseNode: PhaseNode | undefined,
    ctx: GameContext,
  ): PhaseState {
    const room = this.rooms.get(ctx.roomId);
    const stateManager = room?.stateManager;

    const round = stateManager
      ? (stateManager.getGlobal('round') as number | null ?? 0)
      : 0;
    const totalRounds = stateManager
      ? (stateManager.getGlobal('total_rounds') as number | null ?? 0)
      : 0;

    const timerRemainingMs = ctx.getTimerRemaining();
    let timerTotalMs: number | null = null;
    if (phaseNode?.duration) {
      timerTotalMs = parseDurationMs(phaseNode.duration);
    }

    return {
      phaseType: phaseId,
      roundNumber: typeof round === 'number' ? round : 0,
      totalRounds: typeof totalRounds === 'number' ? totalRounds : 0,
      timerRemainingMs,
      timerTotalMs,
    };
  }

  /**
   * Build the public state for a room.
   * Combines StateManager public projection with current phase info.
   */
  private buildPublicState(roomId: string): Record<string, unknown> {
    const room = this.rooms.get(roomId);
    if (!room) return {};

    const smState = room.stateManager.getPublicState();
    return {
      ...smState,
      phase: room.currentPhaseId,
    };
  }

  /**
   * Build the private state for a specific player.
   * Combines StateManager private projection with input status.
   */
  private buildPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const room = this.rooms.get(roomId);
    if (!room) return {};

    const smState = room.stateManager.getPrivateState(playerId);
    const hasSubmitted = room.inputCollector?.hasSubmitted(playerId) ?? false;
    const mySubmission = room.inputCollector?.getSubmission(playerId) ?? null;

    return {
      ...smState,
      phase: room.currentPhaseId,
      input: {
        hasSubmitted,
        submission: hasSubmitted ? mySubmission : null,
      },
    };
  }

  /**
   * Extract the canonical input value from an input payload.
   * V2 convention: payload should contain one of these standard keys.
   * Falls back gracefully for various payload shapes.
   */
  private extractInputValue(payload: Record<string, unknown>, _inputType: string): unknown {
    // Common V2 key names in order of preference
    if ('value' in payload) return payload.value;
    if ('answer' in payload) return payload.answer;
    if ('choice' in payload) return payload.choice;
    if ('target' in payload) return payload.target;
    if ('text' in payload) return payload.text;
    // If single-key payload, use the value
    const values = Object.values(payload);
    if (values.length === 1) return values[0];
    // Last resort: return the whole payload as-is
    return payload;
  }

  /**
   * Handle the game ending (called by PhaseMachine.onGameEnd).
   */
  private handleGameEnd(_roomId: string, ctx: GameContext): void {
    const scores = ctx.getScores();
    const winner = scores[0]; // Highest score first (score engine returns sorted)

    ctx.broadcastGameOver({
      winnerId: winner?.playerId ?? null,
      winnerName: winner?.playerName ?? null,
      winnerTeam: null,
      finalScores: scores,
      gameId: this.gamePackage.manifest.id,
    });

    ctx.setRoomStatus(RoomStatus.GAME_ENDED);
    ctx.log.info('Game ended', { gameId: this.gamePackage.manifest.id });
  }

  /**
   * Handle unknown actions delegated by PhaseMachine.onAction.
   * Extension point for actions not built into PhaseMachine.
   */
  private handleAction(roomId: string, action: PhaseAction, ctx: GameContext): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    switch (action.action) {
      case 'score_round': {
        // Score all players based on the scoring formulas in the action
        const scoringAction = action as {
          action: string;
          formulas?: Record<string, number>;
        };
        if (scoringAction.formulas) {
          this.handleScoreRound(roomId, scoringAction.formulas, ctx);
        }
        break;
      }

      case 'content_draw': {
        // Phase 1: content_draw is a no-op (content system is Phase 3)
        ctx.log.info('[interpreter] content_draw skipped (Phase 3 feature)', {
          action: action.action,
        });
        break;
      }

      case 'shuffle_and_merge': {
        // Phase 1: no-op
        ctx.log.info('[interpreter] shuffle_and_merge skipped (Phase 3 feature)', {
          action: action.action,
        });
        break;
      }

      default:
        ctx.log.warn('[interpreter] Unknown action from PhaseMachine', {
          action: action.action,
        });
        break;
    }
  }

  /**
   * Handle scoring for a round.
   * Phase 1 stub — full scoring logic requires the rule evaluator (Phase 4).
   */
  private handleScoreRound(
    roomId: string,
    _formulas: Record<string, number>,
    ctx: GameContext,
  ): void {
    ctx.log.info('[interpreter] score_round: formulas noted, scoring engine ready', {
      gameId: this.gamePackage.manifest.id,
      roomId,
    });
  }
}
