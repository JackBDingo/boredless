/**
 * bluffalo-v2.test.ts — Integration tests for Bluffalo V2 declarative migration.
 *
 * Tests the full game lifecycle through DeclarativeGameModule + extension actions:
 *   instructions → submit → voting → reveal → scores → (loop) → game_over
 *
 * Validates:
 *   - Extension actions fire on correct phase entries
 *   - Prompt drawing works (content system)
 *   - Answer building shuffles fakes + correct answer
 *   - Scoring awards correct points (1000 correct, 500 per fool)
 *   - Reveal data structure is built correctly
 *   - Victory detection triggers game end
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGamePackage } from '../../../server/src/runtime/schema-engine/index.js';
import type { ExtensionActionContext, ExtensionActionHandler } from '../../../server/src/runtime/interpreter/index.js';
import { DeclarativeGameModule } from '../../../server/src/runtime/interpreter/index.js';
import type { TimerImpl } from '../../../server/src/runtime/phase-machine/index.js';
import type { Player, GameDefinition } from '@boredless/shared';
import { RoomStatus, ServerMessageType } from '@boredless/shared';

import {
  isBluffaloAction,
  handleDrawPrompt,
  handleBuildAnswers,
  handleScoreRound,
  handleBuildReveal,
  resetPromptCache,
  type BluffaloActionContext,
} from '../extensions/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GAME_DIR = join(__dirname, '..');
const GAME_YAML = join(GAME_DIR, 'game.yaml');

/** Controllable timer for testing */
class TestTimerImpl implements TimerImpl {
  private callbacks = new Map<string, () => void>();

  start(roomId: string, _phaseType: string, _durationMs: number, _sessionIds: string[], onExpire: () => void): void {
    this.callbacks.set(roomId, onExpire);
  }

  stop(roomId: string): void {
    this.callbacks.delete(roomId);
  }

  getRemaining(_roomId: string): number | null {
    return null;
  }

  trigger(roomId: string): void {
    const cb = this.callbacks.get(roomId);
    if (cb) {
      this.callbacks.delete(roomId);
      cb();
    }
  }

  hasPending(roomId: string): boolean {
    return this.callbacks.has(roomId);
  }
}

/** Mock GameContext */
function createMockCtx(roomId: string) {
  const scores = new Map<string, number>();
  const sentMessages: Array<{ to: string | null; msg: unknown }> = [];
  const broadcastPhaseCalls: Array<{ phase: unknown; publicState: unknown }> = [];

  return {
    roomId,
    scores,
    sentMessages,
    broadcastPhaseCalls,

    ctx: {
      roomId,
      initScores: (playerIds: string[]) => {
        for (const id of playerIds) scores.set(id, 0);
      },
      addPoints: (playerId: string, points: number) => {
        scores.set(playerId, (scores.get(playerId) ?? 0) + points);
      },
      getScore: (playerId: string) => scores.get(playerId) ?? 0,
      getScores: () => {
        const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
        return entries.map(([playerId, score]) => ({
          playerId,
          playerName: playerId,
          score,
        }));
      },
      clearScores: () => scores.clear(),
      setRoomStatus: vi.fn(),
      broadcastPhase: vi.fn((phase: unknown, publicState: unknown) => {
        broadcastPhaseCalls.push({ phase, publicState });
      }),
      broadcastPrivateState: vi.fn(),
      broadcastScores: vi.fn(),
      broadcastGameOver: vi.fn(),
      sendToAll: vi.fn((msg: unknown) => {
        sentMessages.push({ to: null, msg });
      }),
      sendToPlayer: vi.fn((playerId: string, msg: unknown) => {
        sentMessages.push({ to: playerId, msg });
      }),
      startTimer: vi.fn(),
      stopTimer: vi.fn(),
      getTimerRemaining: vi.fn(() => null),
      getAllSessionIds: vi.fn(() => ['p1', 'p2', 'p3']),
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as any,
  };
}

/** Create the Bluffalo extension handler */
function createBluffaloHandler(): ExtensionActionHandler {
  return (actionName: string, ctx: ExtensionActionContext): boolean => {
    if (!isBluffaloAction(actionName)) return false;

    const bCtx: BluffaloActionContext = {
      globals: ctx.globals,
      players: ctx.players,
      playerInfo: ctx.playerInfo,
      getScore: ctx.getScore,
      setGlobal: ctx.setGlobal,
      addPoints: ctx.addPoints,
      log: (msg: string, data?: unknown) => ctx.log(msg, data as Record<string, unknown>),
    };

    switch (actionName) {
      case 'bluffalo_draw_prompt': handleDrawPrompt(bCtx, GAME_DIR); return true;
      case 'bluffalo_build_answers': handleBuildAnswers(bCtx); return true;
      case 'bluffalo_score_round': handleScoreRound(bCtx); return true;
      case 'bluffalo_build_reveal': handleBuildReveal(bCtx); return true;
      default: return false;
    }
  };
}

const players: Player[] = [
  { id: 'p1', name: 'Alice', isHost: true },
  { id: 'p2', name: 'Bob', isHost: false },
  { id: 'p3', name: 'Charlie', isHost: false },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bluffalo V2 — full game integration', () => {
  let pkg: ReturnType<typeof loadGamePackage>;
  let timer: TestTimerImpl;

  beforeEach(() => {
    resetPromptCache();
    pkg = loadGamePackage(GAME_YAML);
    timer = new TestTimerImpl();
  });

  it('loads the V2 game package', () => {
    expect(pkg.manifest.id).toBe('bluff-battle');
    expect(pkg.manifest.name).toBe('Bluffalo');
    expect(pkg.manifest.players.min).toBe(3);
    expect(pkg.manifest.players.max).toBe(8);
  });

  it('has correct phases defined', () => {
    const phaseIds = Object.keys(pkg.phases);
    expect(phaseIds).toEqual([
      'instructions', 'submit', 'voting', 'reveal', 'scores', 'game_over',
    ]);
  });

  it('starts in instructions phase', () => {
    const handler = createBluffaloHandler();
    const definition: GameDefinition = {
      id: 'bluff-battle',
      name: 'Bluffalo',
      description: 'Test',
      minPlayers: 3,
      maxPlayers: 8,
      estimatedMinutes: 15,
      icon: 'swords',
    };
    const module = new DeclarativeGameModule(definition, pkg, timer, handler);
    const { ctx } = createMockCtx('room1');

    module.setup(players, ctx);
    expect(module.getPhaseState('room1').phaseType).toBe('instructions');
  });

  it('advances from instructions to submit, drawing a prompt', () => {
    const handler = createBluffaloHandler();
    const definition: GameDefinition = {
      id: 'bluff-battle', name: 'Bluffalo', description: 'Test',
      minPlayers: 3, maxPlayers: 8, estimatedMinutes: 15, icon: 'swords',
    };
    const module = new DeclarativeGameModule(definition, pkg, timer, handler);
    const { ctx } = createMockCtx('room1');

    module.setup(players, ctx);
    timer.trigger('room1'); // instructions → submit

    expect(module.getPhaseState('room1').phaseType).toBe('submit');

    // Extension should have drawn a prompt
    const publicState = module.getPublicState('room1');
    const globals = publicState.globals as Record<string, unknown>;
    expect(globals.round).toBe(1);
    expect(globals.current_question).toBeTruthy();
    expect(typeof globals.current_question).toBe('string');
  });

  it('collects submissions and advances to voting', () => {
    const handler = createBluffaloHandler();
    const definition: GameDefinition = {
      id: 'bluff-battle', name: 'Bluffalo', description: 'Test',
      minPlayers: 3, maxPlayers: 8, estimatedMinutes: 15, icon: 'swords',
    };
    const module = new DeclarativeGameModule(definition, pkg, timer, handler);
    const { ctx } = createMockCtx('room1');

    module.setup(players, ctx);
    timer.trigger('room1'); // → submit

    // All players submit fake answers
    module.handleInput('room1', 'p1', 'text_submit', { value: 'Fake answer 1' });
    module.handleInput('room1', 'p2', 'text_submit', { value: 'Fake answer 2' });
    module.handleInput('room1', 'p3', 'text_submit', { value: 'Fake answer 3' });

    // Should advance to voting
    expect(module.getPhaseState('room1').phaseType).toBe('voting');

    // Answers should be built (fakes + correct, shuffled)
    const globals = module.getPublicState('room1').globals as Record<string, unknown>;
    const answersJson = globals.answers_json;
    expect(answersJson).toBeTruthy();

    const parsed = JSON.parse(answersJson as string) as { answers: Array<{ answerId: string; text: string; isCorrect: boolean }> };
    expect(parsed.answers.length).toBe(4); // 3 fakes + 1 correct
    expect(parsed.answers.filter(a => a.isCorrect).length).toBe(1);
  });

  it('runs a full round: submit → vote → reveal → scores', () => {
    const handler = createBluffaloHandler();
    const definition: GameDefinition = {
      id: 'bluff-battle', name: 'Bluffalo', description: 'Test',
      minPlayers: 3, maxPlayers: 8, estimatedMinutes: 15, icon: 'swords',
    };
    const module = new DeclarativeGameModule(definition, pkg, timer, handler);
    const mock = createMockCtx('room1');

    module.setup(players, mock.ctx);
    timer.trigger('room1'); // → submit

    // Submit fake answers
    module.handleInput('room1', 'p1', 'text_submit', { value: 'My fake 1' });
    module.handleInput('room1', 'p2', 'text_submit', { value: 'My fake 2' });
    module.handleInput('room1', 'p3', 'text_submit', { value: 'My fake 3' });
    expect(module.getPhaseState('room1').phaseType).toBe('voting');

    // Get answers and find the correct one
    const globals = module.getPublicState('room1').globals as Record<string, unknown>;
    const parsed = JSON.parse(globals.answers_json as string) as {
      answers: Array<{ answerId: string; isCorrect: boolean; submittedByPlayerId: string | null }>;
    };
    const correctAnswer = parsed.answers.find(a => a.isCorrect)!;
    const fakeAnswers = parsed.answers.filter(a => !a.isCorrect);

    // p1 votes for correct answer (1000 pts)
    module.handleInput('room1', 'p1', 'vote', { value: correctAnswer.answerId });
    // p2 votes for p3's fake (p3 gets 500 pts)
    const p3Fake = fakeAnswers.find(a => a.submittedByPlayerId === 'p3')!;
    module.handleInput('room1', 'p2', 'vote', { value: p3Fake.answerId });
    // p3 votes for correct answer (1000 pts)
    module.handleInput('room1', 'p3', 'vote', { value: correctAnswer.answerId });

    expect(module.getPhaseState('room1').phaseType).toBe('reveal');

    // Scores should have been calculated
    expect(mock.scores.get('p1')).toBe(1000); // voted correct
    expect(mock.scores.get('p3')).toBeGreaterThanOrEqual(500); // fooled p2 + maybe voted correct

    // Reveal data should exist
    const revealGlobals = module.getPublicState('room1').globals as Record<string, unknown>;
    expect(revealGlobals.reveal_json).toBeTruthy();

    // Advance through reveal → scores
    timer.trigger('room1'); // reveal → scores
    expect(module.getPhaseState('room1').phaseType).toBe('scores');
  });

  it('loops for multiple rounds then ends game', () => {
    const handler = createBluffaloHandler();
    const definition: GameDefinition = {
      id: 'bluff-battle', name: 'Bluffalo', description: 'Test',
      minPlayers: 3, maxPlayers: 8, estimatedMinutes: 15, icon: 'swords',
    };

    // Patch game package to use 2 rounds for faster test
    const patchedPkg = { ...pkg, state_model: { ...pkg.state_model } };
    // We'll set total_rounds to 2 via state after setup

    const module = new DeclarativeGameModule(definition, pkg, timer, handler);
    const mock = createMockCtx('room1');

    module.setup(players, mock.ctx);

    // Helper: play a full round
    function playRound() {
      // Submit
      module.handleInput('room1', 'p1', 'text_submit', { value: `fake-${Math.random()}` });
      module.handleInput('room1', 'p2', 'text_submit', { value: `fake-${Math.random()}` });
      module.handleInput('room1', 'p3', 'text_submit', { value: `fake-${Math.random()}` });

      // Vote — everyone votes for first available answer
      const globals = module.getPublicState('room1').globals as Record<string, unknown>;
      const parsed = JSON.parse(globals.answers_json as string) as {
        answers: Array<{ answerId: string; submittedByPlayerId: string | null }>;
      };

      for (const player of ['p1', 'p2', 'p3']) {
        const validAnswer = parsed.answers.find(a => a.submittedByPlayerId !== player);
        if (validAnswer) {
          module.handleInput('room1', player, 'vote', { value: validAnswer.answerId });
        }
      }

      // Advance reveal → scores
      timer.trigger('room1');
    }

    // Round 1
    timer.trigger('room1'); // instructions → submit
    playRound();
    expect(module.getPhaseState('room1').phaseType).toBe('scores');

    // scores → submit (round 2, since round 1 < total_rounds 3)
    timer.trigger('room1');
    expect(module.getPhaseState('room1').phaseType).toBe('submit');

    // Round 2
    playRound();
    timer.trigger('room1'); // scores → submit (round 2 < 3)
    expect(module.getPhaseState('room1').phaseType).toBe('submit');

    // Round 3
    playRound();
    timer.trigger('room1'); // scores → game_over (round 3 >= 3)
    expect(module.getPhaseState('room1').phaseType).toBe('game_over');
  });
});
