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
import { THPhase } from '../phases.js';
import {
  TH_STARTING_CHIPS,
  TH_SMALL_BLIND,
  TH_BIG_BLIND,
  TH_ACTION_TIME_SECONDS,
  TH_SHOWDOWN_TIME_SECONDS,
  TH_SCORES_TIME_SECONDS,
  TH_INSTRUCTIONS_TIME_SECONDS,
  TH_BLIND_ESCALATION_HANDS,
} from '../constants.js';
import type {
  Card,
  ActionType,
  THPublicState,
  THPrivateState,
  SeatState,
  SidePot,
  WinnerInfo,
  AvailableAction,
} from '../types.js';
import { freshDeck, deal } from './deck.js';
import { evaluateBestHand, compareHands } from './hand-evaluator.js';

/** Internal player state */
interface InternalPlayer {
  playerId: string;
  playerName: string;
  chips: number;
  holeCards: Card[];
  currentBet: number;
  totalBetThisHand: number;
  folded: boolean;
  allIn: boolean;
  hasActed: boolean;
  seatIndex: number;
}

/** Internal game state per room */
interface THGameState {
  roomId: string;
  ctx: GameContext;
  players: InternalPlayer[];
  currentPhase: string;

  // Table state
  deck: Card[];
  communityCards: Card[];
  pot: number;
  sidePots: SidePot[];
  dealerIndex: number;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;

  // Betting round
  activePlayerIndex: number;
  lastRaiseAmount: number;
  bettingRoundComplete: boolean;

  // Round tracking
  lastAction: { playerId: string; playerName: string; action: ActionType; amount: number } | null;
  winners: WinnerInfo[] | null;

  // Guard against double-advance
  phaseAdvancing: boolean;
}

class TexasHoldemModule implements GameModule {
  readonly definition: GameDefinition;
  private states = new Map<string, THGameState>();

  constructor(definition: GameDefinition) {
    this.definition = definition;
  }

  setup(players: Player[], ctx: GameContext): void {
    const roomId = ctx.roomId;
    const internalPlayers: InternalPlayer[] = players.map((p, i) => ({
      playerId: p.id,
      playerName: p.name,
      chips: TH_STARTING_CHIPS,
      holeCards: [],
      currentBet: 0,
      totalBetThisHand: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      seatIndex: i,
    }));

    const state: THGameState = {
      roomId, ctx,
      players: internalPlayers,
      currentPhase: PhaseType.INSTRUCTIONS,
      deck: [],
      communityCards: [],
      pot: 0,
      sidePots: [],
      dealerIndex: Math.floor(Math.random() * players.length),
      handNumber: 0,
      smallBlind: TH_SMALL_BLIND,
      bigBlind: TH_BIG_BLIND,
      activePlayerIndex: 0,
      lastRaiseAmount: TH_BIG_BLIND,
      bettingRoundComplete: false,
      lastAction: null,
      winners: null,
      phaseAdvancing: false,
    };

    this.states.set(roomId, state);
    ctx.initScores(players.map(p => p.id));
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: 'texas-holdem',
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });
    ctx.broadcastPrivateState(pid => this.getPrivateState(roomId, pid));

    ctx.startTimer(
      PhaseType.INSTRUCTIONS,
      TH_INSTRUCTIONS_TIME_SECONDS * 1000,
      () => this.startNewHand(roomId),
    );
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 0, timerRemainingMs: null, timerTotalMs: null };
    const remaining = state.ctx.getTimerRemaining();
    let timerTotalMs: number | null = null;
    switch (state.currentPhase) {
      case THPhase.PREFLOP:
      case THPhase.FLOP:
      case THPhase.TURN:
      case THPhase.RIVER:
        timerTotalMs = TH_ACTION_TIME_SECONDS * 1000; break;
      case THPhase.SHOWDOWN:
        timerTotalMs = TH_SHOWDOWN_TIME_SECONDS * 1000; break;
      case THPhase.SCORES:
        timerTotalMs = TH_SCORES_TIME_SECONDS * 1000; break;
      case PhaseType.INSTRUCTIONS:
        timerTotalMs = TH_INSTRUCTIONS_TIME_SECONDS * 1000; break;
    }
    return {
      phaseType: state.currentPhase,
      roundNumber: state.handNumber,
      totalRounds: 0, // Poker doesn't have fixed rounds
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
      currentBet: p.currentBet,
      totalBetThisHand: p.totalBetThisHand,
      folded: p.folded,
      allIn: p.allIn,
      hasActed: p.hasActed,
      isDealer: state.players[state.dealerIndex]?.playerId === p.playerId,
      isSmallBlind: state.players[this.getSmallBlindIndex(state)]?.playerId === p.playerId,
      isBigBlind: state.players[this.getBigBlindIndex(state)]?.playerId === p.playerId,
      connected: true,
    }));

    const activePlayer = this.getActivePlayer(state);
    const pub: THPublicState = {
      gameId: 'texas_holdem',
      communityCards: state.communityCards,
      pot: state.pot,
      sidePots: state.sidePots,
      seats,
      activePlayerId: activePlayer?.playerId ?? null,
      dealerIndex: state.dealerIndex,
      handNumber: state.handNumber,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      minRaise: state.lastRaiseAmount,
      lastAction: state.lastAction,
      winners: state.winners,
    };
    return pub as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return {};

    const isActive = this.getActivePlayer(state)?.playerId === playerId;
    const priv: THPrivateState = {
      gameId: 'texas_holdem',
      holeCards: player.holeCards,
      chips: player.chips,
      currentBet: player.currentBet,
      isActive,
      folded: player.folded,
      allIn: player.allIn,
      availableActions: isActive ? this.getAvailableActions(state, player) : [],
      handResult: state.currentPhase === THPhase.SHOWDOWN && !player.folded
        ? evaluateBestHand(player.holeCards, state.communityCards)
        : null,
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

    if (inputType === InputType.VOTE || inputType === InputType.CONFIRM) {
      return this.handleAction(state, playerId, payload);
    }
    return { accepted: false, reason: 'Invalid input type' };
  }

  teardown(roomId: string): void {
    const state = this.states.get(roomId);
    if (state) {
      state.ctx.stopTimer();
      state.ctx.clearScores();
    }
    this.states.delete(roomId);
  }

  // ===== Private Methods =====

  private getSmallBlindIndex(state: THGameState): number {
    if (state.players.length === 2) return state.dealerIndex; // Heads-up: dealer is SB
    return (state.dealerIndex + 1) % state.players.length;
  }

  private getBigBlindIndex(state: THGameState): number {
    if (state.players.length === 2) return (state.dealerIndex + 1) % state.players.length;
    return (state.dealerIndex + 2) % state.players.length;
  }

  private getActivePlayers(state: THGameState): InternalPlayer[] {
    return state.players.filter(p => !p.folded && p.chips > 0 || p.allIn);
  }

  private getActiveNonAllIn(state: THGameState): InternalPlayer[] {
    return state.players.filter(p => !p.folded && !p.allIn && p.chips > 0);
  }

  private getActivePlayer(state: THGameState): InternalPlayer | null {
    const bettingPhases = [THPhase.PREFLOP, THPhase.FLOP, THPhase.TURN, THPhase.RIVER];
    if (!bettingPhases.includes(state.currentPhase as any)) return null;
    const p = state.players[state.activePlayerIndex];
    if (!p || p.folded || p.allIn) return null;
    return p;
  }

  private getNextActiveIndex(state: THGameState, fromIndex: number): number {
    const n = state.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (fromIndex + i) % n;
      const p = state.players[idx];
      if (!p.folded && !p.allIn && p.chips > 0) return idx;
    }
    return fromIndex; // No one else (shouldn't happen normally)
  }

  private getAvailableActions(state: THGameState, player: InternalPlayer): AvailableAction[] {
    const actions: AvailableAction[] = [];
    const maxBet = Math.max(...state.players.map(p => p.currentBet));
    const toCall = maxBet - player.currentBet;

    // Fold is always available
    actions.push({ action: 'fold' });

    if (toCall === 0) {
      // Can check
      actions.push({ action: 'check' });
    } else {
      // Must call or fold
      if (player.chips >= toCall) {
        actions.push({ action: 'call', minAmount: toCall, maxAmount: toCall });
      }
    }

    // Raise (if player has enough chips)
    const minRaise = maxBet + state.lastRaiseAmount;
    const raiseAmount = minRaise - player.currentBet;
    if (player.chips > toCall && raiseAmount <= player.chips) {
      actions.push({
        action: 'raise',
        minAmount: minRaise,
        maxAmount: player.currentBet + player.chips,
      });
    }

    // All-in is always available if they have chips
    if (player.chips > 0) {
      actions.push({
        action: 'all-in',
        minAmount: player.currentBet + player.chips,
        maxAmount: player.currentBet + player.chips,
      });
    }

    return actions;
  }

  private handleAction(
    state: THGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const activePlayer = this.getActivePlayer(state);
    if (!activePlayer || activePlayer.playerId !== playerId) {
      return { accepted: false, reason: 'Not your turn' };
    }

    const action = String(payload.action ?? '') as ActionType;
    const amount = Number(payload.amount ?? 0);

    switch (action) {
      case 'fold':
        activePlayer.folded = true;
        break;
      case 'check': {
        const maxBet = Math.max(...state.players.map(p => p.currentBet));
        if (activePlayer.currentBet < maxBet) {
          return { accepted: false, reason: 'Cannot check, must call or fold' };
        }
        break;
      }
      case 'call': {
        const maxBet = Math.max(...state.players.map(p => p.currentBet));
        const toCall = Math.min(maxBet - activePlayer.currentBet, activePlayer.chips);
        activePlayer.chips -= toCall;
        activePlayer.currentBet += toCall;
        activePlayer.totalBetThisHand += toCall;
        state.pot += toCall;
        if (activePlayer.chips === 0) activePlayer.allIn = true;
        break;
      }
      case 'raise': {
        if (amount < state.lastRaiseAmount + Math.max(...state.players.map(p => p.currentBet))) {
          // Allow it if it's an all-in for less
          if (amount !== activePlayer.currentBet + activePlayer.chips) {
            return { accepted: false, reason: 'Raise too small' };
          }
        }
        const raiseBy = amount - activePlayer.currentBet;
        if (raiseBy > activePlayer.chips) {
          return { accepted: false, reason: 'Not enough chips' };
        }
        state.lastRaiseAmount = amount - Math.max(...state.players.map(p => p.currentBet));
        activePlayer.chips -= raiseBy;
        state.pot += raiseBy;
        activePlayer.currentBet = amount;
        activePlayer.totalBetThisHand += raiseBy;
        if (activePlayer.chips === 0) activePlayer.allIn = true;
        // Reset hasActed for other active players (they need to respond to raise)
        for (const p of state.players) {
          if (p.playerId !== playerId && !p.folded && !p.allIn) {
            p.hasActed = false;
          }
        }
        break;
      }
      case 'all-in': {
        const allInAmount = activePlayer.chips;
        const newBet = activePlayer.currentBet + allInAmount;
        const maxBet = Math.max(...state.players.map(p => p.currentBet));
        if (newBet > maxBet) {
          // This is a raise
          state.lastRaiseAmount = Math.max(state.lastRaiseAmount, newBet - maxBet);
          for (const p of state.players) {
            if (p.playerId !== playerId && !p.folded && !p.allIn) {
              p.hasActed = false;
            }
          }
        }
        activePlayer.currentBet = newBet;
        activePlayer.totalBetThisHand += allInAmount;
        state.pot += allInAmount;
        activePlayer.chips = 0;
        activePlayer.allIn = true;
        break;
      }
      default:
        return { accepted: false, reason: 'Unknown action' };
    }

    activePlayer.hasActed = true;
    state.lastAction = {
      playerId, playerName: activePlayer.playerName, action, amount: activePlayer.currentBet,
    };

    state.ctx.log.info('Player action', { playerId, action, amount, phase: state.currentPhase });

    // Check win by last-man-standing
    const remaining = state.players.filter(p => !p.folded);
    if (remaining.length === 1) {
      this.awardPotToWinner(state, remaining[0]);
      this.broadcastAll(state);
      this.showScoresAfterDelay(state);
      return { accepted: true };
    }

    // Advance to next player or next phase
    this.advanceBetting(state);
    return { accepted: true };
  }

  private advanceBetting(state: THGameState): void {
    const activePlayers = this.getActiveNonAllIn(state);

    // If 0 or 1 non-all-in players left, skip to showdown
    if (activePlayers.length <= 1) {
      const allActed = activePlayers.every(p => p.hasActed);
      if (allActed || activePlayers.length === 0) {
        this.dealRemainingAndShowdown(state);
        return;
      }
    }

    // Check if betting round is complete (all active players have acted and bets are equal)
    const maxBet = Math.max(...state.players.filter(p => !p.folded).map(p => p.currentBet));
    const allActed = activePlayers.every(p => p.hasActed && p.currentBet === maxBet);

    if (allActed) {
      this.advancePhase(state);
      return;
    }

    // Move to next active player
    state.activePlayerIndex = this.getNextActiveIndex(state, state.activePlayerIndex);
    this.broadcastAll(state);

    // Restart action timer
    state.ctx.stopTimer();
    state.ctx.startTimer(
      state.currentPhase,
      TH_ACTION_TIME_SECONDS * 1000,
      () => this.handleTimeout(state),
    );
  }

  private advancePhase(state: THGameState): void {
    if (state.phaseAdvancing) return;
    state.phaseAdvancing = true;

    state.ctx.stopTimer();

    // Reset betting round state
    for (const p of state.players) {
      p.currentBet = 0;
      p.hasActed = false;
    }
    state.lastRaiseAmount = state.bigBlind;

    switch (state.currentPhase) {
      case THPhase.PREFLOP:
        state.currentPhase = THPhase.FLOP;
        state.communityCards.push(...deal(state.deck, 3));
        break;
      case THPhase.FLOP:
        state.currentPhase = THPhase.TURN;
        state.communityCards.push(...deal(state.deck, 1));
        break;
      case THPhase.TURN:
        state.currentPhase = THPhase.RIVER;
        state.communityCards.push(...deal(state.deck, 1));
        break;
      case THPhase.RIVER:
        state.phaseAdvancing = false;
        this.showdown(state);
        return;
    }

    // Post-flop: action starts left of dealer
    state.activePlayerIndex = this.getNextActiveIndex(state, state.dealerIndex);

    state.phaseAdvancing = false;
    this.broadcastAll(state);

    // Check if only all-in players remain
    const activeNonAllIn = this.getActiveNonAllIn(state);
    if (activeNonAllIn.length <= 1) {
      if (activeNonAllIn.length === 1) {
        // One player can still act
        state.ctx.startTimer(state.currentPhase, TH_ACTION_TIME_SECONDS * 1000, () => this.handleTimeout(state));
      } else {
        // All remaining are all-in — run out remaining cards
        this.dealRemainingAndShowdown(state);
      }
      return;
    }

    state.ctx.startTimer(state.currentPhase, TH_ACTION_TIME_SECONDS * 1000, () => this.handleTimeout(state));
  }

  private dealRemainingAndShowdown(state: THGameState): void {
    // Deal remaining community cards
    while (state.communityCards.length < 5) {
      state.communityCards.push(...deal(state.deck, 1));
    }
    this.showdown(state);
  }

  private showdown(state: THGameState): void {
    state.ctx.stopTimer();
    state.currentPhase = THPhase.SHOWDOWN;

    const activePlayers = state.players.filter(p => !p.folded);

    // Calculate side pots
    const pots = this.calculateSidePots(state);

    // Evaluate hands
    const hands = activePlayers.map(p => ({
      player: p,
      result: evaluateBestHand(p.holeCards, state.communityCards),
    }));

    const winners: WinnerInfo[] = [];

    for (const pot of pots) {
      const eligible = hands.filter(h => pot.eligiblePlayerIds.includes(h.player.playerId));
      eligible.sort((a, b) => compareHands(b.result, a.result));

      // Find all players tied for best hand
      const bestHand = eligible[0];
      const tiedWinners = eligible.filter(h => compareHands(h.result, bestHand.result) === 0);

      const share = Math.floor(pot.amount / tiedWinners.length);
      for (const w of tiedWinners) {
        w.player.chips += share;
        const existing = winners.find(wi => wi.playerId === w.player.playerId);
        if (existing) {
          existing.amount += share;
        } else {
          winners.push({
            playerId: w.player.playerId,
            playerName: w.player.playerName,
            amount: share,
            handLabel: w.result.label,
            cards: w.result.bestCards,
          });
        }
      }
    }

    state.winners = winners;

    // Update scores (chips = score)
    for (const p of state.players) {
      const currentScore = state.ctx.getScore(p.playerId);
      const diff = p.chips - currentScore;
      if (diff > 0) state.ctx.addPoints(p.playerId, diff);
    }

    this.broadcastAll(state);

    state.ctx.startTimer(THPhase.SHOWDOWN, TH_SHOWDOWN_TIME_SECONDS * 1000, () => {
      this.showScoresAfterDelay(state);
    });
  }

  private calculateSidePots(state: THGameState): SidePot[] {
    const activePlayers = state.players.filter(p => !p.folded);

    // Get unique bet levels from all-in players
    const betLevels = [...new Set(
      activePlayers.filter(p => p.allIn).map(p => p.totalBetThisHand)
    )].sort((a, b) => a - b);

    // If no all-ins, single pot
    if (betLevels.length === 0) {
      return [{ amount: state.pot, eligiblePlayerIds: activePlayers.map(p => p.playerId) }];
    }

    const pots: SidePot[] = [];
    let previousLevel = 0;

    for (const level of betLevels) {
      const eligible = activePlayers.filter(p => p.totalBetThisHand >= level);
      const contribution = (level - previousLevel) * state.players.filter(p => p.totalBetThisHand >= level).length;
      if (contribution > 0) {
        pots.push({ amount: contribution, eligiblePlayerIds: eligible.map(p => p.playerId) });
      }
      previousLevel = level;
    }

    // Main pot for remaining bets above highest all-in
    const maxAllIn = betLevels[betLevels.length - 1];
    const remainingPlayers = activePlayers.filter(p => p.totalBetThisHand > maxAllIn);
    if (remainingPlayers.length > 0) {
      const remaining = state.pot - pots.reduce((s, p) => s + p.amount, 0);
      if (remaining > 0) {
        pots.push({ amount: remaining, eligiblePlayerIds: remainingPlayers.map(p => p.playerId) });
      }
    }

    // If pots don't account for full pot, put remainder in main pot
    const totalPots = pots.reduce((s, p) => s + p.amount, 0);
    if (totalPots < state.pot) {
      if (pots.length > 0) {
        pots[pots.length - 1].amount += (state.pot - totalPots);
      } else {
        pots.push({ amount: state.pot, eligiblePlayerIds: activePlayers.map(p => p.playerId) });
      }
    }

    return pots;
  }

  private awardPotToWinner(state: THGameState, winner: InternalPlayer): void {
    state.currentPhase = THPhase.SHOWDOWN;
    winner.chips += state.pot;
    state.winners = [{
      playerId: winner.playerId,
      playerName: winner.playerName,
      amount: state.pot,
      handLabel: 'Last player standing',
      cards: [],
    }];
    state.pot = 0;

    // Update scores
    for (const p of state.players) {
      const currentScore = state.ctx.getScore(p.playerId);
      const diff = p.chips - currentScore;
      if (diff > 0) state.ctx.addPoints(p.playerId, diff);
    }
  }

  private showScoresAfterDelay(state: THGameState): void {
    state.ctx.stopTimer();
    state.currentPhase = THPhase.SCORES;
    state.ctx.broadcastScores();
    this.broadcastAll(state);

    // Check if game is over (only 1 player with chips)
    const playersWithChips = state.players.filter(p => p.chips > 0);
    const nextAction = playersWithChips.length <= 1
      ? () => this.endGame(state)
      : () => this.startNewHand(state.roomId);

    state.ctx.startTimer(THPhase.SCORES, TH_SCORES_TIME_SECONDS * 1000, nextAction);
  }

  private startNewHand(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.handNumber++;
    state.currentPhase = THPhase.PREFLOP;
    state.communityCards = [];
    state.pot = 0;
    state.sidePots = [];
    state.winners = null;
    state.lastAction = null;
    state.phaseAdvancing = false;

    // Escalate blinds
    if (state.handNumber > 1 && (state.handNumber - 1) % TH_BLIND_ESCALATION_HANDS === 0) {
      state.smallBlind *= 2;
      state.bigBlind *= 2;
    }

    // Move dealer button
    state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
    // Skip eliminated players for dealer
    while (state.players[state.dealerIndex].chips <= 0) {
      state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
    }

    // Reset player hand state
    for (const p of state.players) {
      p.holeCards = [];
      p.currentBet = 0;
      p.totalBetThisHand = 0;
      p.folded = p.chips <= 0; // Eliminated players are auto-folded
      p.allIn = false;
      p.hasActed = false;
    }

    // Shuffle and deal
    state.deck = freshDeck();
    for (const p of state.players) {
      if (!p.folded) {
        p.holeCards = deal(state.deck, 2);
      }
    }

    // Post blinds
    const sbIndex = this.getSmallBlindIndex(state);
    const bbIndex = this.getBigBlindIndex(state);
    const sbPlayer = state.players[sbIndex];
    const bbPlayer = state.players[bbIndex];

    const sbAmount = Math.min(state.smallBlind, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    sbPlayer.totalBetThisHand = sbAmount;
    state.pot += sbAmount;
    if (sbPlayer.chips === 0) sbPlayer.allIn = true;

    const bbAmount = Math.min(state.bigBlind, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    bbPlayer.totalBetThisHand = bbAmount;
    state.pot += bbAmount;
    if (bbPlayer.chips === 0) bbPlayer.allIn = true;

    state.lastRaiseAmount = state.bigBlind;

    // First to act: left of BB (preflop)
    state.activePlayerIndex = this.getNextActiveIndex(state, bbIndex);

    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));
    state.ctx.broadcastPrivateState(pid => this.getPrivateState(roomId, pid));

    // If only all-in players, run to showdown
    const activeNonAllIn = this.getActiveNonAllIn(state);
    if (activeNonAllIn.length <= 1) {
      if (activeNonAllIn.length === 0) {
        this.dealRemainingAndShowdown(state);
        return;
      }
    }

    state.ctx.startTimer(THPhase.PREFLOP, TH_ACTION_TIME_SECONDS * 1000, () => this.handleTimeout(state));
    state.ctx.log.info('New hand started', { hand: state.handNumber, dealer: state.dealerIndex });
  }

  private handleTimeout(state: THGameState): void {
    const active = this.getActivePlayer(state);
    if (!active) return;

    // Auto-check if possible, otherwise fold
    const maxBet = Math.max(...state.players.map(p => p.currentBet));
    if (active.currentBet >= maxBet) {
      // Check
      active.hasActed = true;
      state.lastAction = { playerId: active.playerId, playerName: active.playerName, action: 'check', amount: 0 };
    } else {
      // Fold
      active.folded = true;
      active.hasActed = true;
      state.lastAction = { playerId: active.playerId, playerName: active.playerName, action: 'fold', amount: 0 };
    }

    state.ctx.log.info('Player timed out', { playerId: active.playerId, action: state.lastAction.action });

    // Check last man standing
    const remaining = state.players.filter(p => !p.folded);
    if (remaining.length === 1) {
      this.awardPotToWinner(state, remaining[0]);
      this.broadcastAll(state);
      this.showScoresAfterDelay(state);
      return;
    }

    this.advanceBetting(state);
  }

  private endGame(state: THGameState): void {
    state.ctx.stopTimer();
    state.currentPhase = PhaseType.GAME_OVER;

    const scores = state.ctx.getScores();
    const winner = scores[0];

    state.ctx.broadcastGameOver({
      winnerId: winner?.playerId ?? null,
      winnerName: winner?.playerName ?? null,
      winnerTeam: null,
      finalScores: scores,
      gameId: 'texas-holdem',
    });

    state.ctx.setRoomStatus(RoomStatus.GAME_ENDED);
    state.ctx.log.info('Game ended', { winnerId: winner?.playerId });
  }

  private broadcastAll(state: THGameState): void {
    state.ctx.broadcastPhase(this.getPhaseState(state.roomId), this.getPublicState(state.roomId));
    state.ctx.broadcastPrivateState(pid => this.getPrivateState(state.roomId, pid));
  }
}

export function createModule(definition: GameDefinition): GameModule {
  return new TexasHoldemModule(definition);
}
