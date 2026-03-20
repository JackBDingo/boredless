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
 * - Delegates event handling to EventEngine (optional, from game schema).
 * - Delegates scoring to ScoreManager (optional, from game schema).
 * - Delegates rule evaluation to RuleEngine (optional, from game schema).
 * - Delegates content management to ContentRegistry (optional, from game schema).
 * - Delegates turn management to TurnManager (optional, from game schema).
 * - Delegates object management to ObjectRegistry (optional, from game schema).
 * - Uses GameContext exactly as V1 modules do.
 * - Zero if (gameId === ...) in this file.
 *
 * Phase 5.1: All remaining V2 subsystems wired in.
 * Subsystems are optional — only initialized when game schema declares them.
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
import { ProjectionEngine } from '../visibility/index.js';
import type { Audience } from '../visibility/index.js';

// Phase 5.1 subsystem imports
import { EventEngine, parseEventRules } from '../event-system/index.js';
import type { EventEffect, EffectContext } from '../event-system/index.js';
import { ScoreManager, ScoringConfigSchema } from '../scoring-system/index.js';
import type { ScoringRuleContext } from '../scoring-system/index.js';
import { RuleEngine, parseRules } from '../rule-engine/index.js';
import type { RuleContext, RuleAction } from '../rule-engine/index.js';
import { ContentRegistry, parseContentSection } from '../content-system/index.js';
import { TurnManager, turnModelFromYaml, FullTurnModelSchema } from '../turn-system/index.js';
import { ObjectRegistry, safeParseGameObjects } from '../object-models/index.js';
import type { ObjectDeclaration } from '../object-models/index.js';

// ---------------------------------------------------------------------------
// Internal per-room state
// ---------------------------------------------------------------------------

interface RoomState {
  ctx: GameContext;
  stateManager: StateManager;
  phaseMachine: PhaseMachine;
  projectionEngine: ProjectionEngine;
  players: Player[];
  inputCollector: InputCollector | null;
  currentPhaseId: string;

  // Phase 5.1: Optional subsystems
  eventEngine?: EventEngine;
  scoreManager?: ScoreManager;
  ruleEngine?: RuleEngine;
  contentRegistry?: ContentRegistry;
  turnManager?: TurnManager;
  objectRegistry?: ObjectRegistry;
}

// ---------------------------------------------------------------------------
// Extension action handler type
// ---------------------------------------------------------------------------

/**
 * Context passed to extension action handlers.
 * Provides read/write access to game state for custom game logic.
 */
export interface ExtensionActionContext {
  /** Room ID */
  roomId: string;
  /** Current global state (read-only snapshot — use setGlobal to mutate) */
  globals: Record<string, unknown>;
  /** Per-player state (read-only snapshot) */
  players: Record<string, Record<string, unknown>>;
  /** Player info (id + name) */
  playerInfo: Array<{ id: string; name: string }>;
  /** Set a global state field */
  setGlobal: (field: string, value: unknown) => void;
  /** Get a player's current score */
  getScore: (playerId: string) => number;
  /** Award points to a player */
  addPoints: (playerId: string, amount: number) => void;
  /** Log a message */
  log: (msg: string, data?: Record<string, unknown>) => void;
}

/**
 * Handler for custom extension actions declared in game.yaml.
 * Return true if the action was handled, false to fall through to default handling.
 */
export type ExtensionActionHandler = (
  actionName: string,
  ctx: ExtensionActionContext,
) => boolean;

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
  /** Optional handler for custom extension actions. */
  private readonly extensionActionHandler: ExtensionActionHandler | undefined;

  constructor(
    definition: GameDefinition,
    gamePackage: GamePackage,
    timerImpl?: TimerImpl,
    extensionActionHandler?: ExtensionActionHandler,
  ) {
    this.definition = definition;
    this.gamePackage = gamePackage;
    this.timerImpl = timerImpl;
    this.extensionActionHandler = extensionActionHandler;
  }

  // ---------------------------------------------------------------------------
  // GameModule.setup
  // ---------------------------------------------------------------------------

  setup(players: Player[], ctx: GameContext): void {
    const roomId = ctx.roomId;
    const playerIds = players.map(p => p.id);
    const pkg = this.gamePackage;

    const stateManager = new StateManager(pkg.state_model, playerIds);
    const projectionEngine = new ProjectionEngine(pkg.state_model);
    const initialPhaseId = this.getInitialPhaseId();

    const roomState: RoomState = {
      ctx,
      stateManager,
      phaseMachine: null as unknown as PhaseMachine,
      projectionEngine,
      players: [...players],
      inputCollector: null,
      currentPhaseId: initialPhaseId,
    };

    this.rooms.set(roomId, roomState);

    // Initialize optional subsystems
    this.initEventEngine(roomState, stateManager, ctx);
    this.initScoreManager(roomState, playerIds, ctx);
    this.initRuleEngine(roomState, ctx);
    this.initContentRegistry(roomState, ctx);
    this.initTurnManager(roomState, playerIds, ctx);
    this.initObjectRegistry(roomState, ctx);

    // Build PhaseMachine
    const phaseMachine = new PhaseMachine(
      pkg.phases,
      stateManager,
      {
        roomId,
        sessionIds: () => ctx.getAllSessionIds(),
        onPhaseChange: (phaseId: string, phaseNode: PhaseNode) => {
          const room = this.rooms.get(roomId);
          if (!room) return;

          const previousPhaseId = room.currentPhaseId;

          // Fire phase_exit for the previous phase, but ONLY if we're actually changing phases
          // (on the initial phase entry, previousPhaseId === phaseId, skip exit)
          if (previousPhaseId && previousPhaseId !== phaseId && room.eventEngine) {
            room.eventEngine.emit({ type: 'phase_exit', phase: previousPhaseId });
          }

          room.currentPhaseId = phaseId;

          // Fire phase_enter for the new phase
          if (room.eventEngine) {
            room.eventEngine.emit({ type: 'phase_enter', phase: phaseId });
          }

          // Advance turn on input phases (simultaneous model)
          if (room.turnManager && phaseNode.type === 'input_gate') {
            const ts = room.turnManager.getState();
            if (ts.model === 'simultaneous') {
              room.turnManager.advanceTurn();
            }
          }

          // Evaluate rules on phase change
          if (room.ruleEngine) {
            this.evaluateAndApplyRules(roomId, ctx);
          }

          this.setupInputCollector(roomId, phaseNode, playerIds);

          const phaseState = this.buildPhaseState(phaseId, phaseNode, ctx);
          const publicState = this.buildPublicState(roomId);
          ctx.broadcastPhase(phaseState, publicState);
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

    ctx.initScores(playerIds);
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    // Fire game_start event
    if (roomState.eventEngine) {
      roomState.eventEngine.emit({ type: 'game_start' });
    }

    const initialPhaseNode = pkg.phases[initialPhaseId];
    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: pkg.manifest.id,
      phase: this.buildPhaseState(initialPhaseId, initialPhaseNode, ctx),
      gamePublicState: this.buildPublicState(roomId),
    });

    ctx.broadcastPrivateState((playerId) => this.buildPrivateState(roomId, playerId));

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
  // GameModule.handleInput
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

    // Turn system: check if it is this player's turn (non-simultaneous models only)
    if (room.turnManager) {
      const ts = room.turnManager.getState();
      if (ts.model !== 'simultaneous' && ts.model !== 'free_form') {
        if (!room.turnManager.isPlayerActive(playerId)) {
          return { accepted: false, reason: 'Not your turn' };
        }
      }
    }

    const phaseNode = this.gamePackage.phases[room.currentPhaseId];
    if (!phaseNode || phaseNode.type !== 'input_gate') {
      return { accepted: false, reason: 'Current phase does not accept input' };
    }

    const inputDef = phaseNode.input;
    if (!inputDef) {
      return { accepted: false, reason: 'No input declaration for current phase' };
    }

    if (inputDef.primitive && inputDef.primitive !== inputType) {
      return {
        accepted: false,
        reason: `Expected input type "${inputDef.primitive}", got "${inputType}"`,
      };
    }

    const inputValue = this.extractInputValue(payload, inputType);

    if (room.inputCollector) {
      const collectResult = room.inputCollector.submit(playerId, inputValue);
      if (!collectResult.accepted) {
        return { accepted: false, reason: collectResult.error };
      }
    }

    const accepted = room.phaseMachine.submitInput(playerId, inputType, inputValue);

    if (!accepted) {
      return { accepted: false, reason: 'Input rejected by phase machine' };
    }

    // Fire input_received event
    if (room.eventEngine) {
      room.eventEngine.emit({ type: 'input_received' });
    }

    // Evaluate rules after input
    if (room.ruleEngine) {
      this.evaluateAndApplyRules(roomId, room.ctx);
    }

    room.ctx.sendToPlayer(playerId, {
      type: ServerMessageType.PRIVATE_STATE,
      state: this.buildPrivateState(roomId, playerId),
    });

    return { accepted: true };
  }

  // ---------------------------------------------------------------------------
  // GameModule.teardown
  // ---------------------------------------------------------------------------

  teardown(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.phaseMachine.destroy();
      room.ctx.stopTimer();
      room.ctx.clearScores();
      room.contentRegistry?.destroy();
      room.objectRegistry?.destroy();
      room.turnManager?.destroy();
    }
    this.rooms.delete(roomId);
  }

  // ---------------------------------------------------------------------------
  // Phase 5.1: Subsystem initialization
  // ---------------------------------------------------------------------------

  private initEventEngine(
    roomState: RoomState,
    stateManager: StateManager,
    ctx: GameContext,
  ): void {
    const pkg = this.gamePackage;
    if (!pkg.events || !Array.isArray(pkg.events) || pkg.events.length === 0) return;

    let eventRules;
    try {
      eventRules = parseEventRules(pkg.events as unknown[]);
    } catch (err) {
      ctx.log.warn('[interpreter] Failed to parse event rules', { err });
      return;
    }

    roomState.eventEngine = new EventEngine(eventRules, {
      stateManager: {
        getGlobal: (field) => stateManager.getGlobal(field),
        setGlobal: (field, value) => stateManager.setGlobal(field, value),
        getPlayer: (playerId, field) => stateManager.getPlayer(playerId, field),
        setPlayer: (playerId, field, value) => stateManager.setPlayer(playerId, field, value),
      },
      onEffect: (effect: EventEffect, context: EffectContext) => {
        this.handleEventEffect(effect, context, roomState, ctx);
      },
    });

    ctx.log.info('[interpreter] EventEngine initialized', { ruleCount: eventRules.length });
  }

  private initScoreManager(
    roomState: RoomState,
    playerIds: string[],
    ctx: GameContext,
  ): void {
    const pkg = this.gamePackage;
    if (!pkg.scoring) return;

    const scoringRaw = pkg.scoring as Record<string, unknown>;
    if (!scoringRaw.tracks) {
      ctx.log.info('[interpreter] Legacy scoring format — using simple addPoints');
      return;
    }

    const parsed = ScoringConfigSchema.safeParse(pkg.scoring);
    if (!parsed.success) {
      ctx.log.warn('[interpreter] Failed to parse V2 scoring config', { error: parsed.error.message });
      return;
    }

    roomState.scoreManager = new ScoreManager(parsed.data as unknown as import("../scoring-system/index.js").ScoringConfig, playerIds);
    ctx.log.info('[interpreter] ScoreManager initialized', {
      trackCount: parsed.data.tracks.length,
      ruleCount: parsed.data.rules.length,
    });
  }

  private initRuleEngine(
    roomState: RoomState,
    ctx: GameContext,
  ): void {
    const pkg = this.gamePackage;
    if (!pkg.rules || !Array.isArray(pkg.rules) || pkg.rules.length === 0) return;

    let rules;
    try {
      rules = parseRules(pkg.rules);
    } catch (err) {
      ctx.log.warn('[interpreter] Failed to parse rules', { err });
      return;
    }

    roomState.ruleEngine = new RuleEngine(rules);
    ctx.log.info('[interpreter] RuleEngine initialized', { ruleCount: rules.length });
  }

  private initContentRegistry(
    roomState: RoomState,
    ctx: GameContext,
  ): void {
    const pkg = this.gamePackage;
    if (!pkg.content) return;

    let parsed;
    try {
      parsed = parseContentSection(pkg.content);
    } catch (err) {
      ctx.log.warn('[interpreter] Failed to parse content section', { err });
      return;
    }

    if (!parsed.pools || parsed.pools.length === 0) return;

    roomState.contentRegistry = new ContentRegistry();
    for (const poolConfig of parsed.pools) {
      try {
        roomState.contentRegistry.createPool(poolConfig);
      } catch (err) {
        ctx.log.warn('[interpreter] Failed to create content pool', { poolId: poolConfig.id, err });
      }
    }
    ctx.log.info('[interpreter] ContentRegistry initialized', { poolCount: roomState.contentRegistry.size });
  }

  private initTurnManager(
    roomState: RoomState,
    playerIds: string[],
    ctx: GameContext,
  ): void {
    const pkg = this.gamePackage;
    if (!pkg.turn_model) return;

    const parsed = FullTurnModelSchema.safeParse(pkg.turn_model);
    if (!parsed.success) {
      ctx.log.warn('[interpreter] Could not parse extended turn_model');
      return;
    }

    const turnModel = turnModelFromYaml(parsed.data);
    roomState.turnManager = new TurnManager(turnModel, playerIds);
    ctx.log.info('[interpreter] TurnManager initialized', {
      model: turnModel.type,
      playerCount: playerIds.length,
    });
  }

  private initObjectRegistry(
    roomState: RoomState,
    ctx: GameContext,
  ): void {
    const pkg = this.gamePackage;
    if (!pkg.objects) return;

    const rawObjects = pkg.objects;
    const objectsArray = Array.isArray(rawObjects)
      ? rawObjects
      : Object.values(rawObjects as Record<string, unknown>);
    if (objectsArray.length === 0) return;

    const parsed = safeParseGameObjects(objectsArray);
    if (!parsed.success) {
      ctx.log.warn('[interpreter] Failed to parse object declarations', { err: parsed.error.message });
      return;
    }
    const declarations: ObjectDeclaration[] = parsed.data;

    roomState.objectRegistry = new ObjectRegistry();
    for (const decl of declarations) {
      try {
        switch (decl.type) {
          case 'deck':
            roomState.objectRegistry.createDeck({ id: decl.id, items: decl.items ?? [] });
            break;
          case 'hand':
            roomState.objectRegistry.createHand({
              id: decl.id,
              playerId: decl.playerId ?? '',
              maxSize: decl.maxSize,
            });
            break;
          case 'board':
            roomState.objectRegistry.createBoard({
              id: decl.id,
              width: decl.width,
              height: decl.height,
            });
            break;
          case 'pool':
            roomState.objectRegistry.createPool({ id: decl.id, items: decl.items ?? [] });
            break;
          default:
            break;
        }
      } catch (err) {
        ctx.log.warn('[interpreter] Failed to create object', { id: decl.id, type: decl.type, err });
      }
    }
    ctx.log.info('[interpreter] ObjectRegistry initialized', { objectCount: declarations.length });
  }

  // ---------------------------------------------------------------------------
  // Phase 5.1: Event effect handler
  // ---------------------------------------------------------------------------

  private handleEventEffect(
    effect: EventEffect,
    _context: EffectContext,
    roomState: RoomState,
    ctx: GameContext,
  ): void {
    switch (effect.type) {
      case 'add_points': {
        const amount = effect.amount ?? 0;
        const target = effect.target;
        if (target) {
          const playerId = target.startsWith('player:') ? target.slice('player:'.length) : target;
          ctx.addPoints(playerId, amount);
        } else {
          for (const player of roomState.players) {
            ctx.addPoints(player.id, amount);
          }
        }
        break;
      }
      case 'announce': {
        if (effect.message) {
          ctx.sendToAll({
            type: ServerMessageType.GAME_EVENT,
            event: 'announcement',
            data: { message: effect.message },
          } as Parameters<typeof ctx.sendToAll>[0]);
        }
        break;
      }
      case 'broadcast': {
        ctx.sendToAll({
          type: ServerMessageType.GAME_EVENT,
          event: 'broadcast',
          data: effect.data ?? { message: effect.message },
        } as Parameters<typeof ctx.sendToAll>[0]);
        break;
      }
      case 'play_sound': {
        if (effect.sound) {
          ctx.sendToAll({
            type: ServerMessageType.GAME_EVENT,
            event: 'play_sound',
            data: { sound: effect.sound },
          } as Parameters<typeof ctx.sendToAll>[0]);
        }
        break;
      }
      case 'advance_phase': {
        ctx.log.info('[interpreter] Event effect: advance_phase (advisory)', { target: effect.target });
        break;
      }
      default:
        ctx.log.warn('[interpreter] Unhandled event effect', { type: effect.type });
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Phase 5.1: Rule evaluation
  // ---------------------------------------------------------------------------

  private buildRuleContext(roomId: string): RuleContext | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const snapshot = room.stateManager.snapshot();
    return {
      state: {
        globals: snapshot.globals,
        players: snapshot.players,
        teams: snapshot.teams,
      },
      players: room.players.map(p => p.id),
      phase: room.currentPhaseId,
      round: typeof snapshot.globals['round'] === 'number'
        ? (snapshot.globals['round'] as number)
        : 0,
    };
  }

  private evaluateAndApplyRules(roomId: string, ctx: GameContext): void {
    const room = this.rooms.get(roomId);
    if (!room?.ruleEngine) return;

    const ruleCtx = this.buildRuleContext(roomId);
    if (!ruleCtx) return;

    try {
      const results = room.ruleEngine.evaluate(ruleCtx);
      for (const result of results) {
        // Execute actions whether condition matched (then) or not (else).
        // RuleEngine already selects the correct action list (then vs else).
        if (result.actions.length > 0) {
          this.executeRuleActions(result.actions, roomId, ctx);
        }
      }
    } catch (err) {
      ctx.log.warn('[interpreter] Rule evaluation error', { err });
    }
  }

  private executeRuleActions(
    actions: RuleAction[],
    roomId: string,
    ctx: GameContext,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const action of actions) {
      switch (action.type) {
        case 'set': {
          const parts = action.path.split('.');
          if (parts[0] === 'globals' && parts[1]) {
            room.stateManager.setGlobal(parts[1], action.value);
          } else if (parts[0] === 'per_player' && parts[1]) {
            for (const player of room.players) {
              room.stateManager.setPlayer(player.id, parts[1], action.value);
            }
          }
          break;
        }
        case 'increment': {
          const parts = action.path.split('.');
          const amount = typeof action.amount === 'number' ? action.amount : 1;
          if (parts[0] === 'globals' && parts[1]) {
            const current = room.stateManager.getGlobal(parts[1]);
            room.stateManager.setGlobal(parts[1], (Number(current) || 0) + amount);
          }
          break;
        }
        case 'emit': {
          if (room.eventEngine) {
            room.eventEngine.emit({ type: 'state_change', field: action.event });
          }
          break;
        }
        case 'transition': {
          ctx.log.info('[interpreter] Rule action: transition (advisory)', { to: action.to });
          break;
        }
        case 'custom': {
          if (room.ruleEngine) {
            const handler = room.ruleEngine.getCustomActionHandler(action.handler);
            if (handler) {
              const ruleCtx = this.buildRuleContext(roomId);
              if (ruleCtx) {
                const additionalActions = handler(action.params ?? {}, ruleCtx);
                this.executeRuleActions(additionalActions, roomId, ctx);
              }
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getInitialPhaseId(): string {
    const phaseIds = Object.keys(this.gamePackage.phases);
    if (phaseIds.length === 0) {
      throw new Error('[declarative-game-module] Game package has no phases defined');
    }
    return phaseIds[0];
  }

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

    let required: string[] = playerIds;
    if (Array.isArray(inputDef.required)) {
      required = inputDef.required as string[];
    }

    const primitiveConfig = inputDef.options ?? {};
    const primitive = createPrimitive(primitiveType, primitiveConfig);
    room.inputCollector = new InputCollector(required, primitive);
  }

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

  private buildPublicState(roomId: string): Record<string, unknown> {
    const room = this.rooms.get(roomId);
    if (!room) return {};

    const snapshot = room.stateManager.snapshot();
    snapshot.globals['phase'] = room.currentPhaseId;

    const spectatorAudience: Audience = { type: 'spectator' };
    const projected = room.projectionEngine.project(snapshot, spectatorAudience);

    const publicState: Record<string, unknown> = {
      globals: projected.globals,
      players: projected.players,
      teams: projected.teams,
      phase: room.currentPhaseId,
    };

    // Expose turn state
    if (room.turnManager) {
      const ts = room.turnManager.getState();
      publicState['turn'] = {
        model: ts.model,
        activePlayerIds: ts.activePlayerIds,
        round: ts.round,
        ...(ts.model !== 'simultaneous' && ts.model !== 'free_form'
          ? { currentIndex: ts.currentIndex }
          : {}),
      };
    }

    // Expose score summary from ScoreManager
    if (room.scoreManager) {
      const scores: Record<string, Record<string, number>> = {};
      for (const player of room.players) {
        scores[player.id] = room.scoreManager.getAllScores(player.id);
      }
      publicState['scores'] = scores;
    }

    return publicState;
  }

  private buildPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const room = this.rooms.get(roomId);
    if (!room) return {};

    const snapshot = room.stateManager.snapshot();
    snapshot.globals['phase'] = room.currentPhaseId;

    const playerAudience: Audience = { type: 'player', playerId };
    const projected = room.projectionEngine.project(snapshot, playerAudience);

    const hasSubmitted = room.inputCollector?.hasSubmitted(playerId) ?? false;
    const mySubmission = room.inputCollector?.getSubmission(playerId) ?? null;

    const privateState: Record<string, unknown> = {
      globals: projected.globals,
      players: projected.players,
      teams: projected.teams,
      phase: room.currentPhaseId,
      input: {
        hasSubmitted,
        submission: hasSubmitted ? mySubmission : null,
      },
    };

    // Expose turn state with player-specific isMyTurn flag
    if (room.turnManager) {
      const ts = room.turnManager.getState();
      privateState['turn'] = {
        model: ts.model,
        activePlayerIds: ts.activePlayerIds,
        isMyTurn: ts.activePlayerIds.includes(playerId),
        round: ts.round,
      };
    }

    // Expose this player's detailed scores from ScoreManager
    if (room.scoreManager) {
      privateState['myScores'] = room.scoreManager.getAllScores(playerId);
    }

    return privateState;
  }

  private extractInputValue(payload: Record<string, unknown>, _inputType: string): unknown {
    if ('value' in payload) return payload.value;
    if ('answer' in payload) return payload.answer;
    if ('choice' in payload) return payload.choice;
    if ('target' in payload) return payload.target;
    if ('text' in payload) return payload.text;
    const values = Object.values(payload);
    if (values.length === 1) return values[0];
    return payload;
  }

  private handleGameEnd(roomId: string, ctx: GameContext): void {
    const room = this.rooms.get(roomId);

    // Fire game_end event
    if (room?.eventEngine) {
      room.eventEngine.emit({ type: 'game_end' });
    }

    // Use ScoreManager victory evaluation when available
    if (room?.scoreManager) {
      const round = typeof room.stateManager.getGlobal('round') === 'number'
        ? (room.stateManager.getGlobal('round') as number)
        : 0;
      const victoryResult = room.scoreManager.checkVictory({ round });

      if (victoryResult.winners.length > 0) {
        const winnerPlayer = room.players.find(p => p.id === victoryResult.winners[0]);

        ctx.broadcastGameOver({
          winnerId: victoryResult.winners[0] ?? null,
          winnerName: winnerPlayer?.name ?? null,
          winnerTeam: null,
          finalScores: victoryResult.rankings.map((r) => ({
            playerId: r.playerId,
            playerName: room.players.find(p => p.id === r.playerId)?.name ?? r.playerId,
            playerColor: room.players.find(p => p.id === r.playerId)?.color ?? '#000000',
            score: r.scores[Object.keys(r.scores)[0] ?? ''] ?? 0,
            roundScore: 0,
          })),
          gameId: this.gamePackage.manifest.id,
        });

        ctx.setRoomStatus(RoomStatus.GAME_ENDED);
        ctx.log.info('Game ended (ScoreManager victory)', {
          gameId: this.gamePackage.manifest.id,
          winners: victoryResult.winners,
        });
        return;
      }
    }

    // Fallback to GameContext scores
    const scores = ctx.getScores();
    const winner = scores[0];

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

  private handleAction(roomId: string, action: PhaseAction, ctx: GameContext): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    switch (action.action) {
      case 'score_round': {
        const scoringAction = action as { action: string; formulas?: Record<string, number> };
        if (scoringAction.formulas) {
          this.handleScoreRound(roomId, scoringAction.formulas, ctx);
        }
        break;
      }
      case 'content_draw': {
        const drawAction = action as {
          action: string;
          pool?: string;
          target?: string;
          count?: number;
        };
        this.handleContentDraw(roomId, drawAction, ctx);
        break;
      }
      case 'shuffle_and_merge': {
        ctx.log.info('[interpreter] shuffle_and_merge skipped (Phase 3 feature)', { action: action.action });
        break;
      }
      default: {
        // Try extension action handler if one is registered
        if (this.extensionActionHandler) {
          const extCtx = this.buildExtensionContext(roomId, ctx);
          const handled = this.extensionActionHandler(action.action, extCtx);
          if (handled) break;
        }
        ctx.log.warn('[interpreter] Unknown action from PhaseMachine', { action: action.action });
        break;
      }
    }
  }

  private handleScoreRound(
    roomId: string,
    formulas: Record<string, number>,
    ctx: GameContext,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    ctx.log.info('[interpreter] score_round: applying scoring formulas', {
      gameId: this.gamePackage.manifest.id,
      roomId,
      formulaKeys: Object.keys(formulas),
    });

    if (room.scoreManager) {
      const snapshot = room.stateManager.snapshot();
      const stateForCtx: Record<string, unknown> = { globals: snapshot.globals };
      const round = typeof snapshot.globals['round'] === 'number'
        ? (snapshot.globals['round'] as number)
        : 0;

      for (const [ruleId] of Object.entries(formulas)) {
        const ruleContext: ScoringRuleContext = { state: stateForCtx, round };
        try {
          const changes = room.scoreManager.applyScoringRule(ruleId, ruleContext);
          for (const change of changes) {
            if (change.amount !== 0) {
              ctx.addPoints(change.trackId, change.amount);
            }
          }
        } catch {
          // Rule not found in ScoreManager — that is OK for legacy formulas
        }
      }

      // Check victory after scoring
      const victoryResult = room.scoreManager.checkVictory({ round });
      if (victoryResult.gameOver && victoryResult.winners.length > 0) {
        ctx.log.info('[interpreter] Victory condition met after scoring', {
          winners: victoryResult.winners,
        });
      }
    }
  }

  private handleContentDraw(
    roomId: string,
    action: { pool?: string; target?: string; count?: number },
    ctx: GameContext,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (!room.contentRegistry) {
      ctx.log.info('[interpreter] content_draw: no ContentRegistry initialized', { pool: action.pool });
      return;
    }

    const poolId = action.pool;
    if (!poolId) {
      ctx.log.warn('[interpreter] content_draw: missing pool ID');
      return;
    }

    if (!room.contentRegistry.hasPool(poolId)) {
      ctx.log.warn('[interpreter] content_draw: pool not found', { poolId });
      return;
    }

    try {
      const pool = room.contentRegistry.getPool(poolId);
      const count = action.count ?? 1;
      const drawn = pool.draw(count);

      if (drawn.length === 0) {
        ctx.log.warn('[interpreter] content_draw: pool exhausted', { poolId });
        return;
      }

      const target = action.target;
      if (target) {
        const parts = target.split('.');
        const value = drawn.length === 1 ? drawn[0] : drawn;

        if (parts[0] === 'globals' && parts[1]) {
          room.stateManager.setGlobal(parts[1], value);
          ctx.log.info('[interpreter] content_draw: stored in globals', {
            poolId,
            target,
            itemCount: drawn.length,
          });
        } else if (parts[0] === 'per_player' && parts[1]) {
          for (const player of room.players) {
            const playerDrawn = pool.draw(1);
            if (playerDrawn.length > 0) {
              room.stateManager.setPlayer(player.id, parts[1], playerDrawn[0]);
            }
          }
          ctx.log.info('[interpreter] content_draw: distributed to players', {
            poolId,
            field: parts[1],
          });
        }

        // Fire state_change event after drawing
        if (room.eventEngine) {
          room.eventEngine.emit({ type: 'state_change', field: target });
        }
      }
    } catch (err) {
      ctx.log.warn('[interpreter] content_draw failed', { poolId, err });
    }
  }

  // ---------------------------------------------------------------------------
  // Extension action context builder
  // ---------------------------------------------------------------------------

  /**
   * Build an ExtensionActionContext for custom action handlers.
   * Provides typed access to state for extension functions.
   */
  private buildExtensionContext(roomId: string, ctx: GameContext): ExtensionActionContext {
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error('[declarative-game-module] Room not found: ' + roomId);
    }

    // Read globals from StateManager (includes private fields for extensions)
    const snapshot = room.stateManager.snapshot();
    const globals: Record<string, unknown> = { ...snapshot.globals };

    // Read per-player state
    const players: Record<string, Record<string, unknown>> = {};
    for (const [playerId, fields] of Object.entries(snapshot.players)) {
      players[playerId] = { ...fields };
    }

    return {
      roomId,
      globals,
      players,
      playerInfo: room.players.map(p => ({ id: p.id, name: p.name })),
      setGlobal: (field: string, value: unknown) => {
        room.stateManager.setGlobal(field, value);
      },
      getScore: (playerId: string) => ctx.getScore(playerId),
      addPoints: (playerId: string, amount: number) => {
        ctx.addPoints(playerId, amount);
      },
      log: (msg: string, data?: Record<string, unknown>) => {
        ctx.log.info(msg, data);
      },
    };
  }
}
