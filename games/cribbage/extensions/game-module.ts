/**
 * game-module.ts — Cribbage V2 game module factory.
 *
 * Creates a CribbageDeclarativeModule: a standalone GameModule implementation
 * that uses the game.yaml schema for metadata and phase declarations, but
 * manages its own state for the complex card game mechanics.
 *
 * Why not wrap DeclarativeGameModule?
 *   DeclarativeGameModule manages state internally via StateManager and does
 *   not expose a public API for external state mutation. Cribbage requires
 *   state mutations during handleInput (play card, go, discard), which cannot
 *   be bridged through the standard action handler path.
 *
 * V2 compliance:
 *   - game.yaml provides schema_version "2.0" → auto-discover uses V2 path
 *   - Factory function (createCribbageModule) is detected by auto-discover
 *   - No game-specific code in any runtime subsystem
 *   - No if (gameId === ...) in runtime files
 *   - All cribbage logic lives in extensions/ (this file + index.ts)
 *   - V1 games are unaffected (hybrid loader keeps V1 games working)
 *
 * Phase progression mirrors game.yaml:
 *   dealing → discard → cut → pegging → scoring → crib → results → scores → [loop]
 *
 * Uses:
 *   - extensions/index.ts for all game logic (dealing, scoring, pegging)
 *   - games/cribbage/server/deck.ts and scoring.ts (shared with V1)
 *   - @boredless/shared types (PhaseState, GameDefinition, etc.)
 */

import type { GameModule } from '../../../server/src/games/game-module.js';
import type { GameContext } from '../../../server/src/games/game-context.js';
import type { Player, PhaseState, GameDefinition } from '@boredless/shared';
import { PhaseType, InputType, ServerMessageType, RoomStatus } from '@boredless/shared';
import type { GamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';

import {
  handleDealRound,
  handleResetDiscardState,
  handleFinalizeDiscards,
  handleCutStarter,
  handleStartPegging,
  handleScoreHands,
  handleScoreCrib,
  handleRotateDealer,
  handleCribbageInput,
} from './index.js';
import type { ExtensionActionContext } from '../../../server/src/runtime/interpreter/index.js';

// ---------------------------------------------------------------------------
// Phase ID constants (mirrors game.yaml phase names)
// ---------------------------------------------------------------------------

const PHASE_DEALING  = 'dealing';
const PHASE_DISCARD  = 'discard';
const PHASE_CUT      = 'cut';
const PHASE_PEGGING  = 'pegging';
const PHASE_SCORING  = 'scoring';
const PHASE_CRIB     = 'crib';
const PHASE_RESULTS  = 'results';
const PHASE_SCORES   = 'scores';

// Phase durations in milliseconds (mirrors game.yaml)
const DURATION: Record<string, number> = {
  [PHASE_DEALING]:  3_000,
  [PHASE_DISCARD]:  30_000,
  [PHASE_CUT]:      4_000,
  [PHASE_PEGGING]:  45_000,
  [PHASE_SCORING]:  8_000,
  [PHASE_CRIB]:     8_000,
  [PHASE_RESULTS]:  6_000,
  [PHASE_SCORES]:   6_000,
};

// ---------------------------------------------------------------------------
// Per-room state
// ---------------------------------------------------------------------------

interface RoomState {
  ctx: GameContext;
  players: Player[];
  currentPhase: string;
  round: number;
  dealerIndex: number;

  // JSON-serialized game state (mirrors game.yaml state_model)
  globals: Record<string, unknown>;
  perPlayer: Record<string, Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// CribbageDeclarativeModule
// ---------------------------------------------------------------------------

class CribbageDeclarativeModule implements GameModule {
  readonly definition: GameDefinition;
  private readonly gamePackage: GamePackage;
  private readonly timerImpl: TimerImpl | undefined;
  private readonly rooms = new Map<string, RoomState>();

  constructor(
    definition: GameDefinition,
    gamePackage: GamePackage,
    timerImpl?: TimerImpl,
  ) {
    this.definition = definition;
    this.gamePackage = gamePackage;
    this.timerImpl = timerImpl;
  }

  // ---------------------------------------------------------------------------
  // GameModule.setup
  // ---------------------------------------------------------------------------

  setup(players: Player[], ctx: GameContext): void {
    const roomId = ctx.roomId;

    const globals: Record<string, unknown> = {
      round: 0,
      dealer_index: Math.floor(Math.random() * players.length),
      starter_card_json: null,
      active_player_id: null,
      peg_count: 0,
      played_sequence_json: JSON.stringify([]),
      all_played_cards_json: JSON.stringify([]),
      go_players_json: JSON.stringify([]),
      last_peg_points_json: null,
      hand_scores_json: JSON.stringify([]),
      crib_score_json: null,
      winner_json: null,
      player_order_json: JSON.stringify(players.map(p => p.id)),
      player_names_json: JSON.stringify(Object.fromEntries(players.map(p => [p.id, p.name]))),
      discards_done_json: JSON.stringify(Object.fromEntries(players.map(p => [p.id, false]))),
      _hands_json: JSON.stringify([]),
      _deck_json: JSON.stringify([]),
      _crib_json: JSON.stringify([]),
    };

    const perPlayer: Record<string, Record<string, unknown>> = {};
    for (const p of players) {
      perPlayer[p.id] = {
        hand_size: 0,
        has_discarded: false,
        hand_json: null,
        crib_cards_json: null,
        selected_discard_ids_json: null,
        is_my_turn: false,
        can_play: false,
        playable_card_ids_json: null,
        hand_score_json: null,
      };
    }

    const state: RoomState = {
      ctx,
      players: [...players],
      currentPhase: PHASE_DEALING,
      round: 0,
      dealerIndex: globals['dealer_index'] as number,
      globals,
      perPlayer,
    };

    this.rooms.set(roomId, state);

    ctx.initScores(players.map(p => p.id));
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    const phaseState = this.buildPhaseState(state);
    const publicState = this.buildPublicState(state);

    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: this.gamePackage.manifest.id,
      phase: phaseState,
      gamePublicState: publicState,
    });
    ctx.broadcastPrivateState(pid => this.buildPrivateState(state, pid));

    // Start the dealing phase (fires on_enter via extension, then timer)
    this.enterPhase(roomId, PHASE_DEALING);
  }

  // ---------------------------------------------------------------------------
  // GameModule.getPhaseState
  // ---------------------------------------------------------------------------

  getPhaseState(roomId: string): PhaseState {
    const state = this.rooms.get(roomId);
    if (!state) {
      return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 0, timerRemainingMs: null, timerTotalMs: null };
    }
    return this.buildPhaseState(state);
  }

  // ---------------------------------------------------------------------------
  // GameModule.getPublicState
  // ---------------------------------------------------------------------------

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.rooms.get(roomId);
    if (!state) return {};
    return this.buildPublicState(state);
  }

  // ---------------------------------------------------------------------------
  // GameModule.getPrivateState
  // ---------------------------------------------------------------------------

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.rooms.get(roomId);
    if (!state) return {};
    return this.buildPrivateState(state, playerId);
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
    const state = this.rooms.get(roomId);
    if (!state) return { accepted: false, reason: 'Game not found' };

    if (inputType !== InputType.VOTE) {
      return { accepted: false, reason: 'Invalid input type' };
    }

    const ctx = this.makeExtensionContext(state);
    const result = handleCribbageInput(ctx, playerId, payload, state.currentPhase);

    if (!result.accepted) {
      return { accepted: false, reason: result.reason };
    }

    this.broadcastAll(state);

    if (result.phaseComplete) {
      state.ctx.stopTimer();
      this.onPhaseComplete(roomId, state);
    }

    return { accepted: true };
  }

  // ---------------------------------------------------------------------------
  // GameModule.teardown
  // ---------------------------------------------------------------------------

  teardown(roomId: string): void {
    const state = this.rooms.get(roomId);
    if (state) {
      this.stopTimer(state);
      state.ctx.clearScores();
    }
    this.rooms.delete(roomId);
  }

  // ---------------------------------------------------------------------------
  // Phase lifecycle
  // ---------------------------------------------------------------------------

  private enterPhase(roomId: string, phaseId: string): void {
    const state = this.rooms.get(roomId);
    if (!state) return;

    this.stopTimer(state);
    state.currentPhase = phaseId;

    const ctx = this.makeExtensionContext(state);

    // Execute on_enter actions (mirrors game.yaml)
    switch (phaseId) {
      case PHASE_DEALING:
        handleDealRound(ctx);
        break;
      case PHASE_DISCARD:
        handleResetDiscardState(ctx);
        break;
      case PHASE_CUT:
        handleCutStarter(ctx);
        break;
      case PHASE_PEGGING:
        handleStartPegging(ctx);
        break;
      case PHASE_SCORING:
        handleScoreHands(ctx);
        break;
      case PHASE_CRIB:
        handleScoreCrib(ctx);
        break;
      case PHASE_SCORES:
        handleRotateDealer(ctx);
        break;
      // PHASE_RESULTS and PHASE_SCORES: no on_enter actions
    }

    this.broadcastAll(state);

    // Check for winner (set by extension in winner_json)
    if (state.globals['winner_json'] !== null) {
      this.endGame(roomId, state);
      return;
    }

    // Start timer for this phase
    const duration = DURATION[phaseId];
    if (duration !== undefined) {
      const timer = this.timerImpl ?? realTimerEngine;
      timer.start(
        roomId,
        phaseId,
        duration,
        state.ctx.getAllSessionIds(),
        () => this.onTimerExpire(roomId, phaseId),
      );
    }

    // Discard phase: check if all players already discarded
    if (phaseId === PHASE_DISCARD) {
      this.checkDiscardComplete(roomId, state);
    }
  }

  private onTimerExpire(roomId: string, expiredPhase: string): void {
    const state = this.rooms.get(roomId);
    if (!state || state.currentPhase !== expiredPhase) return;

    const ctx = this.makeExtensionContext(state);

    switch (expiredPhase) {
      case PHASE_DISCARD:
        // Auto-discard for any player who hasn't discarded
        handleFinalizeDiscards(ctx);
        this.advanceToPhase(roomId, PHASE_CUT);
        break;
      case PHASE_PEGGING:
        // Timeout during pegging: auto-play for active player
        this.handlePeggingTimeout(roomId, state);
        break;
      case PHASE_SCORES:
        // After scores: loop back to dealing, or end game if there's a winner
        if (state.globals['winner_json'] !== null) {
          this.endGame(roomId, state);
        } else {
          this.advanceToPhase(roomId, PHASE_DEALING);
        }
        break;
      default:
        // Timed phases just advance to next phase
        this.advanceToPhase(roomId, this.nextPhase(expiredPhase));
        break;
    }
  }

  private onPhaseComplete(roomId: string, state: RoomState): void {
    switch (state.currentPhase) {
      case PHASE_DISCARD: {
        const ctx = this.makeExtensionContext(state);
        handleFinalizeDiscards(ctx);
        this.advanceToPhase(roomId, PHASE_CUT);
        break;
      }
      case PHASE_PEGGING:
        this.advanceToPhase(roomId, PHASE_SCORING);
        break;
    }
  }

  private advanceToPhase(roomId: string, nextPhaseId: string | null): void {
    if (!nextPhaseId) {
      const state = this.rooms.get(roomId);
      if (state) this.endGame(roomId, state);
      return;
    }
    this.enterPhase(roomId, nextPhaseId);
  }

  private nextPhase(phaseId: string): string | null {
    switch (phaseId) {
      case PHASE_DEALING:  return PHASE_DISCARD;
      case PHASE_DISCARD:  return PHASE_CUT;
      case PHASE_CUT:      return PHASE_PEGGING;
      case PHASE_PEGGING:  return PHASE_SCORING;
      case PHASE_SCORING:  return PHASE_CRIB;
      case PHASE_CRIB:     return PHASE_RESULTS;
      case PHASE_RESULTS:  return PHASE_SCORES;
      case PHASE_SCORES: {
        // Check winner before deciding next phase
        return null; // handled in onTimerExpire
      }
      default: return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Discard phase completion check
  // ---------------------------------------------------------------------------

  private checkDiscardComplete(roomId: string, state: RoomState): void {
    const discardsDone = this.parseJson<Record<string, boolean>>(
      state.globals['discards_done_json'],
      {},
    );
    const allDone = state.players.every(p => discardsDone[p.id] === true);
    if (allDone) {
      state.ctx.stopTimer();
      const ctx = this.makeExtensionContext(state);
      handleFinalizeDiscards(ctx);
      this.advanceToPhase(roomId, PHASE_CUT);
    }
  }

  // ---------------------------------------------------------------------------
  // Pegging timeout handler
  // ---------------------------------------------------------------------------

  private handlePeggingTimeout(roomId: string, state: RoomState): void {
    const { freshDeck: _fd, dealCards: _dc, ...utils } = { ...({} as Record<string, unknown>) };
    void _fd; void _dc; void utils;

    const activePlayerId = state.globals['active_player_id'] as string | null;
    if (!activePlayerId) {
      this.advanceToPhase(roomId, PHASE_SCORING);
      return;
    }

    const handsData = this.parseJson<Array<{ playerId: string; hand: Array<{ id: string; rank: string; suit: string }>; hasSaidGo: boolean }>>(
      state.globals['_hands_json'],
      [],
    );
    const activePlayer = handsData.find(p => p.playerId === activePlayerId);
    if (!activePlayer) {
      this.advanceToPhase(roomId, PHASE_SCORING);
      return;
    }

    const pegCount = state.globals['peg_count'] as number ?? 0;
    const rankValues: Record<string, number> = {
      'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10,
    };

    const playableCards = activePlayer.hand.filter(
      c => (rankValues[c.rank] ?? 0) + pegCount <= 31,
    );

    if (playableCards.length > 0) {
      // Auto-play first playable card
      const result = this.handleInput(roomId, activePlayerId, InputType.VOTE, {
        action: 'play_card',
        cardId: playableCards[0]!.id,
      });
      if (!result.accepted) {
        this.advanceToPhase(roomId, PHASE_SCORING);
      }
    } else {
      // Auto-go
      const result = this.handleInput(roomId, activePlayerId, InputType.VOTE, {
        action: 'go',
      });
      if (!result.accepted) {
        this.advanceToPhase(roomId, PHASE_SCORING);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Game end
  // ---------------------------------------------------------------------------

  private endGame(roomId: string, state: RoomState): void {
    this.stopTimer(state);
    state.currentPhase = PhaseType.GAME_OVER;

    const scores = state.ctx.getScores();
    const winner = scores[0];

    state.ctx.broadcastGameOver({
      winnerId: winner?.playerId ?? null,
      winnerName: winner?.playerName ?? null,
      winnerTeam: null,
      finalScores: scores,
      gameId: this.gamePackage.manifest.id,
    });

    state.ctx.setRoomStatus(RoomStatus.GAME_ENDED);
    state.ctx.log.info('Game ended', {
      gameId: this.gamePackage.manifest.id,
      winnerId: winner?.playerId,
    });
  }

  // ---------------------------------------------------------------------------
  // Timer helpers
  // ---------------------------------------------------------------------------

  private stopTimer(state: RoomState): void {
    const timer = this.timerImpl ?? realTimerEngine;
    timer.stop(state.ctx.roomId);
  }

  // ---------------------------------------------------------------------------
  // State builders (public/private state for clients)
  // ---------------------------------------------------------------------------

  private buildPhaseState(state: RoomState): PhaseState {
    const timer = this.timerImpl ?? realTimerEngine;
    const remaining = timer.getRemaining(state.ctx.roomId);
    const timerTotalMs = DURATION[state.currentPhase] ?? null;
    return {
      phaseType: state.currentPhase,
      roundNumber: state.globals['round'] as number ?? 0,
      totalRounds: 0,
      timerRemainingMs: remaining,
      timerTotalMs,
    };
  }

  private buildPublicState(state: RoomState): Record<string, unknown> {
    const scores: Record<string, number> = {};
    for (const p of state.players) {
      scores[p.id] = state.ctx.getScore(p.id);
    }

    return {
      gameId: this.gamePackage.manifest.id,
      phase: state.currentPhase,
      round: state.globals['round'],
      dealerIndex: state.globals['dealer_index'],
      dealerName: (() => {
        const order = this.parseJson<string[]>(state.globals['player_order_json'], []);
        const names = this.parseJson<Record<string, string>>(state.globals['player_names_json'], {});
        const dealerId = order[state.globals['dealer_index'] as number] ?? '';
        return names[dealerId] ?? '';
      })(),
      starterCard: this.parseJson(state.globals['starter_card_json'], null),
      playedCards: this.parseJson(state.globals['played_sequence_json'], []),
      allPlayedCards: this.parseJson(state.globals['all_played_cards_json'], []),
      pegCount: state.globals['peg_count'],
      activePlayerId: state.globals['active_player_id'],
      playerOrder: this.parseJson(state.globals['player_order_json'], []),
      playerNames: this.parseJson(state.globals['player_names_json'], {}),
      playerHandSizes: Object.fromEntries(
        state.players.map(p => [p.id, state.perPlayer[p.id]?.['hand_size'] ?? 0]),
      ),
      discardsDone: this.parseJson(state.globals['discards_done_json'], {}),
      lastPegPoints: this.parseJson(state.globals['last_peg_points_json'], null),
      handScores: this.parseJson(state.globals['hand_scores_json'], []),
      cribScore: this.parseJson(state.globals['crib_score_json'], null),
      scores,
      winner: this.parseJson(state.globals['winner_json'], null),
      goPlayers: this.parseJson(state.globals['go_players_json'], []),
    };
  }

  private buildPrivateState(state: RoomState, playerId: string): Record<string, unknown> {
    const pp = state.perPlayer[playerId] ?? {};
    const phase = state.currentPhase;
    const isScoring = phase === PHASE_SCORING || phase === PHASE_CRIB || phase === PHASE_RESULTS;

    return {
      gameId: this.gamePackage.manifest.id,
      phase,
      hand: this.parseJson(pp['hand_json'], []),
      cribCards: this.parseJson(pp['crib_cards_json'], []),
      selectedForDiscard: this.parseJson(pp['selected_discard_ids_json'], []),
      isMyTurn: pp['is_my_turn'] ?? false,
      canPlay: pp['can_play'] ?? false,
      playableCardIds: this.parseJson(pp['playable_card_ids_json'], []),
      handScore: isScoring ? this.parseJson(pp['hand_score_json'], null) : null,
    };
  }

  private broadcastAll(state: RoomState): void {
    state.ctx.broadcastPhase(
      this.buildPhaseState(state),
      this.buildPublicState(state),
    );
    state.ctx.broadcastPrivateState(pid => this.buildPrivateState(state, pid));
  }

  // ---------------------------------------------------------------------------
  // Extension context factory
  // ---------------------------------------------------------------------------

  private makeExtensionContext(state: RoomState): ExtensionActionContext {
    return {
      roomId: state.ctx.roomId,
      globals: state.globals,
      players: state.perPlayer,
      playerInfo: state.players.map(p => ({ id: p.id, name: p.name })),
      setGlobal: (field: string, value: unknown) => {
        state.globals[field] = value;
      },
      setPlayer: (pid: string, field: string, value: unknown) => {
        if (!state.perPlayer[pid]) state.perPlayer[pid] = {};
        state.perPlayer[pid]![field] = value;
      },
      getScore: (pid: string) => state.ctx.getScore(pid),
      addPoints: (pid: string, amount: number) => {
        state.ctx.addPoints(pid, amount);
        // Check for win after adding points
        if (state.ctx.getScore(pid) >= 121 && state.globals['winner_json'] === null) {
          const info = state.players.find(p => p.id === pid);
          state.globals['winner_json'] = JSON.stringify({
            playerId: pid,
            playerName: info?.name ?? pid,
          });
        }
      },
      log: (msg: string, data?: Record<string, unknown>) => {
        state.ctx.log.info(msg, data);
      },
    };
  }

  // ---------------------------------------------------------------------------
  // JSON parse helper
  // ---------------------------------------------------------------------------

  private parseJson<T>(json: unknown, fallback: T): T {
    if (typeof json !== 'string' || !json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  }
}

// ---------------------------------------------------------------------------
// Real timer engine import (lazy, to avoid circular dep in tests)
// ---------------------------------------------------------------------------

// We import timerEngine lazily so test harnesses can override via timerImpl.
import { timerEngine as realTimerEngine } from '../../../server/src/engine/timer-engine.js';

// ---------------------------------------------------------------------------
// Factory function (detected by auto-discover.ts)
// ---------------------------------------------------------------------------

/**
 * Create a CribbageDeclarativeModule.
 * Used by auto-discover.ts as the createModule factory for cribbage.
 *
 * The function name matches the create*Module pattern auto-discover looks for.
 */
export function createCribbageModule(
  definition: GameDefinition,
  gamePackage: GamePackage,
  _gameDir: string,
  timerImpl?: TimerImpl,
): CribbageDeclarativeModule {
  return new CribbageDeclarativeModule(definition, gamePackage, timerImpl);
}
