/**
 * game-module.ts — Battleship V2 game module factory.
 *
 * Creates a BattleshipGameModule — a thin wrapper around DeclarativeGameModule
 * that intercepts handleInput to support Battleship's per-turn active-player logic.
 *
 * Why a wrapper instead of pure DeclarativeGameModule?
 * -------------------------------------------------------
 * Battleship's battle phase does NOT advance the phase on each shot. Instead:
 *   - The active player fires a shot
 *   - Shots are validated, processed, and the active player is swapped
 *   - The phase only advances when ALL opponent ships are sunk
 *
 * This logic cannot be expressed with the declarative input_gate primitive alone
 * (which advances when a required set of players have submitted). Instead:
 *   - The wrapper intercepts handleInput for 'confirm' (setup) and 'vote' (battle)
 *   - All game logic is in pure extension functions (index.ts)
 *   - Phase lifecycle hooks (bs_init_boards, bs_start_battle) use the standard
 *     ExtensionActionHandler registered with DeclarativeGameModule
 *   - State mutations are stored in a local mirror map and merged into context
 *
 * Architecture decision (per V2 Anti-Drift Protocol, Section 10):
 *   Rule 2: Subsystem boundaries — this wrapper only calls the public GameModule
 *            interface; it never reaches into DeclarativeGameModule internals.
 *   Rule 3: No game-specific code in runtime — this file lives in the game package.
 *   Rule 4: Primitives before extensions — the standard input_gate is used for setup;
 *            custom input handling is justified for battle (per-turn active player).
 */

import type { GameModule } from '../../../server/src/games/game-module.js';
import type { GameContext } from '../../../server/src/games/game-context.js';
import type { Player, PhaseState, GameDefinition } from '@boredless/shared';
import { ServerMessageType, RoomStatus } from '@boredless/shared';
import type { GamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';

import {
  isBattleshipAction,
  handleInitBoards,
  handleStartBattle,
  handleBroadcastScores,
  handleSetupConfirm,
  handleFireShot,
  autoFire,
  buildPublicState,
  buildPrivateState,
} from './index.js';

import type { BattleshipActionContext } from './index.js';

// ---------------------------------------------------------------------------
// Phase constants (from game.yaml)
// ---------------------------------------------------------------------------

const PHASE_SETUP = 'setup';
const PHASE_BATTLE = 'battle';
const PHASE_RESULT = 'result';
const PHASE_SCORES = 'scores';

/** Battle turn timer duration ms (matches game.yaml battle.duration = 30s) */
const BATTLE_TURN_MS = 30_000;

// ---------------------------------------------------------------------------
// Per-room state (tracked by the wrapper)
// ---------------------------------------------------------------------------

interface BattleshipRoomState {
  ctx: GameContext;
  players: Player[];
  currentPhase: string;
  gameEnded: boolean;
}

// ---------------------------------------------------------------------------
// State mirror helpers
//
// Battleship's per-player ship/shot data and globals (active_player_id, etc.)
// are stored in in-memory mirrors keyed by roomId/playerId. The mirrors are:
//
//   globalMirror:  roomId → field → value
//   playerMirror:  roomId → playerId → field → value
//
// The extension handler (called by PhaseMachine for lifecycle actions) writes
// to both the inner StateManager (for visibility projection compatibility) AND
// the mirrors. The outer wrapper reads from the mirrors when building state.
// ---------------------------------------------------------------------------

type GlobalMirror = Map<string, Map<string, unknown>>;
type PlayerMirror = Map<string, Map<string, Map<string, unknown>>>;

function setGlobalMirror(mirror: GlobalMirror, roomId: string, field: string, value: unknown): void {
  if (!mirror.has(roomId)) mirror.set(roomId, new Map());
  mirror.get(roomId)!.set(field, value);
}

function setPlayerMirror(
  mirror: PlayerMirror,
  roomId: string,
  playerId: string,
  field: string,
  value: unknown,
): void {
  if (!mirror.has(roomId)) mirror.set(roomId, new Map());
  const rm = mirror.get(roomId)!;
  if (!rm.has(playerId)) rm.set(playerId, new Map());
  rm.get(playerId)!.set(field, value);
}

function buildGlobals(
  innerPublic: Record<string, unknown>,
  gMirror: GlobalMirror,
  roomId: string,
): Record<string, unknown> {
  const innerGlobals = (innerPublic['globals'] as Record<string, unknown>) ?? {};
  const result: Record<string, unknown> = { ...innerGlobals };
  const m = gMirror.get(roomId);
  if (m) for (const [k, v] of m.entries()) result[k] = v;
  return result;
}

function buildPlayerState(
  players: Player[],
  inner: DeclarativeGameModule,
  roomId: string,
  pMirror: PlayerMirror,
): Record<string, Record<string, unknown>> {
  const playerState: Record<string, Record<string, unknown>> = {};
  for (const player of players) {
    const priv = inner.getPrivateState(roomId, player.id);
    const innerPlayers = (priv['players'] as Record<string, Record<string, unknown>>) ?? {};
    const innerFields = (innerPlayers[player.id] as Record<string, unknown>) ?? {};

    const merged: Record<string, unknown> = { ...innerFields };
    const pm = pMirror.get(roomId)?.get(player.id);
    if (pm) for (const [k, v] of pm.entries()) merged[k] = v;

    playerState[player.id] = merged;
  }
  return playerState;
}

// ---------------------------------------------------------------------------
// Extension action handler
//
// Handles lifecycle phase actions (bs_init_boards, bs_start_battle, etc.)
// that are called by the PhaseMachine via DeclarativeGameModule.
// Writes to both inner StateManager (via ctx.setGlobal/setPlayer) AND mirrors.
// ---------------------------------------------------------------------------

function createExtensionHandler(
  gMirror: GlobalMirror,
  pMirror: PlayerMirror,
): ExtensionActionHandler {
  return (actionName: string, ctx: ExtensionActionContext): boolean => {
    if (!isBattleshipAction(actionName)) return false;

    const roomId = ctx.roomId;

    const bCtx: BattleshipActionContext = {
      roomId,
      players: ctx.playerInfo,
      globals: { ...ctx.globals, ...Object.fromEntries(gMirror.get(roomId)?.entries() ?? []) },
      playerState: buildMergedPlayerState(ctx.players, pMirror.get(roomId)),
      setGlobal: (field: string, value: unknown) => {
        ctx.setGlobal(field, value);
        setGlobalMirror(gMirror, roomId, field, value);
      },
      setPlayer: (playerId: string, field: string, value: unknown) => {
        ctx.setPlayer(playerId, field, value);
        setPlayerMirror(pMirror, roomId, playerId, field, value);
      },
      getScore: ctx.getScore,
      addPoints: ctx.addPoints,
      log: (msg: string, data?: unknown) => ctx.log(msg, data as Record<string, unknown>),
    };

    switch (actionName) {
      case 'bs_init_boards':
        handleInitBoards(bCtx);
        return true;
      case 'bs_start_battle':
        handleStartBattle(bCtx);
        return true;
      case 'bs_broadcast_scores':
        handleBroadcastScores(bCtx);
        return true;
      default:
        return false;
    }
  };
}

function buildMergedPlayerState(
  base: Record<string, Record<string, unknown>>,
  mirror: Map<string, Map<string, unknown>> | undefined,
): Record<string, Record<string, unknown>> {
  if (!mirror) return base;
  const result: Record<string, Record<string, unknown>> = { ...base };
  for (const [playerId, fields] of mirror.entries()) {
    result[playerId] = { ...(result[playerId] ?? {}), ...Object.fromEntries(fields.entries()) };
  }
  return result;
}

// ---------------------------------------------------------------------------
// BattleshipGameModule
// ---------------------------------------------------------------------------

class BattleshipGameModule implements GameModule {
  readonly definition: GameDefinition;
  private readonly inner: DeclarativeGameModule;
  private readonly gamePackage: GamePackage;
  private readonly timerImpl: TimerImpl | undefined;

  private readonly rooms = new Map<string, BattleshipRoomState>();
  private readonly gMirror: GlobalMirror = new Map();
  private readonly pMirror: PlayerMirror = new Map();

  constructor(
    definition: GameDefinition,
    gamePackage: GamePackage,
    timerImpl: TimerImpl | undefined,
  ) {
    this.definition = definition;
    this.gamePackage = gamePackage;
    this.timerImpl = timerImpl;

    const handler = createExtensionHandler(this.gMirror, this.pMirror);
    this.inner = new DeclarativeGameModule(definition, gamePackage, timerImpl, handler);
  }

  // ── GameModule.setup ──────────────────────────────────────────────────────

  setup(players: Player[], ctx: GameContext): void {
    this.rooms.set(ctx.roomId, {
      ctx,
      players: [...players],
      currentPhase: PHASE_SETUP,
      gameEnded: false,
    });
    // DeclarativeGameModule handles: initScores, setRoomStatus, GAME_STARTED broadcast,
    // PhaseMachine wiring, bs_init_boards extension action.
    this.inner.setup(players, ctx);
  }

  // ── GameModule.getPhaseState ──────────────────────────────────────────────

  getPhaseState(roomId: string): PhaseState {
    return this.inner.getPhaseState(roomId);
  }

  // ── GameModule.getPublicState ─────────────────────────────────────────────

  getPublicState(roomId: string): Record<string, unknown> {
    const room = this.rooms.get(roomId);
    if (!room) return this.inner.getPublicState(roomId);

    const globals = buildGlobals(this.inner.getPublicState(roomId), this.gMirror, roomId);
    const playerState = buildPlayerState(room.players, this.inner, roomId, this.pMirror);

    const bCtx = this.makeContext(roomId, room, globals, playerState);
    return buildPublicState(bCtx, room.currentPhase) as unknown as Record<string, unknown>;
  }

  // ── GameModule.getPrivateState ────────────────────────────────────────────

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const room = this.rooms.get(roomId);
    if (!room) return this.inner.getPrivateState(roomId, playerId);

    const globals = buildGlobals(this.inner.getPublicState(roomId), this.gMirror, roomId);
    const playerState = buildPlayerState(room.players, this.inner, roomId, this.pMirror);

    const bCtx = this.makeContext(roomId, room, globals, playerState);
    return buildPrivateState(bCtx, playerId, room.currentPhase) as unknown as Record<string, unknown>;
  }

  // ── GameModule.handleInput ────────────────────────────────────────────────

  handleInput(
    roomId: string,
    playerId: string,
    inputType: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { accepted: false, reason: 'Game not found' };

    if (room.currentPhase === PHASE_SETUP && inputType === 'confirm') {
      return this.doSetupInput(roomId, playerId, payload, room);
    }

    if (room.currentPhase === PHASE_BATTLE && inputType === 'vote') {
      return this.doBattleInput(roomId, playerId, payload, room);
    }

    return { accepted: false, reason: `Unexpected input '${inputType}' in phase '${room.currentPhase}'` };
  }

  // ── GameModule.teardown ───────────────────────────────────────────────────

  teardown(roomId: string): void {
    this.gMirror.delete(roomId);
    this.pMirror.delete(roomId);
    this.rooms.delete(roomId);
    this.inner.teardown(roomId);
  }

  // ── Setup input ──────────────────────────────────────────────────────────

  private doSetupInput(
    roomId: string,
    playerId: string,
    payload: Record<string, unknown>,
    room: BattleshipRoomState,
  ): { accepted: boolean; reason?: string } {
    const ctx = room.ctx;
    const bCtx = this.buildBattleshipContext(roomId, room);

    const ships = payload.ships as import('./index.js').PlacedShip[] | undefined;
    if (!ships || !Array.isArray(ships)) {
      return { accepted: false, reason: 'Missing ships array' };
    }

    const result = handleSetupConfirm(bCtx, playerId, ships);
    if (!result.accepted) return { accepted: false, reason: result.reason };

    ctx.sendToPlayer(playerId, { type: ServerMessageType.INPUT_ACCEPTED, inputType: 'confirm' });
    ctx.sendToPlayer(playerId, { type: ServerMessageType.PRIVATE_STATE, state: this.getPrivateState(roomId, playerId) });
    ctx.broadcastPhase(this.inner.getPhaseState(roomId), this.getPublicState(roomId));

    if (result.allReady) {
      ctx.stopTimer();
      this.doTransitionToBattle(roomId, room);
    }

    return { accepted: true };
  }

  // ── Battle input ─────────────────────────────────────────────────────────

  private doBattleInput(
    roomId: string,
    playerId: string,
    payload: Record<string, unknown>,
    room: BattleshipRoomState,
  ): { accepted: boolean; reason?: string } {
    const ctx = room.ctx;
    const bCtx = this.buildBattleshipContext(roomId, room);

    const cell = String(payload.cell ?? '');
    const result = handleFireShot(bCtx, playerId, cell);

    if (!result.accepted) return { accepted: false, reason: result.reason };

    ctx.sendToPlayer(playerId, { type: ServerMessageType.INPUT_ACCEPTED, inputType: 'vote' });

    if (result.gameOver && result.winnerId) {
      ctx.stopTimer();
      room.currentPhase = PHASE_RESULT;
      this.broadcastAll(roomId, room);
      this.doScheduleResult(roomId, room);
      return { accepted: true };
    }

    ctx.stopTimer();
    this.broadcastAll(roomId, room);
    this.doStartBattleTurnTimer(roomId, room);

    return { accepted: true };
  }

  // ── Phase transitions ────────────────────────────────────────────────────

  private doTransitionToBattle(roomId: string, room: BattleshipRoomState): void {
    room.currentPhase = PHASE_BATTLE;

    // Re-run bs_start_battle to pick the random active player
    const bCtx = this.buildBattleshipContext(roomId, room);
    handleStartBattle(bCtx);

    this.broadcastAll(roomId, room);
    this.doStartBattleTurnTimer(roomId, room);
    room.ctx.log.info('[battleship] Battle started', { roomId });
  }

  private doScheduleResult(roomId: string, room: BattleshipRoomState): void {
    const ctx = room.ctx;
    const phaseState = this.inner.getPhaseState(roomId);
    ctx.broadcastPhase(phaseState, this.getPublicState(roomId));
    ctx.broadcastPrivateState(pid => this.getPrivateState(roomId, pid));

    const phaseNode = this.gamePackage.phases[PHASE_RESULT];
    const durationMs = typeof phaseNode?.duration === 'number'
      ? phaseNode.duration * 1000
      : 8_000;

    this.doStartTimer(roomId, PHASE_RESULT, durationMs, ctx.getAllSessionIds(), () => {
      const r = this.rooms.get(roomId);
      if (!r || r.currentPhase !== PHASE_RESULT) return;
      this.doTransitionToScores(roomId, r);
    });
  }

  private doTransitionToScores(roomId: string, room: BattleshipRoomState): void {
    room.currentPhase = PHASE_SCORES;
    const ctx = room.ctx;
    ctx.broadcastScores();

    const phaseState = this.inner.getPhaseState(roomId);
    ctx.broadcastPhase(phaseState, this.getPublicState(roomId));

    const phaseNode = this.gamePackage.phases[PHASE_SCORES];
    const durationMs = typeof phaseNode?.duration === 'number'
      ? phaseNode.duration * 1000
      : 6_000;

    this.doStartTimer(roomId, PHASE_SCORES, durationMs, ctx.getAllSessionIds(), () => {
      const r = this.rooms.get(roomId);
      if (!r || r.currentPhase !== PHASE_SCORES) return;
      this.doEndGame(roomId, r);
    });
  }

  private doEndGame(roomId: string, room: BattleshipRoomState): void {
    if (room.gameEnded) return;
    room.gameEnded = true;

    const ctx = room.ctx;
    ctx.stopTimer();
    room.currentPhase = 'game_over';

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
    ctx.log.info('[battleship] Game ended', { roomId, winnerId: winner?.playerId });
  }

  // ── Battle turn timer ────────────────────────────────────────────────────

  private doStartBattleTurnTimer(roomId: string, room: BattleshipRoomState): void {
    const ctx = room.ctx;

    this.doStartTimer(roomId, PHASE_BATTLE, BATTLE_TURN_MS, ctx.getAllSessionIds(), () => {
      const r = this.rooms.get(roomId);
      if (!r || r.currentPhase !== PHASE_BATTLE) return;

      ctx.log.info('[battleship] Turn timer expired — auto-firing');
      const bCtx = this.buildBattleshipContext(roomId, r);
      const result = autoFire(bCtx);

      if (result.gameOver && result.winnerId) {
        ctx.stopTimer();
        r.currentPhase = PHASE_RESULT;
        this.broadcastAll(roomId, r);
        this.doScheduleResult(roomId, r);
        return;
      }

      this.broadcastAll(roomId, r);
      this.doStartBattleTurnTimer(roomId, r);
    });
  }

  private doStartTimer(
    roomId: string,
    phaseType: string,
    durationMs: number,
    sessionIds: string[],
    onExpire: () => void,
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (this.timerImpl) {
      this.timerImpl.start(roomId, phaseType, durationMs, sessionIds, onExpire);
    } else {
      room.ctx.startTimer(phaseType, durationMs, onExpire);
    }
  }

  // ── Broadcast ────────────────────────────────────────────────────────────

  private broadcastAll(roomId: string, room: BattleshipRoomState): void {
    const phaseState = this.inner.getPhaseState(roomId);
    room.ctx.broadcastPhase(phaseState, this.getPublicState(roomId));
    room.ctx.broadcastPrivateState(pid => this.getPrivateState(roomId, pid));
  }

  // ── Context builders ─────────────────────────────────────────────────────

  private buildBattleshipContext(roomId: string, room: BattleshipRoomState): BattleshipActionContext {
    const innerPublic = this.inner.getPublicState(roomId);
    const globals = buildGlobals(innerPublic, this.gMirror, roomId);
    const playerState = buildPlayerState(room.players, this.inner, roomId, this.pMirror);
    return this.makeContext(roomId, room, globals, playerState);
  }

  private makeContext(
    roomId: string,
    room: BattleshipRoomState,
    globals: Record<string, unknown>,
    playerState: Record<string, Record<string, unknown>>,
  ): BattleshipActionContext {
    const ctx = room.ctx;
    const gMirror = this.gMirror;
    const pMirror = this.pMirror;

    return {
      roomId,
      players: room.players.map(p => ({ id: p.id, name: p.name })),
      globals,
      playerState,
      setGlobal: (field: string, value: unknown) => {
        setGlobalMirror(gMirror, roomId, field, value);
        // Update globals snapshot in this context too
        globals[field] = value;
      },
      setPlayer: (playerId: string, field: string, value: unknown) => {
        setPlayerMirror(pMirror, roomId, playerId, field, value);
        // Update playerState snapshot in this context too
        if (!playerState[playerId]) playerState[playerId] = {};
        playerState[playerId]![field] = value;
      },
      getScore: (playerId: string) => ctx.getScore(playerId),
      addPoints: (playerId: string, amount: number) => ctx.addPoints(playerId, amount),
      log: (msg: string, data?: unknown) => ctx.log.info(msg, data as Record<string, unknown>),
    };
  }
}

// ---------------------------------------------------------------------------
// Factory function (called by auto-discover.ts)
// ---------------------------------------------------------------------------

/**
 * Create a Battleship GameModule with V2 extension support.
 * Used by auto-discover.ts as the createModule factory for battleship.
 *
 * @param definition  - V1-compatible game definition (for catalog display)
 * @param gamePackage - The fully validated V2 game package (loaded from game.yaml)
 * @param _gameDir    - Path to game directory (unused — no content files needed)
 * @param timerImpl   - Optional timer override for testing
 */
export function createBattleshipModule(
  definition: GameDefinition,
  gamePackage: GamePackage,
  _gameDir: string,
  timerImpl?: TimerImpl,
): GameModule {
  return new BattleshipGameModule(definition, gamePackage, timerImpl);
}
