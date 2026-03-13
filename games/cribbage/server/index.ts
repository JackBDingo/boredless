// ============================================================
// CRIBBAGE — Server Game Module
// ============================================================

import type { GameModule } from '@game-platform/game-module.js';
import type { GameContext } from '@game-platform/game-context.js';
import type { Player, PhaseState, GameDefinition } from '@boredless/shared';
import { PhaseType, InputType, ServerMessageType, RoomStatus } from '@boredless/shared';
import { CRPhase } from '../phases.js';
import {
  CR_WIN_SCORE,
  CR_PEGGING_TARGET,
  CR_HAND_SIZE,
  CR_DISCARD_COUNT,
  CR_DISCARD_TIME_SECONDS,
  CR_CUT_TIME_SECONDS,
  CR_PEGGING_TIME_SECONDS,
  CR_SCORING_TIME_SECONDS,
  CR_CRIB_TIME_SECONDS,
  CR_RESULTS_TIME_SECONDS,
  CR_SCORES_TIME_SECONDS,
  CR_DEALING_TIME_SECONDS,
  RANK_VALUES,
} from '../constants.js';
import type {
  Card,
  HandScore,
  PlayedCard,
  CRPublicState,
  CRPrivateState,
} from '../types.js';
import { freshDeck, dealCards } from './deck.js';
import { scoreHand, scorePegging } from './scoring.js';

// ─── Internal types ───────────────────────────────────────────────────────────

interface InternalPlayer {
  playerId: string;
  playerName: string;
  dealtHand: Card[];     // Original dealt hand (kept for scoring)
  hand: Card[];          // Cards still in hand (not yet played in pegging)
  cribCards: Card[];     // Cards discarded to crib
  scoringHand: Card[];   // 4-card hand used for show scoring (dealtHand minus crib)
  selectedForDiscard: string[]; // Card IDs selected (mirrored for phone UI)
  hasSaidGo: boolean;    // Said "go" in current pegging series
}

interface CRGameState {
  roomId: string;
  ctx: GameContext;
  players: InternalPlayer[];
  currentPhase: string;
  round: number;

  deck: Card[];
  dealerIndex: number;
  starterCard: Card | null;

  // Pegging
  pegCount: number;
  playedSequence: PlayedCard[];   // Cards played in current series (toward 31)
  allPlayedCards: PlayedCard[];   // All played cards across all series this hand
  activePlayerIndex: number;
  goPlayers: string[];            // Players who said go in current series

  lastPegPoints: { playerId: string; playerName: string; points: number; reason: string } | null;

  crib: Card[];
  handScores: HandScore[];
  cribScore: HandScore | null;

  winner: { playerId: string; playerName: string } | null;
  phaseAdvancing: boolean;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function cardValue(card: Card): number {
  return RANK_VALUES[card.rank] ?? 0;
}

// ─── Module ───────────────────────────────────────────────────────────────────

class CribbageModule implements GameModule {
  readonly definition: GameDefinition;
  private states = new Map<string, CRGameState>();

  constructor(definition: GameDefinition) {
    this.definition = definition;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  setup(players: Player[], ctx: GameContext): void {
    const roomId = ctx.roomId;

    const internalPlayers: InternalPlayer[] = players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      dealtHand: [],
      hand: [],
      cribCards: [],
      scoringHand: [],
      selectedForDiscard: [],
      hasSaidGo: false,
    }));

    const state: CRGameState = {
      roomId, ctx,
      players: internalPlayers,
      currentPhase: CRPhase.DEALING,
      round: 0,
      deck: [],
      dealerIndex: Math.floor(Math.random() * players.length),
      starterCard: null,
      pegCount: 0,
      playedSequence: [],
      allPlayedCards: [],
      activePlayerIndex: 0,
      goPlayers: [],
      lastPegPoints: null,
      crib: [],
      handScores: [],
      cribScore: null,
      winner: null,
      phaseAdvancing: false,
    };

    this.states.set(roomId, state);
    ctx.initScores(players.map(p => p.id));
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: 'cribbage',
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });
    ctx.broadcastPrivateState(pid => this.getPrivateState(roomId, pid));

    ctx.startTimer(CRPhase.DEALING, CR_DEALING_TIME_SECONDS * 1000, () => {
      this.dealNewRound(roomId);
    });
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 0, timerRemainingMs: null, timerTotalMs: null };
    const remaining = state.ctx.getTimerRemaining();
    const timerTotalMs = this.phaseDurationMs(state.currentPhase);
    return {
      phaseType: state.currentPhase,
      roundNumber: state.round,
      totalRounds: 0,
      timerRemainingMs: remaining,
      timerTotalMs,
    };
  }

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const scores: Record<string, number> = {};
    for (const p of state.players) {
      scores[p.playerId] = state.ctx.getScore(p.playerId);
    }

    const pub: CRPublicState = {
      gameId: 'cribbage',
      round: state.round,
      dealerIndex: state.dealerIndex,
      dealerName: state.players[state.dealerIndex]?.playerName ?? '',
      starterCard: state.starterCard,
      playedCards: state.playedSequence,
      allPlayedCards: state.allPlayedCards,
      pegCount: state.pegCount,
      activePlayerId: this.getActivePlayer(state)?.playerId ?? null,
      playerOrder: state.players.map(p => p.playerId),
      playerNames: Object.fromEntries(state.players.map(p => [p.playerId, p.playerName])),
      playerHandSizes: Object.fromEntries(state.players.map(p => [p.playerId, p.hand.length])),
      discardsDone: Object.fromEntries(state.players.map(p => [p.playerId, p.cribCards.length > 0])),
      lastPegPoints: state.lastPegPoints,
      handScores: state.handScores,
      cribScore: state.cribScore,
      scores,
      winner: state.winner,
      goPlayers: state.goPlayers,
    };
    return pub as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return {};

    const isMyTurn = this.getActivePlayer(state)?.playerId === playerId
      && state.currentPhase === CRPhase.PEGGING;

    const playableCardIds = player.hand
      .filter(c => cardValue(c) + state.pegCount <= CR_PEGGING_TARGET)
      .map(c => c.id);

    const canPlay = playableCardIds.length > 0;

    const handScore = (state.currentPhase === CRPhase.SCORING || state.currentPhase === CRPhase.CRIB || state.currentPhase === CRPhase.RESULTS)
      ? state.handScores.find(h => h.playerId === playerId) ?? null
      : null;

    const priv: CRPrivateState = {
      gameId: 'cribbage',
      hand: player.hand,
      cribCards: player.cribCards,
      selectedForDiscard: player.selectedForDiscard,
      isMyTurn,
      canPlay,
      playableCardIds,
      phase: state.currentPhase,
      handScore,
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

    if (inputType !== InputType.VOTE) return { accepted: false, reason: 'Invalid input type' };

    const action = String(payload.action ?? '');

    switch (action) {
      case 'discard':
        return this.handleDiscard(state, playerId, payload);
      case 'play_card':
        return this.handlePlayCard(state, playerId, payload);
      case 'go':
        return this.handleGo(state, playerId);
      default:
        return { accepted: false, reason: `Unknown action: ${action}` };
    }
  }

  teardown(roomId: string): void {
    const state = this.states.get(roomId);
    if (state) {
      state.ctx.stopTimer();
      state.ctx.clearScores();
    }
    this.states.delete(roomId);
  }

  // ── Phase transitions ──────────────────────────────────────────────────────

  private dealNewRound(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.round++;
    state.currentPhase = CRPhase.DISCARD;
    state.deck = freshDeck();
    state.starterCard = null;
    state.pegCount = 0;
    state.playedSequence = [];
    state.allPlayedCards = [];
    state.goPlayers = [];
    state.lastPegPoints = null;
    state.crib = [];
    state.handScores = [];
    state.cribScore = null;
    state.winner = null;
    state.phaseAdvancing = false;

    const n = state.players.length;
    const handSize = CR_HAND_SIZE[n] ?? 5;

    for (const p of state.players) {
      const dealt = dealCards(state.deck, handSize);
      p.dealtHand = [...dealt];
      p.hand = [...dealt];
      p.cribCards = [];
      p.scoringHand = [];
      p.selectedForDiscard = [];
      p.hasSaidGo = false;
    }

    this.broadcastAll(state);

    state.ctx.startTimer(CRPhase.DISCARD, CR_DISCARD_TIME_SECONDS * 1000, () => {
      this.autoDiscard(state);
    });

    state.ctx.log.info('New round dealt', { round: state.round, dealer: state.dealerIndex });
  }

  private autoDiscard(state: CRGameState): void {
    const n = state.players.length;
    const discardCount = CR_DISCARD_COUNT[n] ?? 1;
    for (const p of state.players) {
      if (p.cribCards.length < discardCount) {
        const needed = discardCount - p.cribCards.length;
        const toDiscard = p.hand.slice(0, needed);
        for (const c of toDiscard) {
          p.cribCards.push(c);
          p.hand = p.hand.filter(h => h.id !== c.id);
        }
      }
      // Finalize scoring hand
      p.scoringHand = [...p.hand];
    }
    this.startCutPhase(state);
  }

  private startCutPhase(state: CRGameState): void {
    // Collect crib cards
    state.crib = state.players.flatMap(p => p.cribCards);

    // Lock in scoring hands before pegging (hand = what remains after discards)
    for (const p of state.players) {
      if (p.scoringHand.length === 0) {
        p.scoringHand = [...p.hand];
      }
    }

    // Cut deck for starter card
    state.currentPhase = CRPhase.CUT;
    const cutIndex = Math.floor(Math.random() * (state.deck.length - 1)) + 1;
    state.starterCard = state.deck.splice(cutIndex, 1)[0] ?? state.deck[0]!;

    // His Heels: starter is a Jack → dealer gets 2 pts
    if (state.starterCard.rank === 'J') {
      const dealer = state.players[state.dealerIndex];
      if (dealer) {
        state.ctx.addPoints(dealer.playerId, 2);
        state.lastPegPoints = {
          playerId: dealer.playerId,
          playerName: dealer.playerName,
          points: 2,
          reason: "His Heels! (Jack cut as starter)",
        };
        if (this.checkWin(state, dealer.playerId)) return;
      }
    }

    this.broadcastAll(state);
    state.ctx.startTimer(CRPhase.CUT, CR_CUT_TIME_SECONDS * 1000, () => {
      this.startPeggingPhase(state);
    });
  }

  private startPeggingPhase(state: CRGameState): void {
    state.currentPhase = CRPhase.PEGGING;
    state.pegCount = 0;
    state.playedSequence = [];
    state.goPlayers = [];
    state.lastPegPoints = null;

    for (const p of state.players) {
      p.hasSaidGo = false;
    }

    // First to act is left of dealer
    state.activePlayerIndex = (state.dealerIndex + 1) % state.players.length;

    this.broadcastAll(state);
    this.startPeggingTimer(state);
  }

  private startPeggingTimer(state: CRGameState): void {
    state.ctx.stopTimer();
    state.ctx.startTimer(CRPhase.PEGGING, CR_PEGGING_TIME_SECONDS * 1000, () => {
      this.handlePeggingTimeout(state);
    });
  }

  private handlePeggingTimeout(state: CRGameState): void {
    const active = this.getActivePlayer(state);
    if (!active) return;

    const playable = active.hand.filter(c => cardValue(c) + state.pegCount <= CR_PEGGING_TARGET);
    if (playable.length > 0) {
      this.playCard(state, active, playable[0]!);
    } else {
      this.processGo(state, active);
    }
  }

  private handleDiscard(
    state: CRGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== CRPhase.DISCARD) {
      return { accepted: false, reason: 'Not in discard phase' };
    }

    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return { accepted: false, reason: 'Player not found' };

    const n = state.players.length;
    const discardCount = CR_DISCARD_COUNT[n] ?? 1;

    if (player.cribCards.length >= discardCount) {
      return { accepted: false, reason: 'Already discarded' };
    }

    const rawIds = payload.cardIds;
    if (!Array.isArray(rawIds)) {
      return { accepted: false, reason: 'cardIds must be an array' };
    }
    const cardIds = rawIds.map(String);
    if (cardIds.length !== discardCount) {
      return { accepted: false, reason: `Must discard exactly ${discardCount} card(s)` };
    }

    const toDiscard: Card[] = [];
    for (const id of cardIds) {
      const card = player.hand.find(c => c.id === id);
      if (!card) return { accepted: false, reason: `Card ${id} not in hand` };
      toDiscard.push(card);
    }

    for (const card of toDiscard) {
      player.hand = player.hand.filter(c => c.id !== card.id);
      player.cribCards.push(card);
    }
    player.selectedForDiscard = [];
    // Lock scoring hand now
    player.scoringHand = [...player.hand];

    state.ctx.log.info('Player discarded', { playerId, count: discardCount });
    this.broadcastAll(state);

    const allDiscarded = state.players.every(p => p.cribCards.length >= discardCount);
    if (allDiscarded) {
      state.ctx.stopTimer();
      this.startCutPhase(state);
    }

    return { accepted: true };
  }

  private handlePlayCard(
    state: CRGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== CRPhase.PEGGING) {
      return { accepted: false, reason: 'Not in pegging phase' };
    }

    const active = this.getActivePlayer(state);
    if (!active || active.playerId !== playerId) {
      return { accepted: false, reason: 'Not your turn' };
    }

    const cardId = String(payload.cardId ?? '');
    const card = active.hand.find(c => c.id === cardId);
    if (!card) return { accepted: false, reason: 'Card not in hand' };

    if (cardValue(card) + state.pegCount > CR_PEGGING_TARGET) {
      return { accepted: false, reason: 'Card would exceed 31' };
    }

    this.playCard(state, active, card);
    return { accepted: true };
  }

  private playCard(state: CRGameState, player: InternalPlayer, card: Card): void {
    player.hand = player.hand.filter(c => c.id !== card.id);

    const playedEntry: PlayedCard = { card, playerId: player.playerId, playerName: player.playerName };
    state.playedSequence.push(playedEntry);
    state.allPlayedCards.push(playedEntry);

    state.pegCount += cardValue(card);
    player.hasSaidGo = false;

    // Score pegging
    const pegItems = scorePegging(state.playedSequence.map(p => p.card), state.pegCount);
    const points = pegItems.reduce((s, i) => s + i.points, 0);

    if (points > 0) {
      state.ctx.addPoints(player.playerId, points);
      const reason = pegItems.map(i => i.label).join(', ');
      state.lastPegPoints = { playerId: player.playerId, playerName: player.playerName, points, reason };
      if (this.checkWin(state, player.playerId)) return;
    } else {
      state.lastPegPoints = null;
    }

    state.ctx.log.info('Card played', { playerId: player.playerId, card: card.id, count: state.pegCount });

    // Exactly 31
    if (state.pegCount === CR_PEGGING_TARGET) {
      this.resetPeggingSeries(state);
      return;
    }

    this.broadcastAll(state);
    this.advancePegging(state);
  }

  private handleGo(
    state: CRGameState,
    playerId: string,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== CRPhase.PEGGING) {
      return { accepted: false, reason: 'Not in pegging phase' };
    }

    const active = this.getActivePlayer(state);
    if (!active || active.playerId !== playerId) {
      return { accepted: false, reason: 'Not your turn' };
    }

    const playable = active.hand.filter(c => cardValue(c) + state.pegCount <= CR_PEGGING_TARGET);
    if (playable.length > 0) {
      return { accepted: false, reason: 'You have playable cards' };
    }

    this.processGo(state, active);
    return { accepted: true };
  }

  private processGo(state: CRGameState, player: InternalPlayer): void {
    if (!state.goPlayers.includes(player.playerId)) {
      state.goPlayers.push(player.playerId);
    }
    player.hasSaidGo = true;

    state.ctx.log.info('Go!', { playerId: player.playerId });
    this.broadcastAll(state);
    this.advancePegging(state);
  }

  private advancePegging(state: CRGameState): void {
    const n = state.players.length;

    // If no cards left anywhere, end pegging
    const anyCardsLeft = state.players.some(p => p.hand.length > 0);
    if (!anyCardsLeft) {
      const lastPlayed = state.playedSequence[state.playedSequence.length - 1];
      if (lastPlayed && state.pegCount < CR_PEGGING_TARGET) {
        state.ctx.addPoints(lastPlayed.playerId, 1);
        state.lastPegPoints = {
          playerId: lastPlayed.playerId,
          playerName: lastPlayed.playerName,
          points: 1,
          reason: 'Last card!',
        };
        if (this.checkWin(state, lastPlayed.playerId)) return;
      }
      this.broadcastAll(state);
      this.startScoringPhase(state);
      return;
    }

    // Check if all players with cards can't play (need to reset series / go)
    const playersWithCards = state.players.filter(p => p.hand.length > 0);
    const allGoOrCantPlay = playersWithCards.every(p => {
      const canPlay = p.hand.some(c => cardValue(c) + state.pegCount <= CR_PEGGING_TARGET);
      return !canPlay || p.hasSaidGo;
    });

    if (allGoOrCantPlay) {
      // Award go point to last player who played
      const lastPlayed = state.playedSequence[state.playedSequence.length - 1];
      if (lastPlayed) {
        state.ctx.addPoints(lastPlayed.playerId, 1);
        state.lastPegPoints = {
          playerId: lastPlayed.playerId,
          playerName: lastPlayed.playerName,
          points: 1,
          reason: 'Go!',
        };
        if (this.checkWin(state, lastPlayed.playerId)) return;
      }
      this.resetPeggingSeries(state);
      return;
    }

    // Move to next player who can play and hasn't said go
    let nextIndex = (state.activePlayerIndex + 1) % n;
    for (let i = 0; i < n; i++) {
      const p = state.players[nextIndex]!;
      const canPlay = p.hand.length > 0 && !p.hasSaidGo &&
        p.hand.some(c => cardValue(c) + state.pegCount <= CR_PEGGING_TARGET);
      if (canPlay) {
        state.activePlayerIndex = nextIndex;
        break;
      }
      nextIndex = (nextIndex + 1) % n;
    }

    this.broadcastAll(state);
    this.startPeggingTimer(state);
  }

  private resetPeggingSeries(state: CRGameState): void {
    state.pegCount = 0;
    state.playedSequence = [];
    state.goPlayers = [];
    for (const p of state.players) {
      p.hasSaidGo = false;
    }

    const anyCardsLeft = state.players.some(p => p.hand.length > 0);
    if (!anyCardsLeft) {
      this.startScoringPhase(state);
      return;
    }

    // Start next series from left of dealer (first player with cards)
    let startIndex = (state.dealerIndex + 1) % state.players.length;
    for (let i = 0; i < state.players.length; i++) {
      const p = state.players[startIndex]!;
      if (p.hand.length > 0) break;
      startIndex = (startIndex + 1) % state.players.length;
    }
    state.activePlayerIndex = startIndex;

    this.broadcastAll(state);
    this.startPeggingTimer(state);
  }

  private startScoringPhase(state: CRGameState): void {
    state.currentPhase = CRPhase.SCORING;
    state.ctx.stopTimer();
    state.handScores = [];

    if (!state.starterCard) {
      this.startCribPhase(state);
      return;
    }

    // Score each player's hand starting left of dealer
    const startIndex = (state.dealerIndex + 1) % state.players.length;
    for (let i = 0; i < state.players.length; i++) {
      const idx = (startIndex + i) % state.players.length;
      const p = state.players[idx]!;
      // scoringHand is the 4-card hand retained after discarding
      const hs = scoreHand(p.scoringHand, state.starterCard!, p.playerId, p.playerName, false);
      state.handScores.push(hs);
    }

    this.broadcastAll(state);

    // Award hand score points
    for (const hs of state.handScores) {
      if (hs.total > 0) {
        state.ctx.addPoints(hs.playerId, hs.total);
        if (this.checkWin(state, hs.playerId)) return;
      }
    }

    state.ctx.broadcastScores();
    state.ctx.startTimer(CRPhase.SCORING, CR_SCORING_TIME_SECONDS * 1000, () => {
      this.startCribPhase(state);
    });
  }

  private startCribPhase(state: CRGameState): void {
    state.currentPhase = CRPhase.CRIB;
    state.ctx.stopTimer();

    const dealer = state.players[state.dealerIndex];
    if (!dealer || !state.starterCard) {
      this.startResultsPhase(state);
      return;
    }

    state.cribScore = scoreHand(state.crib, state.starterCard, dealer.playerId, dealer.playerName, true);

    if (state.cribScore.total > 0) {
      state.ctx.addPoints(dealer.playerId, state.cribScore.total);
      if (this.checkWin(state, dealer.playerId)) return;
    }

    state.ctx.broadcastScores();
    this.broadcastAll(state);

    state.ctx.startTimer(CRPhase.CRIB, CR_CRIB_TIME_SECONDS * 1000, () => {
      this.startResultsPhase(state);
    });
  }

  private startResultsPhase(state: CRGameState): void {
    state.currentPhase = CRPhase.RESULTS;
    this.broadcastAll(state);

    state.ctx.startTimer(CRPhase.RESULTS, CR_RESULTS_TIME_SECONDS * 1000, () => {
      this.showScoresPhase(state);
    });
  }

  private showScoresPhase(state: CRGameState): void {
    state.currentPhase = CRPhase.SCORES;
    state.ctx.broadcastScores();
    this.broadcastAll(state);

    state.ctx.startTimer(CRPhase.SCORES, CR_SCORES_TIME_SECONDS * 1000, () => {
      state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
      state.currentPhase = CRPhase.DEALING;
      this.broadcastAll(state);
      state.ctx.startTimer(CRPhase.DEALING, CR_DEALING_TIME_SECONDS * 1000, () => {
        this.dealNewRound(state.roomId);
      });
    });
  }

  // ── Win check ──────────────────────────────────────────────────────────────

  private checkWin(state: CRGameState, playerId: string): boolean {
    const score = state.ctx.getScore(playerId);
    if (score >= CR_WIN_SCORE) {
      const player = state.players.find(p => p.playerId === playerId);
      if (!player) return false;

      state.winner = { playerId, playerName: player.playerName };
      state.ctx.log.info('Winner!', { playerId, score });

      this.broadcastAll(state);
      this.endGame(state);
      return true;
    }
    return false;
  }

  private endGame(state: CRGameState): void {
    state.ctx.stopTimer();
    state.currentPhase = PhaseType.GAME_OVER;

    const scores = state.ctx.getScores();
    const winner = scores[0];

    state.ctx.broadcastGameOver({
      winnerId: winner?.playerId ?? null,
      winnerName: winner?.playerName ?? null,
      winnerTeam: null,
      finalScores: scores,
      gameId: 'cribbage',
    });

    state.ctx.setRoomStatus(RoomStatus.GAME_ENDED);
    state.ctx.log.info('Game ended', { winnerId: winner?.playerId });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getActivePlayer(state: CRGameState): InternalPlayer | null {
    if (state.currentPhase !== CRPhase.PEGGING) return null;
    return state.players[state.activePlayerIndex] ?? null;
  }

  private phaseDurationMs(phase: string): number | null {
    switch (phase) {
      case CRPhase.DEALING:  return CR_DEALING_TIME_SECONDS * 1000;
      case CRPhase.DISCARD:  return CR_DISCARD_TIME_SECONDS * 1000;
      case CRPhase.CUT:      return CR_CUT_TIME_SECONDS * 1000;
      case CRPhase.PEGGING:  return CR_PEGGING_TIME_SECONDS * 1000;
      case CRPhase.SCORING:  return CR_SCORING_TIME_SECONDS * 1000;
      case CRPhase.CRIB:     return CR_CRIB_TIME_SECONDS * 1000;
      case CRPhase.RESULTS:  return CR_RESULTS_TIME_SECONDS * 1000;
      case CRPhase.SCORES:   return CR_SCORES_TIME_SECONDS * 1000;
      default: return null;
    }
  }

  private broadcastAll(state: CRGameState): void {
    state.ctx.broadcastPhase(this.getPhaseState(state.roomId), this.getPublicState(state.roomId));
    state.ctx.broadcastPrivateState(pid => this.getPrivateState(state.roomId, pid));
  }
}

export function createModule(definition: GameDefinition): GameModule {
  return new CribbageModule(definition);
}
