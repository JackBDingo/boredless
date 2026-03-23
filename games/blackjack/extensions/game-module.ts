/**
 * game-module.ts — Blackjack V2 game module factory.
 *
 * Creates a BlackjackV2Module — a GameModule implementation that:
 *
 *   1. Reads game.yaml for schema metadata (manifest, state model docs,
 *      phase declarations, presentation config).
 *
 *   2. Uses DeclarativeGameModule for "simple" phases: betting, dealing,
 *      dealer, results, scores, game_over.
 *
 *   3. Overrides the playing phase entirely because multi-step player
 *      interactions (hit → hit → stand) require per-action card mutations
 *      that exceed the current declarative input_gate model's capability.
 *
 * Architecture decision (per Anti-Drift Protocol §Rule 9):
 *   The playing phase requires multiple sequential actions per player
 *   (hit* → stand|double|split), each of which mutates nested card arrays,
 *   deals from the shoe, and computes derived state (can_double, can_split).
 *   The declarative input_gate primitive tracks one submission per player;
 *   multi-step interaction is not yet supported. This extension handles it.
 *
 *   All other phases (betting, dealing, dealer, results, scores) use the
 *   DeclarativeGameModule normally via phase lifecycle actions.
 *
 * Used by auto-discover.ts:
 *   Detects extensions/game-module.ts, calls createBlackjackModule(def, pkg, dir).
 */

import type { GameModule } from '../../../server/src/games/game-module.js';
import type { GameContext } from '../../../server/src/games/game-context.js';
import type { Player, PhaseState, GameDefinition } from '@boredless/shared';
import { ServerMessageType } from '@boredless/shared';
import type { GamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';

import {
  freshShoe,
  deal,
  handValue,

  type Card,
  type PlayerHand,
  type HandResult,
} from './deck.js';
import {
  isBlackjackAction,
  handleStartBetting,
  handleDealCards,
  handleDealerPlay,
  handleResolveResults,
  type BlackjackActionContext,
  BJ_NUM_DECKS,
  BJ_MIN_BET,
  BJ_MAX_BET,
  BJ_DEFAULT_BET,
  BJ_STARTING_CHIPS,

} from './index.js';

// ---------------------------------------------------------------------------
// Phase ID constants (match game.yaml)
// ---------------------------------------------------------------------------

const PHASE = {
  BETTING: 'bj_betting',
  DEALING: 'bj_dealing',
  PLAYING: 'bj_playing',
  DEALER: 'bj_dealer',
  RESULTS: 'bj_results',
  SCORES: 'bj_scores',
  GAME_OVER: 'game_over',
} as const;


// ---------------------------------------------------------------------------
// Internal per-player state (mirrors V1 InternalPlayer)
// ---------------------------------------------------------------------------

interface InternalPlayer {
  playerId: string;
  playerName: string;
  chips: number;
  bet: number;
  betPlaced: boolean;
  hands: PlayerHand[];
  activeHandIndex: number;
  result: HandResult | null;
  resultAmount: number;
  connected: boolean;
}

interface BlackjackRoomState {
  roomId: string;
  ctx: GameContext;
  players: InternalPlayer[];
  shoe: Card[];
  dealerCards: Card[];
  roundNumber: number;
  lastAction: { playerId: string; playerName: string; action: string } | null;
  phaseAdvancing: boolean;
  /** The DeclarativeGameModule handles all non-playing phases. */
  declarativeModule: DeclarativeGameModule;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function getActiveHand(p: InternalPlayer): PlayerHand | null {
  return p.hands[p.activeHandIndex] ?? null;
}

function allPlayersSettled(state: BlackjackRoomState): boolean {
  return state.players.every(p =>
    p.hands.every(h => h.stood || h.bust || h.blackjack),
  );
}

function advanceHand(player: InternalPlayer): void {
  const nextIndex = player.activeHandIndex + 1;
  if (nextIndex < player.hands.length) {
    const next = player.hands[nextIndex];
    if (next && !next.stood && !next.bust) {
      player.activeHandIndex = nextIndex;
    }
  }
}


function syncGlobalFromContext(
  state: BlackjackRoomState,
  field: string,
  value: unknown,
): void {
  switch (field) {
    case 'round_number':
      state.roundNumber = Number(value);
      break;
    case 'shoe_json':
      if (typeof value === 'string') {
        try { state.shoe = JSON.parse(value) as Card[]; } catch { /* ignore */ }
      } else if (value === null) {
        state.shoe = freshShoe(BJ_NUM_DECKS);
      }
      break;
    case 'dealer_cards_json':
      if (typeof value === 'string') {
        try { state.dealerCards = JSON.parse(value) as Card[]; } catch { /* ignore */ }
      } else if (value === null) {
        state.dealerCards = [];
      }
      break;
    case 'last_action_json':
      if (typeof value === 'string' && value) {
        try { state.lastAction = JSON.parse(value) as typeof state.lastAction; } catch { /* ignore */ }
      } else {
        state.lastAction = null;
      }
      break;
    // Other globals (dealer_hole_hidden, seats_json, etc.) are computed on broadcast
    default:
      break;
  }
}

function syncPlayerFromContext(
  state: BlackjackRoomState,
  playerId: string,
  field: string,
  value: unknown,
): void {
  const player = state.players.find(p => p.playerId === playerId);
  if (!player) return;

  switch (field) {
    case 'chips':
      player.chips = Number(value);
      break;
    case 'bet':
      player.bet = Number(value);
      break;
    case 'bet_placed':
      player.betPlaced = Boolean(value);
      break;
    case 'hands_json':
      if (typeof value === 'string' && value) {
        try { player.hands = JSON.parse(value) as PlayerHand[]; } catch { /* ignore */ }
      } else {
        player.hands = [];
      }
      break;
    case 'active_hand_index':
      player.activeHandIndex = Number(value);
      break;
    case 'result':
      player.result = (value as HandResult) ?? null;
      break;
    case 'result_amount':
      player.resultAmount = Number(value);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// BlackjackV2Module — GameModule implementation
// ---------------------------------------------------------------------------

class BlackjackV2Module implements GameModule {
  readonly definition: GameDefinition;
  private readonly gamePackage: GamePackage;
  private readonly timerImpl: TimerImpl | undefined;
  private readonly states = new Map<string, BlackjackRoomState>();

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

    const internalPlayers: InternalPlayer[] = players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      chips: BJ_STARTING_CHIPS,
      bet: BJ_DEFAULT_BET,
      betPlaced: false,
      hands: [],
      activeHandIndex: 0,
      result: null,
      resultAmount: 0,
      connected: true,
    }));

    // Create extension action handler for phase lifecycle hooks
    const handler = this.createExtensionHandler();

    // Create DeclarativeGameModule for phase orchestration
    const declarativeModule = new DeclarativeGameModule(
      this.definition,
      this.gamePackage,
      this.timerImpl,
      handler,
    );

    const roomState: BlackjackRoomState = {
      roomId,
      ctx,
      players: internalPlayers,
      shoe: freshShoe(BJ_NUM_DECKS),
      dealerCards: [],
      roundNumber: 0,
      lastAction: null,
      phaseAdvancing: false,
      declarativeModule,
    };

    this.states.set(roomId, roomState);

    // Delegate setup to DeclarativeGameModule — it handles phase machine,
    // state manager, timers, and broadcasts
    declarativeModule.setup(players, ctx);
  }

  // ---------------------------------------------------------------------------
  // GameModule.getPhaseState — delegate to declarative module
  // ---------------------------------------------------------------------------

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) {
      return {
        phaseType: 'lobby',
        roundNumber: 0,
        totalRounds: 0,
        timerRemainingMs: null,
        timerTotalMs: null,
      };
    }
    return state.declarativeModule.getPhaseState(roomId);
  }

  // ---------------------------------------------------------------------------
  // GameModule.getPublicState — return wrapper state when available
  // ---------------------------------------------------------------------------

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    // If the wrapper has internal game state (players dealt in, etc.),
    // return the rich blackjack-specific public state so the display
    // can render cards, seats, dealer hand, etc.
    if (state.players.length > 0) {
      return this.buildPlayingPublicState(state);
    }

    return state.declarativeModule.getPublicState(roomId);
  }

  // ---------------------------------------------------------------------------
  // GameModule.getPrivateState — return wrapper state when available
  // ---------------------------------------------------------------------------

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    // If the wrapper has internal game state, return the rich
    // blackjack-specific private state (cards, chips, actions).
    if (state.players.length > 0) {
      return this.buildPlayingPrivateState(state, playerId);
    }

    return state.declarativeModule.getPrivateState(roomId, playerId);
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
    const state = this.states.get(roomId);
    if (!state) return { accepted: false, reason: 'Game not found' };

    const phase = this.getCurrentPhase(roomId);
    const action = String(payload['action'] ?? '');

    // --- Betting phase ---
    if (phase === PHASE.BETTING && action === 'bet') {
      return this.handleBet(state, playerId, payload);
    }

    // --- Playing phase ---
    if (phase === PHASE.PLAYING && ['hit', 'stand', 'double', 'split'].includes(action)) {
      return this.handlePlayAction(state, playerId, action);
    }

    // All other inputs: delegate to DeclarativeGameModule
    return state.declarativeModule.handleInput(roomId, playerId, inputType, payload);
  }

  // ---------------------------------------------------------------------------
  // GameModule.teardown
  // ---------------------------------------------------------------------------

  teardown(roomId: string): void {
    const state = this.states.get(roomId);
    if (state) {
      state.declarativeModule.teardown(roomId);
    }
    this.states.delete(roomId);
  }

  // ---------------------------------------------------------------------------
  // Extension action handler
  // ---------------------------------------------------------------------------

  private createExtensionHandler(): ExtensionActionHandler {
    return (actionName: string, ctx: ExtensionActionContext): boolean => {
      if (!isBlackjackAction(actionName)) return false;

      // Find the room state that corresponds to this action context
      const state = this.getRoomStateForContext(ctx.roomId);
      if (!state) return false;

      // Adapt ExtensionActionContext → BlackjackActionContext.
      // Writes go to DeclarativeGameModule's StateManager (via ctx) AND
      // sync back to our internal state (for playing-phase card management).
      const bjCtx: BlackjackActionContext = {
        globals: ctx.globals,
        players: ctx.players,
        playerInfo: ctx.playerInfo,
        getScore: ctx.getScore,
        addPoints: ctx.addPoints,
        setGlobal: (field: string, value: unknown) => {
          ctx.setGlobal(field, value);
          syncGlobalFromContext(state, field, value);
        },
        setPlayer: (playerId: string, field: string, value: unknown) => {
          ctx.setPlayer(playerId, field, value);
          syncPlayerFromContext(state, playerId, field, value);
        },
        log: (msg: string, data?: unknown) => {
          ctx.log(msg, data as Record<string, unknown>);
        },
      };

      switch (actionName) {
        case 'bj_start_betting':
          handleStartBetting(bjCtx);
          return true;
        case 'bj_deal_cards':
          handleDealCards(bjCtx);
          return true;
        case 'bj_dealer_play':
          handleDealerPlay(bjCtx);
          return true;
        case 'bj_resolve_results':
          handleResolveResults(bjCtx);
          return true;
        default:
          return false;
      }
    };
  }

  private getRoomStateForContext(roomId: string): BlackjackRoomState | undefined {
    return this.states.get(roomId);
  }

  // ---------------------------------------------------------------------------
  // Input handlers
  // ---------------------------------------------------------------------------

  private handleBet(
    state: BlackjackRoomState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return { accepted: false, reason: 'Player not found' };

    const betAmount = Number(payload['bet'] ?? BJ_DEFAULT_BET);
    if (isNaN(betAmount) || betAmount < BJ_MIN_BET || betAmount > BJ_MAX_BET) {
      return { accepted: false, reason: `Bet must be between ${BJ_MIN_BET} and ${BJ_MAX_BET}` };
    }
    if (betAmount > player.chips) {
      return { accepted: false, reason: 'Not enough chips' };
    }

    player.bet = betAmount;
    player.betPlaced = true;
    state.lastAction = { playerId, playerName: player.playerName, action: `bet ${betAmount}` };

    // Sync to declarative module via standard input submission
    // Value = true marks bet_placed in the state manager
    const result = state.declarativeModule.handleInput(
      state.roomId,
      playerId,
      'confirm',
      { value: true },
    );

    // If all bets placed, the declarative module will auto-advance via InputCollector
    return result;
  }

  private handlePlayAction(
    state: BlackjackRoomState,
    playerId: string,
    action: string,
  ): { accepted: boolean; reason?: string } {
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return { accepted: false, reason: 'Player not found' };

    const hand = getActiveHand(player);
    if (!hand) return { accepted: false, reason: 'No active hand' };
    if (hand.stood || hand.bust || hand.blackjack) {
      return { accepted: false, reason: 'Hand is already settled' };
    }

    switch (action) {
      case 'hit': {
        const newCard = deal(state.shoe, 1);
        if (newCard.length === 0) return { accepted: false, reason: 'Shoe empty' };
        hand.cards.push(...newCard);
        const { score } = handValue(hand.cards);
        if (score > 21) {
          hand.bust = true;
          hand.stood = true;
          advanceHand(player);
        }
        state.lastAction = { playerId, playerName: player.playerName, action: 'hit' };
        break;
      }
      case 'stand': {
        hand.stood = true;
        advanceHand(player);
        state.lastAction = { playerId, playerName: player.playerName, action: 'stand' };
        break;
      }
      case 'double': {
        if (hand.cards.length !== 2) return { accepted: false, reason: 'Cannot double down' };
        if (player.chips < hand.bet) return { accepted: false, reason: 'Not enough chips to double' };
        player.chips -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        const newCard = deal(state.shoe, 1);
        if (newCard.length > 0) hand.cards.push(...newCard);
        hand.stood = true;
        const { score } = handValue(hand.cards);
        if (score > 21) hand.bust = true;
        advanceHand(player);
        state.lastAction = { playerId, playerName: player.playerName, action: 'double' };
        break;
      }
      case 'split': {
        if (hand.cards.length !== 2 || player.hands.length >= 2) {
          return { accepted: false, reason: 'Cannot split' };
        }
        if (hand.cards[0]?.rank !== hand.cards[1]?.rank) {
          return { accepted: false, reason: 'Cards must match to split' };
        }
        if (player.chips < hand.bet) {
          return { accepted: false, reason: 'Not enough chips to split' };
        }
        player.chips -= hand.bet;
        const splitCard = hand.cards.pop()!;
        hand.split = true;
        hand.cards.push(...deal(state.shoe, 1));
        const newHand: PlayerHand = {
          cards: [splitCard, ...deal(state.shoe, 1)],
          bet: hand.bet,
          doubled: false,
          split: true,
          bust: false,
          stood: false,
          blackjack: false,
        };
        player.hands.push(newHand);
        state.lastAction = { playerId, playerName: player.playerName, action: 'split' };
        break;
      }
      default:
        return { accepted: false, reason: `Unknown action: ${action}` };
    }

    // Sync player hands back to the declarative state manager via standard input
    const playerSettled = player.hands.every(h => h.stood || h.bust || h.blackjack);

    if (playerSettled) {
      // Tell the declarative input_gate that this player is done
      // This marks all_settled = true and potentially completes the phase
      state.declarativeModule.handleInput(
        state.roomId,
        playerId,
        'confirm',
        { value: true },
      );
    }

    // Broadcast updated state (the declarative module already broadcast after the input above,
    // but if not settled we need to update state ourselves)
    // The simplest approach: use the declarative module's state sync mechanism
    state.ctx.sendToPlayer(playerId, {
      type: ServerMessageType.PRIVATE_STATE,
      state: this.buildPlayingPrivateState(state, playerId),
    });

    // Broadcast public state update
    state.ctx.sendToAll({
      type: ServerMessageType.GAME_EVENT,
      event: 'state_update',
      data: this.buildPlayingPublicState(state),
    } as Parameters<typeof state.ctx.sendToAll>[0]);

    // Check early advance: if all players settled, the declarative module will have
    // already advanced the phase (via the last playerSettled input above).
    // If not all settled yet, we just wait.

    return { accepted: true };
  }

  // ---------------------------------------------------------------------------
  // State builders for playing phase broadcasts
  // ---------------------------------------------------------------------------

  private buildPlayingPublicState(state: BlackjackRoomState): Record<string, unknown> {
    const dealerCards = state.dealerCards;
    const dealerScore = dealerCards[0] ? handValue([dealerCards[0]]).score : 0;

    const seats = state.players.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      chips: p.chips,
      bet: p.bet,
      hands: p.hands,
      activeHandIndex: p.activeHandIndex,
      stood: p.hands.length > 0 && p.hands.every(h => h.stood || h.bust || h.blackjack),
      result: p.result,
      resultAmount: p.resultAmount,
      betPlaced: p.betPlaced,
      connected: p.connected,
    }));

    return {
      gameId: 'blackjack',
      seats,
      dealerCards: [dealerCards[0]], // Only show first card during playing
      dealerScore,
      dealerHoleHidden: true,
      roundNumber: state.roundNumber,
      lastAction: state.lastAction,
    };
  }

  private buildPlayingPrivateState(
    state: BlackjackRoomState,
    playerId: string,
  ): Record<string, unknown> {
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return {};

    const activeHand = getActiveHand(player);
    const canDouble = activeHand != null
      && !activeHand.doubled
      && !activeHand.stood
      && !activeHand.bust
      && !activeHand.blackjack
      && activeHand.cards.length === 2
      && player.chips >= activeHand.bet;

    const canSplit = activeHand != null
      && !activeHand.stood
      && !activeHand.bust
      && !activeHand.blackjack
      && activeHand.cards.length === 2
      && player.hands.length < 2
      && activeHand.cards[0]?.rank === activeHand.cards[1]?.rank
      && player.chips >= activeHand.bet;

    return {
      gameId: 'blackjack',
      chips: player.chips,
      bet: player.bet,
      hands: player.hands,
      activeHandIndex: player.activeHandIndex,
      stood: player.hands.length > 0 && player.hands.every(h => h.stood || h.bust || h.blackjack),
      result: player.result,
      resultAmount: player.resultAmount,
      canDouble,
      canSplit,
      betPlaced: player.betPlaced,
    };
  }

  // ---------------------------------------------------------------------------
  // Utility: get current phase from declarative module
  // ---------------------------------------------------------------------------

  private getCurrentPhase(roomId: string): string {
    const phaseState = this.getPhaseState(roomId);
    return phaseState.phaseType;
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create a Blackjack V2 GameModule.
 * Used by auto-discover.ts as the createModule factory for blackjack.
 */
export function createBlackjackModule(
  definition: GameDefinition,
  gamePackage: GamePackage,
  _gameDir: string,
  timerImpl?: TimerImpl,
): BlackjackV2Module {
  return new BlackjackV2Module(definition, gamePackage, timerImpl);
}
