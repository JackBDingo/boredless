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
import {
  CAH_ROUNDS_DEFAULT,
  CAH_HAND_SIZE,
  CAH_DEAL_TIME_SECONDS,
  CAH_PROMPT_TIME_SECONDS,
  CAH_READING_TIME_SECONDS,
  CAH_REVEAL_TIME_SECONDS,
  CAH_SCORES_TIME_SECONDS,
} from '../constants.js';
import { CAHPhase } from '../phases.js';
import { nanoid } from 'nanoid';
import { DeckManager } from './deck.js';
import { calculateCAHScores } from './scoring.js';
import type {
  CAHWhiteCard,
  CAHBlackCard,
  CAHSubmission,
  CAHPublicState,
  CAHPrivateState,
  CAHAnonymousSubmission,
  CAHRevealedSubmission,
  CAHWinner,
} from '../types.js';

/** Internal game state per room */
interface CAHGameState {
  roomId: string;
  ctx: GameContext;
  players: Player[];
  totalRounds: number;
  currentRound: number;
  currentPhase: string;

  deck: DeckManager;
  hands: Map<string, CAHWhiteCard[]>;           // playerId → hand
  czarIndex: number;                             // index into players array
  currentBlackCard: CAHBlackCard | null;
  submissions: Map<string, CAHSubmission>;        // playerId → submission
  shuffledSubmissions: CAHSubmission[];           // anonymized order
  selectedWinnerSubmissionId: string | null;
}

class CAHModule implements GameModule {
  readonly definition: GameDefinition;

  private states = new Map<string, CAHGameState>();

  constructor(definition: GameDefinition) {
    this.definition = definition;
  }

  setup(players: Player[], ctx: GameContext): void {
    const roomId = ctx.roomId;

    const state: CAHGameState = {
      roomId,
      ctx,
      players: [...players],
      totalRounds: CAH_ROUNDS_DEFAULT,
      currentRound: 0,
      currentPhase: CAHPhase.DEAL,
      deck: new DeckManager(),
      hands: new Map(),
      czarIndex: Math.floor(Math.random() * players.length),
      currentBlackCard: null,
      submissions: new Map(),
      shuffledSubmissions: [],
      selectedWinnerSubmissionId: null,
    };

    this.states.set(roomId, state);

    ctx.initScores(players.map(p => p.id));
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    // Deal initial hands
    for (const player of state.players) {
      const hand = state.deck.drawWhite(CAH_HAND_SIZE);
      state.hands.set(player.id, hand);
    }

    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: 'cards-against',
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    ctx.broadcastPrivateState(playerId => this.getPrivateState(roomId, playerId));

    // Deal phase is instant — jump straight to prompt
    ctx.startTimer(
      CAHPhase.DEAL,
      CAH_DEAL_TIME_SECONDS * 1000,
      () => this.startPrompt(roomId),
    );
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) {
      return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 0, timerRemainingMs: null, timerTotalMs: null };
    }
    const remaining = state.ctx.getTimerRemaining();
    let timerTotalMs: number | null = null;
    switch (state.currentPhase) {
      case CAHPhase.DEAL:    timerTotalMs = CAH_DEAL_TIME_SECONDS * 1000; break;
      case CAHPhase.PROMPT:  timerTotalMs = CAH_PROMPT_TIME_SECONDS * 1000; break;
      case CAHPhase.READING: timerTotalMs = CAH_READING_TIME_SECONDS * 1000; break;
      case CAHPhase.REVEAL:  timerTotalMs = CAH_REVEAL_TIME_SECONDS * 1000; break;
      case CAHPhase.SCORES:  timerTotalMs = CAH_SCORES_TIME_SECONDS * 1000; break;
    }
    return {
      phaseType: state.currentPhase,
      roundNumber: state.currentRound,
      totalRounds: state.totalRounds,
      timerRemainingMs: remaining,
      timerTotalMs,
    };
  }

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const czar = state.players[state.czarIndex];
    const nonCzarCount = state.players.length - 1;

    // Submissions visible during READING/REVEAL
    let submissions: CAHAnonymousSubmission[] = [];
    if (
      state.currentPhase === CAHPhase.READING ||
      state.currentPhase === CAHPhase.REVEAL
    ) {
      submissions = state.shuffledSubmissions.map(s => ({
        submissionId: s.submissionId,
        cards: s.cards.map(c => ({ text: c.text })),
      }));
    }

    // Winner (REVEAL phase only)
    let winner: CAHWinner | null = null;
    if (
      state.currentPhase === CAHPhase.REVEAL &&
      state.selectedWinnerSubmissionId
    ) {
      const winSub = state.shuffledSubmissions.find(
        s => s.submissionId === state.selectedWinnerSubmissionId,
      );
      if (winSub) {
        const winPlayer = state.players.find(p => p.id === winSub.playerId);
        winner = {
          submissionId: winSub.submissionId,
          playerId: winSub.playerId,
          playerName: winPlayer?.name ?? 'Unknown',
          cards: winSub.cards.map(c => ({ text: c.text })),
        };
      }
    }

    const publicState: CAHPublicState = {
      gameId: 'cards_against',
      currentBlackCard: state.currentBlackCard,
      czarPlayerId: czar?.id ?? null,
      czarPlayerName: czar?.name ?? null,
      roundNumber: state.currentRound,
      totalRounds: state.totalRounds,
      submittedCount: state.submissions.size,
      totalNonCzarPlayers: nonCzarCount,
      submissions,
      winner,
    };

    return publicState as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const czar = state.players[state.czarIndex];
    const isCzar = czar?.id === playerId;
    const hand = state.hands.get(playerId) ?? [];
    const submission = state.submissions.get(playerId);
    const hasSubmitted = !!submission;
    const selectedCardIds = submission
      ? submission.cards.map(c => c.id)
      : [];

    // During READING: czar gets submissions to judge; non-czar gets read-only list
    let submissionsToJudge: CAHAnonymousSubmission[] | null = null;
    let allSubmissions: CAHAnonymousSubmission[] | null = null;
    if (state.currentPhase === CAHPhase.READING) {
      const anon: CAHAnonymousSubmission[] = state.shuffledSubmissions.map(s => ({
        submissionId: s.submissionId,
        cards: s.cards.map(c => ({ text: c.text })),
      }));
      if (isCzar) {
        submissionsToJudge = anon;
      } else {
        allSubmissions = anon;
      }
    }

    // During REVEAL: everyone sees who played what
    let revealedSubmissions: CAHRevealedSubmission[] | null = null;
    if (state.currentPhase === CAHPhase.REVEAL) {
      revealedSubmissions = state.shuffledSubmissions.map(s => {
        const player = state.players.find(p => p.id === s.playerId);
        return {
          submissionId: s.submissionId,
          playerId: s.playerId,
          playerName: player?.name ?? 'Unknown',
          cards: s.cards.map(c => ({ text: c.text })),
          isWinner: s.submissionId === state.selectedWinnerSubmissionId,
        };
      });
    }

    const privateState: CAHPrivateState = {
      gameId: 'cards_against',
      isCzar,
      hand,
      selectedCardIds,
      hasSubmitted,
      submissionsToJudge,
      allSubmissions,
      revealedSubmissions,
    };

    return privateState as unknown as Record<string, unknown>;
  }

  handleInput(
    roomId: string,
    playerId: string,
    inputType: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const state = this.states.get(roomId);
    if (!state) return { accepted: false, reason: 'Game not found' };

    if (inputType === InputType.VOTE) {
      if (state.currentPhase === CAHPhase.PROMPT) {
        return this.handleCardSubmission(state, playerId, payload);
      } else if (state.currentPhase === CAHPhase.READING) {
        return this.handleCzarPick(state, playerId, payload);
      }
    }

    return { accepted: false, reason: 'Invalid input type or phase' };
  }

  teardown(roomId: string): void {
    const state = this.states.get(roomId);
    if (state) {
      state.ctx.stopTimer();
      state.ctx.clearScores();
    }
    this.states.delete(roomId);
  }

  // === Private methods ===

  private handleCardSubmission(
    state: CAHGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    // Czar cannot submit
    const czar = state.players[state.czarIndex];
    if (czar?.id === playerId) {
      return { accepted: false, reason: 'Card Czar cannot submit cards' };
    }
    if (state.submissions.has(playerId)) {
      return { accepted: false, reason: 'Already submitted' };
    }

    const pick = state.currentBlackCard?.pick ?? 1;
    const answerIds = payload.answerId as string[];
    if (!Array.isArray(answerIds) || answerIds.length !== pick) {
      return { accepted: false, reason: `Must select exactly ${pick} card(s)` };
    }

    const hand = state.hands.get(playerId) ?? [];
    const selectedCards: CAHWhiteCard[] = [];
    for (const cardId of answerIds) {
      const card = hand.find(c => c.id === cardId);
      if (!card) return { accepted: false, reason: 'Card not in hand' };
      selectedCards.push(card);
    }

    // Remove played cards from hand
    const newHand = hand.filter(c => !answerIds.includes(c.id));
    state.hands.set(playerId, newHand);

    const submission: CAHSubmission = {
      submissionId: nanoid(),
      playerId,
      cards: selectedCards,
    };
    state.submissions.set(playerId, submission);

    // Notify submitter of their updated private state
    state.ctx.sendToPlayer(playerId, {
      type: ServerMessageType.PRIVATE_STATE,
      state: this.getPrivateState(state.roomId, playerId),
    });

    // Broadcast updated submission count
    this.broadcastState(state.roomId);

    // Check if all non-czar players have submitted
    const nonCzarPlayers = state.players.filter(p => p.id !== czar?.id);
    if (state.submissions.size >= nonCzarPlayers.length) {
      state.ctx.stopTimer();
      this.startReading(state.roomId);
    }

    return { accepted: true };
  }

  private handleCzarPick(
    state: CAHGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const czar = state.players[state.czarIndex];
    if (czar?.id !== playerId) {
      return { accepted: false, reason: 'Only the Card Czar can pick the winner' };
    }

    const submissionId = String(payload.answerId ?? '');
    const winner = state.shuffledSubmissions.find(s => s.submissionId === submissionId);
    if (!winner) return { accepted: false, reason: 'Invalid submission' };

    state.selectedWinnerSubmissionId = submissionId;
    state.ctx.stopTimer();
    this.startReveal(state.roomId);

    return { accepted: true };
  }

  private startPrompt(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.currentRound++;
    state.currentPhase = CAHPhase.PROMPT;
    state.submissions = new Map();
    state.shuffledSubmissions = [];
    state.selectedWinnerSubmissionId = null;

    // Draw a black card
    state.currentBlackCard = state.deck.drawBlack();

    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));
    state.ctx.broadcastPrivateState(playerId => this.getPrivateState(roomId, playerId));

    state.ctx.startTimer(
      CAHPhase.PROMPT,
      CAH_PROMPT_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== CAHPhase.PROMPT) return;
        // Time's up — start reading even if not all submitted
        this.startReading(roomId);
      },
    );

    state.ctx.log.info('CAH round started', { round: state.currentRound });
  }

  private startReading(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;
    if (state.currentPhase !== CAHPhase.PROMPT) return; // Guard double-call

    state.ctx.stopTimer();
    state.currentPhase = CAHPhase.READING;

    // Shuffle submissions for anonymity
    const subs = Array.from(state.submissions.values());
    state.shuffledSubmissions = subs.sort(() => Math.random() - 0.5);

    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));
    state.ctx.broadcastPrivateState(playerId => this.getPrivateState(roomId, playerId));

    state.ctx.startTimer(
      CAHPhase.READING,
      CAH_READING_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== CAHPhase.READING) return;
        // Time expired — pick first submission as winner if czar didn't choose
        if (s.shuffledSubmissions.length > 0) {
          s.selectedWinnerSubmissionId = s.shuffledSubmissions[0].submissionId;
        }
        this.startReveal(roomId);
      },
    );
  }

  private startReveal(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;
    if (state.currentPhase !== CAHPhase.READING) return; // Guard double-call

    state.ctx.stopTimer();
    state.currentPhase = CAHPhase.REVEAL;

    // Award points to winner
    const winSub = state.shuffledSubmissions.find(
      s => s.submissionId === state.selectedWinnerSubmissionId,
    );
    if (winSub) {
      const result = calculateCAHScores(winSub.playerId);
      for (const [pid, pts] of result.roundPoints) {
        state.ctx.addPoints(pid, pts);
      }
    }

    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));
    state.ctx.broadcastPrivateState(playerId => this.getPrivateState(roomId, playerId));

    state.ctx.startTimer(
      CAHPhase.REVEAL,
      CAH_REVEAL_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== CAHPhase.REVEAL) return;
        this.showScores(roomId);
      },
    );
  }

  private showScores(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.ctx.stopTimer();
    state.currentPhase = CAHPhase.SCORES;

    state.ctx.broadcastScores();
    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));

    const isLastRound = state.currentRound >= state.totalRounds;
    const nextAction = isLastRound
      ? () => {
          const s = this.states.get(roomId);
          if (!s || s.currentPhase !== CAHPhase.SCORES) return;
          this.endGame(roomId);
        }
      : () => {
          const s = this.states.get(roomId);
          if (!s || s.currentPhase !== CAHPhase.SCORES) return;
          this.nextRound(roomId);
        };

    state.ctx.startTimer(CAHPhase.SCORES, CAH_SCORES_TIME_SECONDS * 1000, nextAction);
  }

  private nextRound(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    // Rotate czar
    state.czarIndex = (state.czarIndex + 1) % state.players.length;

    // Replenish hands — each player draws back up to CAH_HAND_SIZE
    for (const player of state.players) {
      const hand = state.hands.get(player.id) ?? [];
      const needed = CAH_HAND_SIZE - hand.length;
      if (needed > 0) {
        const drawn = state.deck.drawWhite(needed);
        state.hands.set(player.id, [...hand, ...drawn]);
      }
    }

    // Discard played cards from last round
    for (const sub of state.shuffledSubmissions) {
      state.deck.discardWhite(sub.cards);
    }

    // Transition through DEAL briefly then PROMPT
    state.currentPhase = CAHPhase.DEAL;
    state.currentBlackCard = null;
    state.submissions = new Map();
    state.shuffledSubmissions = [];
    state.selectedWinnerSubmissionId = null;

    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));
    state.ctx.broadcastPrivateState(playerId => this.getPrivateState(roomId, playerId));

    state.ctx.startTimer(
      CAHPhase.DEAL,
      CAH_DEAL_TIME_SECONDS * 1000,
      () => this.startPrompt(roomId),
    );
  }

  private endGame(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.ctx.stopTimer();
    state.currentPhase = PhaseType.GAME_OVER;

    const scores = state.ctx.getScores();
    const winner = scores[0];

    state.ctx.broadcastGameOver({
      winnerId: winner?.playerId ?? null,
      winnerName: winner?.playerName ?? null,
      winnerTeam: null,
      finalScores: scores,
      gameId: 'cards-against',
    });

    state.ctx.setRoomStatus(RoomStatus.GAME_ENDED);
    state.ctx.log.info('CAH game ended', { winnerId: winner?.playerId });
  }

  private broadcastState(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;
    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));
  }
}

export function createModule(definition: GameDefinition): GameModule {
  return new CAHModule(definition);
}
