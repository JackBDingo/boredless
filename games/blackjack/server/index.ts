import type { GameModule } from '@game-platform/game-module.js';
import type { GameContext } from '@game-platform/game-context.js';
import type {
  Player,
  PhaseState,
  GameDefinition,
} from '@boredless/shared';
import {
  PhaseType,
  InputType,
  ServerMessageType,
  RoomStatus,
} from '@boredless/shared';
import { BJPhase } from '../phases.js';
import {
  BJ_STARTING_CHIPS,
  BJ_DEFAULT_BET,
  BJ_MIN_BET,
  BJ_MAX_BET,
  BJ_NUM_DECKS,
  BJ_BETTING_TIME_SECONDS,
  BJ_DEALING_TIME_SECONDS,
  BJ_PLAYING_TIME_SECONDS,
  BJ_DEALER_TIME_SECONDS,
  BJ_RESULTS_TIME_SECONDS,
  BJ_SCORES_TIME_SECONDS,
} from '../constants.js';
import type {
  Card,
  PlayerHand,
  SeatState,
  BJPublicState,
  BJPrivateState,
  HandResult,
} from '../types.js';
import { freshShoe, deal, handValue, isBlackjack } from './deck.js';

// ============================================================
// Internal types
// ============================================================

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

interface BJGameState {
  roomId: string;
  ctx: GameContext;
  players: InternalPlayer[];
  currentPhase: string;

  // Table state
  shoe: Card[];
  dealerCards: Card[];
  roundNumber: number;

  lastAction: { playerId: string; playerName: string; action: string } | null;

  phaseAdvancing: boolean;
}

// ============================================================
// Helper: resolve active hand for a player
// ============================================================
function getActiveHand(p: InternalPlayer): PlayerHand | null {
  return p.hands[p.activeHandIndex] ?? null;
}

function allPlayersSettled(state: BJGameState): boolean {
  return state.players.every(p => {
    // Each hand must be stood, busted, or blackjack
    return p.hands.every(h => h.stood || h.bust || h.blackjack);
  });
}

// ============================================================
// Main module class
// ============================================================

class BlackjackModule implements GameModule {
  readonly definition: GameDefinition;
  private states = new Map<string, BJGameState>();

  constructor(definition: GameDefinition) {
    this.definition = definition;
  }

  // ===== GameModule interface =====

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

    const state: BJGameState = {
      roomId,
      ctx,
      players: internalPlayers,
      currentPhase: BJPhase.BETTING,
      shoe: freshShoe(BJ_NUM_DECKS),
      dealerCards: [],
      roundNumber: 0,
      lastAction: null,
      phaseAdvancing: false,
    };

    this.states.set(roomId, state);
    ctx.initScores(players.map(p => p.id));
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: 'blackjack',
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });
    ctx.broadcastPrivateState(pid => this.getPrivateState(roomId, pid));

    // Start betting phase
    this.startBetting(state);
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) {
      return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 0, timerRemainingMs: null, timerTotalMs: null };
    }
    const remaining = state.ctx.getTimerRemaining();
    let timerTotalMs: number | null = null;
    switch (state.currentPhase) {
      case BJPhase.BETTING:  timerTotalMs = BJ_BETTING_TIME_SECONDS * 1000; break;
      case BJPhase.DEALING:  timerTotalMs = BJ_DEALING_TIME_SECONDS * 1000; break;
      case BJPhase.PLAYING:  timerTotalMs = BJ_PLAYING_TIME_SECONDS * 1000; break;
      case BJPhase.DEALER:   timerTotalMs = BJ_DEALER_TIME_SECONDS * 1000; break;
      case BJPhase.RESULTS:  timerTotalMs = BJ_RESULTS_TIME_SECONDS * 1000; break;
      case BJPhase.SCORES:   timerTotalMs = BJ_SCORES_TIME_SECONDS * 1000; break;
    }
    return {
      phaseType: state.currentPhase,
      roundNumber: state.roundNumber,
      totalRounds: 0,
      timerRemainingMs: remaining,
      timerTotalMs,
    };
  }

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const seats: SeatState[] = state.players.map(p => ({
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

    const dealerScore = handValue(state.dealerCards).score;
    // During playing phase, only show first dealer card value
    const visibleDealerScore = state.currentPhase === BJPhase.PLAYING
      ? (state.dealerCards[0] ? handValue([state.dealerCards[0]]).score : 0)
      : dealerScore;

    const pub: BJPublicState = {
      gameId: 'blackjack',
      seats,
      dealerCards: state.dealerCards,
      dealerScore: visibleDealerScore,
      dealerHoleHidden: state.currentPhase === BJPhase.PLAYING,
      roundNumber: state.roundNumber,
      lastAction: state.lastAction,
    };

    return pub as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

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
      && player.hands.length < 2 // Only 1 split allowed
      && activeHand.cards[0].rank === activeHand.cards[1].rank
      && player.chips >= activeHand.bet;

    const priv: BJPrivateState = {
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

    return priv as unknown as Record<string, unknown>;
  }

  handleInput(
    roomId: string,
    playerId: string,
    inputType: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const state = this.states.get(roomId);
    if (!state) return { accepted: false, reason: 'Game not found' };

    if (inputType !== InputType.VOTE) {
      return { accepted: false, reason: 'Invalid input type' };
    }

    const action = String(payload.action ?? '');

    // Betting phase: place/adjust bet
    if (state.currentPhase === BJPhase.BETTING && action === 'bet') {
      return this.handleBet(state, playerId, payload);
    }

    // Playing phase: hit/stand/double/split
    if (state.currentPhase === BJPhase.PLAYING) {
      return this.handlePlayAction(state, playerId, action);
    }

    return { accepted: false, reason: 'Action not valid in current phase' };
  }

  teardown(roomId: string): void {
    const state = this.states.get(roomId);
    if (state) {
      state.ctx.stopTimer();
      state.ctx.clearScores();
    }
    this.states.delete(roomId);
  }

  // ===== Phase management =====

  private startBetting(state: BJGameState): void {
    state.currentPhase = BJPhase.BETTING;
    state.lastAction = null;

    // Reset round state
    for (const p of state.players) {
      p.hands = [];
      p.activeHandIndex = 0;
      p.result = null;
      p.resultAmount = 0;
      p.betPlaced = false;
      // Keep their last bet as default (clamped to chips)
      p.bet = Math.min(Math.max(p.bet, BJ_MIN_BET), Math.min(BJ_MAX_BET, p.chips > 0 ? p.chips : BJ_MIN_BET));
    }

    this.broadcastAll(state);

    state.ctx.startTimer(
      BJPhase.BETTING,
      BJ_BETTING_TIME_SECONDS * 1000,
      () => this.startDealing(state),
    );
  }

  private startDealing(state: BJGameState): void {
    if (state.phaseAdvancing) return;
    state.phaseAdvancing = true;

    state.ctx.stopTimer();
    state.currentPhase = BJPhase.DEALING;
    state.roundNumber++;

    // Reshuffle if shoe is running low
    if (state.shoe.length < 52) {
      state.shoe = freshShoe(BJ_NUM_DECKS);
      state.ctx.log.info('Shoe reshuffled');
    }

    // Deal initial 2 cards to each player and dealer
    // Order: player, dealer, player, dealer (standard)
    state.dealerCards = [];

    for (const p of state.players) {
      // Players with no chips can't bet — give them spectator status
      if (p.chips <= 0) {
        p.hands = [{
          cards: [],
          bet: 0,
          doubled: false,
          split: false,
          bust: false,
          stood: true, // auto-stand with no chips
          blackjack: false,
        }];
        continue;
      }

      const bet = Math.min(p.bet, p.chips);
      p.chips -= bet;

      p.hands = [{
        cards: deal(state.shoe, 2),
        bet,
        doubled: false,
        split: false,
        bust: false,
        stood: false,
        blackjack: false,
      }];
      p.activeHandIndex = 0;

      // Check for natural blackjack
      if (isBlackjack(p.hands[0].cards)) {
        p.hands[0].blackjack = true;
        p.hands[0].stood = true;
      }
    }

    // Deal dealer cards
    state.dealerCards = deal(state.shoe, 2);

    state.phaseAdvancing = false;
    this.broadcastAll(state);

    state.ctx.startTimer(
      BJPhase.DEALING,
      BJ_DEALING_TIME_SECONDS * 1000,
      () => this.startPlaying(state),
    );
  }

  private startPlaying(state: BJGameState): void {
    if (state.phaseAdvancing) return;
    state.phaseAdvancing = true;
    state.ctx.stopTimer();
    state.currentPhase = BJPhase.PLAYING;
    state.phaseAdvancing = false;

    // If all players already settled (all blackjacks), skip to dealer
    if (allPlayersSettled(state)) {
      this.startDealerPlay(state);
      return;
    }

    this.broadcastAll(state);

    state.ctx.startTimer(
      BJPhase.PLAYING,
      BJ_PLAYING_TIME_SECONDS * 1000,
      () => {
        // Auto-stand anyone who hasn't acted
        for (const p of state.players) {
          for (const hand of p.hands) {
            if (!hand.stood && !hand.bust && !hand.blackjack) {
              hand.stood = true;
            }
          }
        }
        this.startDealerPlay(state);
      },
    );
  }

  private startDealerPlay(state: BJGameState): void {
    if (state.phaseAdvancing) return;
    state.phaseAdvancing = true;

    state.ctx.stopTimer();
    state.currentPhase = BJPhase.DEALER;

    // Dealer reveals hole card and plays
    // Dealer hits on 16 or less, stands on soft 17+
    let safety = 0;
    while (safety++ < 20) {
      const { score, soft } = handValue(state.dealerCards);
      // Stand on hard 17+ or soft 17+
      if (score >= 17) break;
      // Also stand if soft 17 exactly (soft17 stand rule)
      if (soft && score === 17) break;
      state.dealerCards.push(...deal(state.shoe, 1));
    }

    state.phaseAdvancing = false;
    this.broadcastAll(state);

    state.ctx.startTimer(
      BJPhase.DEALER,
      BJ_DEALER_TIME_SECONDS * 1000,
      () => this.resolveResults(state),
    );
  }

  private resolveResults(state: BJGameState): void {
    if (state.phaseAdvancing) return;
    state.phaseAdvancing = true;

    state.ctx.stopTimer();
    state.currentPhase = BJPhase.RESULTS;

    const { score: dealerScore } = handValue(state.dealerCards);
    const dealerBust = dealerScore > 21;
    const dealerBlackjack = isBlackjack(state.dealerCards);

    for (const p of state.players) {
      let totalDelta = 0;
      let overallResult: HandResult = 'pending';

      for (const hand of p.hands) {
        if (hand.bet === 0) continue; // Spectator / no-chips hand

        const { score: playerScore } = handValue(hand.cards);

        let handResult: HandResult;
        let delta = 0;

        if (hand.blackjack && !dealerBlackjack) {
          // Natural blackjack pays 3:2
          handResult = 'blackjack';
          delta = hand.bet + Math.floor(hand.bet * 1.5);
        } else if (hand.blackjack && dealerBlackjack) {
          // Both blackjack → push
          handResult = 'push';
          delta = hand.bet; // Return bet
        } else if (hand.bust) {
          // Player bust → lose (bet already taken)
          handResult = 'bust';
          delta = 0;
        } else if (dealerBust) {
          // Dealer bust → player wins
          handResult = 'win';
          delta = hand.bet * 2;
        } else if (playerScore > dealerScore) {
          handResult = 'win';
          delta = hand.bet * 2;
        } else if (playerScore === dealerScore) {
          handResult = 'push';
          delta = hand.bet; // Return bet
        } else {
          handResult = 'lose';
          delta = 0;
        }

        p.chips += delta;
        totalDelta += delta - hand.bet; // Net gain/loss (bet already deducted on deal)
        overallResult = handResult; // For single-hand, this is the result
      }

      // For split hands, use best result
      if (p.hands.length > 1) {
        const results = p.hands.map(h => {
          const { score } = handValue(h.cards);
          if (h.blackjack && !dealerBlackjack) return 'blackjack' as HandResult;
          if (h.bust) return 'bust' as HandResult;
          if (dealerBust) return 'win' as HandResult;
          if (score > dealerScore) return 'win' as HandResult;
          if (score === dealerScore) return 'push' as HandResult;
          return 'lose' as HandResult;
        });
        // Pick the "best" result to show
        if (results.includes('blackjack')) overallResult = 'blackjack';
        else if (results.includes('win')) overallResult = 'win';
        else if (results.includes('push')) overallResult = 'push';
        else if (results.includes('bust')) overallResult = 'bust';
        else overallResult = 'lose';
      }

      p.result = overallResult;
      p.resultAmount = totalDelta;

      // Update scores (chips = score proxy)
      const currentScore = state.ctx.getScore(p.playerId);
      const diff = p.chips - currentScore;
      if (diff > 0) state.ctx.addPoints(p.playerId, diff);
    }

    state.phaseAdvancing = false;
    this.broadcastAll(state);

    state.ctx.startTimer(
      BJPhase.RESULTS,
      BJ_RESULTS_TIME_SECONDS * 1000,
      () => this.showScores(state),
    );
  }

  private showScores(state: BJGameState): void {
    state.ctx.stopTimer();
    state.currentPhase = BJPhase.SCORES;

    state.ctx.broadcastScores();
    this.broadcastAll(state);

    // Check if game is over: all players have 0 chips
    const activePlayers = state.players.filter(p => p.chips > 0);
    const nextAction = activePlayers.length === 0 || state.roundNumber >= 20
      ? () => this.endGame(state)
      : () => this.startBetting(state);

    state.ctx.startTimer(
      BJPhase.SCORES,
      BJ_SCORES_TIME_SECONDS * 1000,
      nextAction,
    );
  }

  private endGame(state: BJGameState): void {
    state.ctx.stopTimer();
    state.currentPhase = PhaseType.GAME_OVER;

    const scores = state.ctx.getScores();
    const winner = scores[0];

    state.ctx.broadcastGameOver({
      winnerId: winner?.playerId ?? null,
      winnerName: winner?.playerName ?? null,
      winnerTeam: null,
      finalScores: scores,
      gameId: 'blackjack',
    });

    state.ctx.setRoomStatus(RoomStatus.GAME_ENDED);
    state.ctx.log.info('Game ended', { winnerId: winner?.playerId });
  }

  // ===== Input handlers =====

  private handleBet(
    state: BJGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return { accepted: false, reason: 'Player not found' };

    const betAmount = Number(payload.bet ?? BJ_DEFAULT_BET);
    if (isNaN(betAmount) || betAmount < BJ_MIN_BET || betAmount > BJ_MAX_BET) {
      return { accepted: false, reason: `Bet must be between ${BJ_MIN_BET} and ${BJ_MAX_BET}` };
    }
    if (betAmount > player.chips) {
      return { accepted: false, reason: 'Not enough chips' };
    }

    player.bet = betAmount;
    player.betPlaced = true;
    state.lastAction = { playerId, playerName: player.playerName, action: `bet ${betAmount}` };

    this.broadcastAll(state);

    // If all players have placed bets, advance early
    const allBet = state.players.every(p => p.betPlaced || p.chips <= 0);
    if (allBet) {
      this.startDealing(state);
    }

    return { accepted: true };
  }

  private handlePlayAction(
    state: BJGameState,
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
        hand.cards.push(...newCard);
        const { score } = handValue(hand.cards);
        if (score > 21) {
          hand.bust = true;
          hand.stood = true; // Auto-stand busted hand
          // Move to next split hand if any
          this.advanceHand(player);
        }
        state.lastAction = { playerId, playerName: player.playerName, action: 'hit' };
        break;
      }
      case 'stand': {
        hand.stood = true;
        this.advanceHand(player);
        state.lastAction = { playerId, playerName: player.playerName, action: 'stand' };
        break;
      }
      case 'double': {
        const { score } = handValue(hand.cards);
        if (hand.cards.length !== 2 || score > 21) {
          return { accepted: false, reason: 'Cannot double down' };
        }
        if (player.chips < hand.bet) {
          return { accepted: false, reason: 'Not enough chips to double' };
        }
        player.chips -= hand.bet;
        hand.bet *= 2;
        hand.doubled = true;
        const newCard = deal(state.shoe, 1);
        hand.cards.push(...newCard);
        const { score: newScore } = handValue(hand.cards);
        hand.stood = true; // Auto-stand after double
        if (newScore > 21) hand.bust = true;
        this.advanceHand(player);
        state.lastAction = { playerId, playerName: player.playerName, action: 'double' };
        break;
      }
      case 'split': {
        if (hand.cards.length !== 2 || player.hands.length >= 2) {
          return { accepted: false, reason: 'Cannot split' };
        }
        if (hand.cards[0].rank !== hand.cards[1].rank) {
          return { accepted: false, reason: 'Cards must match to split' };
        }
        if (player.chips < hand.bet) {
          return { accepted: false, reason: 'Not enough chips to split' };
        }

        // Create second hand with the split card
        const splitCard = hand.cards.pop()!;
        player.chips -= hand.bet;

        const newHand: PlayerHand = {
          cards: [splitCard, ...deal(state.shoe, 1)],
          bet: hand.bet,
          doubled: false,
          split: true,
          bust: false,
          stood: false,
          blackjack: false,
        };
        hand.split = true;
        // Deal a new card to the original hand too
        hand.cards.push(...deal(state.shoe, 1));

        // Note: no blackjack on split aces (treat as 21, not BJ)
        player.hands.push(newHand);

        state.lastAction = { playerId, playerName: player.playerName, action: 'split' };
        break;
      }
      default:
        return { accepted: false, reason: 'Unknown action' };
    }

    this.broadcastAll(state);

    // Check if all players have finished their hands
    if (allPlayersSettled(state)) {
      this.startDealerPlay(state);
    }

    return { accepted: true };
  }

  /** Advance to next split hand if available */
  private advanceHand(player: InternalPlayer): void {
    const nextIndex = player.activeHandIndex + 1;
    if (nextIndex < player.hands.length) {
      const nextHand = player.hands[nextIndex];
      if (nextHand && !nextHand.stood && !nextHand.bust) {
        player.activeHandIndex = nextIndex;
      }
    }
  }

  // ===== Utilities =====

  private broadcastAll(state: BJGameState): void {
    state.ctx.broadcastPhase(this.getPhaseState(state.roomId), this.getPublicState(state.roomId));
    state.ctx.broadcastPrivateState(pid => this.getPrivateState(state.roomId, pid));
  }
}

export function createModule(definition: GameDefinition): GameModule {
  return new BlackjackModule(definition);
}
