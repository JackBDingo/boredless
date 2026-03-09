import type { GameModule } from '../game-module.js';
import type {
  Player,
  PhaseState,
  GameDefinition,
  BBPublicState,
  BBPrivateState,
  BBRevealData,
  BBRevealAnswer,
} from '@boredless/shared';
import {
  GameId,
  PhaseType,
  InputType,
  ServerMessageType,
  RoomStatus,
  BB_ROUNDS_DEFAULT,
  BB_SUBMIT_TIME_SECONDS,
  BB_VOTE_TIME_SECONDS,
  BB_REVEAL_TIME_SECONDS,
  BB_SCORES_TIME_SECONDS,
  BB_INSTRUCTIONS_TIME_SECONDS,
  GAME_CATALOG,
} from '@boredless/shared';
import { roomManager } from '../../engine/room-manager.js';
import { timerEngine } from '../../engine/timer-engine.js';
import { scoreEngine } from '../../engine/score-engine.js';
import { sendToSession, sendToSessions } from '../../ws/send.js';
import { generateId } from '../../utils/id.js';
import { logger } from '../../utils/logger.js';
import { getRandomPrompts } from './prompts.js';
import { calculateBBScores, type BBAnswer, type BBVote } from './scoring.js';

/** Internal game state (stored in roomManager.gameStates) */
interface BBGameState {
  roomId: string;
  players: Player[];
  totalRounds: number;
  currentRound: number;
  currentPhase: PhaseType;
  usedPromptIds: number[];

  // Current round state
  currentPrompt: { id: number; question: string; correctAnswer: string } | null;
  submissions: Map<string, string>;      // playerId → fake answer text
  answers: BBAnswer[];                   // Shuffled answers (fakes + correct)
  votes: BBVote[];                       // Player votes
  revealData: BBRevealData | null;
}

function getAllSessionIds(roomId: string): string[] {
  const room = roomManager.getRoom(roomId);
  if (!room) return [];
  const ids = room.players
    .filter(p => p.status !== 'removed')
    .map(p => p.sessionId);
  if (room.displaySessionId) ids.push(room.displaySessionId);
  return ids;
}

class BluffBattleModule implements GameModule {
  readonly definition: GameDefinition = GAME_CATALOG.find(g => g.id === GameId.BLUFF_BATTLE)!;

  private states = new Map<string, BBGameState>();

  setup(roomId: string, players: Player[]): void {
    const state: BBGameState = {
      roomId,
      players: [...players],
      totalRounds: BB_ROUNDS_DEFAULT,
      currentRound: 0,
      currentPhase: PhaseType.INSTRUCTIONS,
      usedPromptIds: [],
      currentPrompt: null,
      submissions: new Map(),
      answers: [],
      votes: [],
      revealData: null,
    };

    this.states.set(roomId, state);

    // Initialize scores
    scoreEngine.init(roomId, players.map(p => p.id));

    // Update room status
    roomManager.setRoomStatus(roomId, RoomStatus.IN_GAME);

    // Broadcast game started
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.GAME_STARTED,
      gameId: GameId.BLUFF_BATTLE,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send private state to each player
    for (const player of players) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start instructions timer
    timerEngine.start(
      roomId,
      PhaseType.INSTRUCTIONS,
      BB_INSTRUCTIONS_TIME_SECONDS * 1000,
      sessionIds,
      () => this.startRound(roomId),
    );
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) {
      return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 0, timerRemainingMs: null, timerTotalMs: null };
    }
    const remaining = timerEngine.getRemaining(roomId);
    let timerTotalMs: number | null = null;
    switch (state.currentPhase) {
      case PhaseType.BB_SUBMIT: timerTotalMs = BB_SUBMIT_TIME_SECONDS * 1000; break;
      case PhaseType.BB_VOTING: timerTotalMs = BB_VOTE_TIME_SECONDS * 1000; break;
      case PhaseType.BB_REVEAL: timerTotalMs = BB_REVEAL_TIME_SECONDS * 1000; break;
      case PhaseType.BB_SCORES: timerTotalMs = BB_SCORES_TIME_SECONDS * 1000; break;
      case PhaseType.INSTRUCTIONS: timerTotalMs = BB_INSTRUCTIONS_TIME_SECONDS * 1000; break;
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

    const publicState: BBPublicState = {
      gameId: 'bluff_battle',
      currentPrompt: state.currentPrompt?.question ?? null,
      roundNumber: state.currentRound,
      totalRounds: state.totalRounds,
      answers: state.currentPhase === PhaseType.BB_VOTING
        ? state.answers.map(a => ({ answerId: a.answerId, text: a.text }))
        : state.currentPhase === PhaseType.BB_REVEAL && state.revealData
        ? state.revealData.answers.map(a => ({
            answerId: a.answerId,
            text: a.text,
            isCorrect: a.isCorrect,
            submittedBy: a.submittedByPlayerId ?? undefined,
          }))
        : [],
      submittedCount: state.submissions.size,
      totalPlayers: state.players.length,
      votedCount: state.votes.length,
      revealData: state.revealData,
    };

    return publicState as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const privateState: BBPrivateState = {
      gameId: 'bluff_battle',
      prompt: state.currentPhase === PhaseType.BB_SUBMIT ? state.currentPrompt?.question ?? null : null,
      hasSubmitted: state.submissions.has(playerId),
      hasVoted: state.votes.some(v => v.voterId === playerId),
      ownAnswer: state.submissions.get(playerId) ?? null,
      voteOptions: state.currentPhase === PhaseType.BB_VOTING
        ? state.answers
            .filter(a => a.submittedByPlayerId !== playerId) // Can't vote for own answer
            .map(a => ({ answerId: a.answerId, text: a.text }))
        : null,
    };

    return privateState as unknown as Record<string, unknown>;
  }

  handleInput(
    roomId: string,
    playerId: string,
    inputType: InputType,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const state = this.states.get(roomId);
    if (!state) return { accepted: false, reason: 'Game not found' };

    switch (inputType) {
      case InputType.TEXT:
        return this.handleSubmission(state, playerId, payload);
      case InputType.VOTE:
        return this.handleVote(state, playerId, payload);
      default:
        return { accepted: false, reason: 'Invalid input type for current phase' };
    }
  }

  teardown(roomId: string): void {
    timerEngine.stop(roomId);
    scoreEngine.clear(roomId);
    this.states.delete(roomId);
  }

  // === Private methods ===

  private handleSubmission(
    state: BBGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== PhaseType.BB_SUBMIT) {
      return { accepted: false, reason: 'Not in submission phase' };
    }
    if (state.submissions.has(playerId)) {
      return { accepted: false, reason: 'Already submitted' };
    }

    const answer = String(payload.answer ?? '').trim();
    if (!answer) return { accepted: false, reason: 'Empty answer' };

    state.submissions.set(playerId, answer);

    // Broadcast updated submission count
    this.broadcastState(state.roomId);

    // Check if all players submitted
    if (state.submissions.size >= state.players.length) {
      timerEngine.stop(state.roomId);
      this.startVoting(state.roomId);
    }

    return { accepted: true };
  }

  private handleVote(
    state: BBGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== PhaseType.BB_VOTING) {
      return { accepted: false, reason: 'Not in voting phase' };
    }
    if (state.votes.some(v => v.voterId === playerId)) {
      return { accepted: false, reason: 'Already voted' };
    }

    const answerId = String(payload.answerId ?? '');
    const answer = state.answers.find(a => a.answerId === answerId);
    if (!answer) return { accepted: false, reason: 'Invalid answer' };

    // Cannot vote for own answer
    if (answer.submittedByPlayerId === playerId) {
      return { accepted: false, reason: 'Cannot vote for own answer' };
    }

    state.votes.push({ voterId: playerId, answerId });

    // Broadcast updated vote count
    this.broadcastState(state.roomId);

    // Send updated private state to the voter
    const voter = state.players.find(p => p.id === playerId);
    if (voter) {
      sendToSession(voter.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(state.roomId, playerId),
      });
    }

    // Check if all players voted
    if (state.votes.length >= state.players.length) {
      timerEngine.stop(state.roomId);
      this.startReveal(state.roomId);
    }

    return { accepted: true };
  }

  private startRound(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.currentRound++;
    state.currentPhase = PhaseType.BB_SUBMIT;
    state.submissions = new Map();
    state.answers = [];
    state.votes = [];
    state.revealData = null;

    // Pick a prompt
    const [prompt] = getRandomPrompts(1, state.usedPromptIds);
    state.currentPrompt = prompt;
    state.usedPromptIds.push(prompt.id);

    // Broadcast phase change
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send private state (prompt) to each player
    for (const player of state.players) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start submission timer
    timerEngine.start(
      roomId,
      PhaseType.BB_SUBMIT,
      BB_SUBMIT_TIME_SECONDS * 1000,
      sessionIds,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== PhaseType.BB_SUBMIT) return;
        this.startVoting(roomId);
      },
    );

    logger.info('Round started', { roomId, round: state.currentRound });
  }

  private startVoting(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state || !state.currentPrompt) return;
    if (state.currentPhase !== PhaseType.BB_SUBMIT) return; // Guard against double-call

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.BB_VOTING;

    // Build answer list: all fake submissions + the correct answer
    const answers: BBAnswer[] = [];

    // Add player submissions
    for (const [playerId, text] of state.submissions) {
      answers.push({
        answerId: generateId(),
        text,
        submittedByPlayerId: playerId,
        isCorrect: false,
      });
    }

    // Add correct answer
    answers.push({
      answerId: generateId(),
      text: state.currentPrompt.correctAnswer,
      submittedByPlayerId: null,
      isCorrect: true,
    });

    // Shuffle
    state.answers = answers.sort(() => Math.random() - 0.5);

    // Broadcast phase change
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send private state (vote options) to each player
    for (const player of state.players) {
      sendToSession(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start voting timer
    timerEngine.start(
      roomId,
      PhaseType.BB_VOTING,
      BB_VOTE_TIME_SECONDS * 1000,
      sessionIds,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== PhaseType.BB_VOTING) return;
        this.startReveal(roomId);
      },
    );
  }

  private startReveal(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;
    if (state.currentPhase !== PhaseType.BB_VOTING) return; // Guard against double-call

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.BB_REVEAL;

    // Calculate scores
    const result = calculateBBScores(state.answers, state.votes);

    // Apply scores
    const roundScores = new Map<string, number>();
    for (const [playerId, points] of result.roundPoints) {
      scoreEngine.addPoints(roomId, playerId, points);
      roundScores.set(playerId, points);
    }

    // Build reveal data
    const revealAnswers: BBRevealAnswer[] = state.answers.map(answer => {
      const answerResult = result.answerResults.find(r => r.answerId === answer.answerId)!;
      const submitterPlayer = answer.submittedByPlayerId
        ? state.players.find(p => p.id === answer.submittedByPlayerId)
        : null;
      return {
        answerId: answer.answerId,
        text: answer.text,
        isCorrect: answer.isCorrect,
        submittedByPlayerId: answer.submittedByPlayerId,
        submittedByPlayerName: submitterPlayer?.name ?? null,
        voterPlayerIds: answerResult.voterIds,
        voterPlayerNames: answerResult.voterIds.map(id => {
          const p = state.players.find(pl => pl.id === id);
          return p?.name ?? 'Unknown';
        }),
      };
    });

    state.revealData = {
      correctAnswerId: state.answers.find(a => a.isCorrect)!.answerId,
      answers: revealAnswers,
      roundScores: state.players.map(p => ({
        playerId: p.id,
        playerName: p.name,
        fooledCount: result.answerResults
          .filter(r => r.submittedByPlayerId === p.id)
          .reduce((sum, r) => sum + r.voterIds.length, 0),
        foundCorrect: state.votes.some(
          v => v.voterId === p.id && state.answers.find(a => a.answerId === v.answerId)?.isCorrect,
        ),
        roundPoints: roundScores.get(p.id) ?? 0,
        totalPoints: scoreEngine.getScore(roomId, p.id),
      })),
    };

    // Broadcast
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Start reveal timer → then show scores or next round
    timerEngine.start(
      roomId,
      PhaseType.BB_REVEAL,
      BB_REVEAL_TIME_SECONDS * 1000,
      sessionIds,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== PhaseType.BB_REVEAL) return;
        this.showScores(roomId);
      },
    );
  }

  private showScores(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.BB_SCORES;

    // Broadcast scores
    scoreEngine.broadcastScores(roomId);

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Check if game is over
    const nextAction = state.currentRound >= state.totalRounds
      ? () => {
          const s = this.states.get(roomId);
          if (!s || s.currentPhase !== PhaseType.BB_SCORES) return;
          this.endGame(roomId);
        }
      : () => {
          const s = this.states.get(roomId);
          if (!s || s.currentPhase !== PhaseType.BB_SCORES) return;
          this.startRound(roomId);
        };

    timerEngine.start(
      roomId,
      PhaseType.BB_SCORES,
      BB_SCORES_TIME_SECONDS * 1000,
      sessionIds,
      nextAction,
    );
  }

  private endGame(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    timerEngine.stop(roomId);
    state.currentPhase = PhaseType.GAME_OVER;

    const scores = scoreEngine.getScores(roomId);
    const winner = scores[0]; // Highest score

    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.GAME_OVER,
      result: {
        winnerId: winner?.playerId ?? null,
        winnerName: winner?.playerName ?? null,
        winnerTeam: null,
        finalScores: scores,
        gameId: GameId.BLUFF_BATTLE,
      },
    });

    roomManager.setRoomStatus(roomId, RoomStatus.GAME_ENDED);
    logger.info('Game ended', { roomId, winnerId: winner?.playerId });
  }

  private broadcastState(roomId: string): void {
    const sessionIds = getAllSessionIds(roomId);
    sendToSessions(sessionIds, {
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });
  }
}

export const bluffBattleModule = new BluffBattleModule();
