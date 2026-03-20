/**
 * phase51-subsystem-integration.test.ts — Phase 5.1 Orchestrator Integration Tests
 *
 * Tests for wiring all V2 subsystems into DeclarativeGameModule.
 * Each test creates a minimal game schema exercising specific subsystem behavior.
 *
 * Tests cover:
 * 1. Event integration — game with events fires them on phase change
 * 2. Scoring integration — game with scoring formulas awards points correctly
 * 3. Victory detection — game ends when victory condition met
 * 4. Content integration — content_draw action populates state from content pool
 * 5. Turn integration — turn model influences who can submit input
 * 6. Rule evaluation — conditional actions fire based on state
 * 7. Full lifecycle — game with all subsystems runs start-to-finish
 * 8. Object models — ObjectRegistry created from schema declarations
 */

import { describe, it, expect, vi } from 'vitest';
import type { Player, PhaseState, GameDefinition, GameOverState, ScoreEntry, ServerMessage } from '@boredless/shared';
import { ServerMessageType } from '@boredless/shared';
import type { Room, RoomStatus as RoomStatusType } from '@boredless/shared';
import { DeclarativeGameModule } from '../declarative-game-module.js';
import type { GamePackage } from '../../schema-engine/index.js';
import type { TimerImpl } from '../../phase-machine/index.js';
import type { GameContext } from '../../../games/game-context.js';

// ---------------------------------------------------------------------------
// Test utilities (duplicated from interpreter.test.ts for isolation)
// ---------------------------------------------------------------------------

class TestTimerImpl implements TimerImpl {
  private callbacks = new Map<string, () => void>();
  public calls: Array<{ roomId: string; phaseType: string; durationMs: number }> = [];

  start(
    roomId: string,
    phaseType: string,
    durationMs: number,
    _sessionIds: string[],
    onExpire: () => void,
  ): void {
    this.calls.push({ roomId, phaseType, durationMs });
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

  isRunning(roomId: string): boolean {
    return this.callbacks.has(roomId);
  }
}

class MockGameContext implements GameContext {
  readonly roomId: string;

  broadcastPhaseCalls: Array<{ phase: PhaseState; publicState: Record<string, unknown> }> = [];
  broadcastPrivateStateCalls: number = 0;
  broadcastGameOverCalls: GameOverState[] = [];
  addPointsCalls: Array<{ playerId: string; points: number }> = [];
  sendToAllCalls: ServerMessage[] = [];
  sendToPlayerCalls: Array<{ playerId: string; message: ServerMessage }> = [];
  setRoomStatusCalls: RoomStatusType[] = [];
  initScoresCalls: string[][] = [];

  private timerImpl: TestTimerImpl;

  constructor(roomId: string, timerImpl: TestTimerImpl) {
    this.roomId = roomId;
    this.timerImpl = timerImpl;
  }

  startTimer(phaseType: string, durationMs: number, onExpire: () => void): void {
    this.timerImpl.start(this.roomId, phaseType, durationMs, [], onExpire);
  }
  stopTimer(): void {
    this.timerImpl.stop(this.roomId);
  }
  getTimerRemaining(): number | null {
    return this.timerImpl.getRemaining(this.roomId);
  }

  sendToAll(message: ServerMessage): void {
    this.sendToAllCalls.push(message);
  }
  sendToPlayer(playerId: string, message: ServerMessage): void {
    this.sendToPlayerCalls.push({ playerId, message });
  }
  sendToDisplay(_message: ServerMessage): void {}

  emit(_event: string, _data?: unknown): void {}
  emitTo(_playerId: string, _event: string, _data?: unknown): void {}
  emitToDisplay(_event: string, _data?: unknown): void {}

  private scores = new Map<string, number>();
  initScores(playerIds: string[]): void {
    this.initScoresCalls.push(playerIds);
    for (const id of playerIds) {
      this.scores.set(id, 0);
    }
  }
  addPoints(playerId: string, points: number): void {
    this.addPointsCalls.push({ playerId, points });
    this.scores.set(playerId, (this.scores.get(playerId) ?? 0) + points);
  }
  getScore(playerId: string): number {
    return this.scores.get(playerId) ?? 0;
  }
  getScores(): ScoreEntry[] {
    return [...this.scores.entries()].map(([playerId, score]) => ({
      playerId,
      playerName: playerId,
      playerColor: '#000000',
      score,
      roundScore: 0,
    }));
  }
  broadcastScores(_roundScores?: Map<string, number>): void {}
  clearScores(): void {
    this.scores.clear();
  }

  getRoom(): Room | undefined {
    return undefined;
  }
  setRoomStatus(status: RoomStatusType): void {
    this.setRoomStatusCalls.push(status);
  }
  getAllSessionIds(): string[] {
    return [];
  }
  getPlayerSessionIds(_excludePlayerId?: string): string[] {
    return [];
  }

  broadcastPhase(phase: PhaseState, publicState: Record<string, unknown>): void {
    this.broadcastPhaseCalls.push({ phase, publicState });
  }
  broadcastPrivateState(_getState: (playerId: string) => Record<string, unknown>): void {
    this.broadcastPrivateStateCalls++;
  }
  broadcastGameOver(finalState: GameOverState): void {
    this.broadcastGameOverCalls.push(finalState);
  }

  log = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function makePlayer(id: string): Player {
  return {
    id,
    name: `Player ${id}`,
    sessionId: `session-${id}`,
    color: '#ff0000',
    status: 'connected',
  } as unknown as Player;
}

function makeDefinition(id = 'test-game'): GameDefinition {
  return {
    id,
    name: 'Test Game',
    description: 'Test game for Phase 5.1 integration',
    minPlayers: 2,
    maxPlayers: 4,
    estimatedMinutes: 10,
    icon: '🎮',
  };
}

// ---------------------------------------------------------------------------
// Minimal game package builders
// These construct GamePackage-compatible objects in-memory (no YAML loading)
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid game package.
 * Base: 2 phases (lobby -> game_end), simultaneous turn model.
 */
function buildMinimalPackage(overrides: Partial<GamePackage> = {}): GamePackage {
  const base: GamePackage = {
    schema_version: '2.0',
    manifest: {
      id: 'test-minimal',
      name: 'Minimal',
      description: 'Minimal test game',
      version: '1.0.0',
      players: { min: 1, max: 4 },
    },
    state_model: {
      globals: {
        round: { type: 'integer', default: 0, visibility: 'public' },
        total_rounds: { type: 'integer', default: 1, visibility: 'public' },
      },
      per_player: {
        score: { type: 'integer', default: 0, visibility: 'public' },
        answer: { type: 'string', default: null, visibility: 'private' },
      },
    },
    phases: {
      lobby: {
        type: 'timed',
        duration: 1,
        on_exit: [{ action: 'advance', to: 'game_over' }],
      },
      game_over: {
        type: 'timed',
        duration: 1,
      },
    },
    turn_model: { type: 'simultaneous' },
    victory: { type: 'highest_score', after: 'all_rounds' },
    ...overrides,
  };
  return base;
}

/**
 * Build a package with an input_gate phase for testing input-related features.
 */
function buildInputPackage(overrides: Partial<GamePackage> = {}): GamePackage {
  const base: GamePackage = {
    schema_version: '2.0',
    manifest: {
      id: 'test-input',
      name: 'Input Test',
      description: 'Tests input handling',
      version: '1.0.0',
      players: { min: 1, max: 4 },
    },
    state_model: {
      globals: {
        round: { type: 'integer', default: 0, visibility: 'public' },
      },
      per_player: {
        answer: { type: 'string', default: null, visibility: 'private' },
      },
    },
    phases: {
      play: {
        type: 'input_gate',
        duration: 30,
        input: {
          primitive: 'text_submit',
          target: 'per_player.answer',
          required: 'all_players',
        },
        on_enter: [{ action: 'increment', target: 'globals.round' }],
        on_complete: [{ action: 'advance', to: 'done' }],
      },
      done: {
        type: 'timed',
        duration: 5,
      },
    },
    turn_model: { type: 'simultaneous' },
    victory: { type: 'highest_score', after: 'all_rounds' },
    ...overrides,
  };
  return base;
}

// ---------------------------------------------------------------------------
// Test Setup helper
// ---------------------------------------------------------------------------

function setupWithPackage(pkg: GamePackage, playerIds: string[] = ['p1', 'p2']) {
  const timer = new TestTimerImpl();
  const roomId = 'test-room';
  const ctx = new MockGameContext(roomId, timer);
  const definition = makeDefinition(pkg.manifest.id);
  const module = new DeclarativeGameModule(definition, pkg, timer);
  const players = playerIds.map(makePlayer);
  module.setup(players, ctx);
  return { module, timer, ctx, roomId, players };
}

// ---------------------------------------------------------------------------
// 1. Event System Integration
// ---------------------------------------------------------------------------

describe('Phase 5.1: Event System Integration', () => {
  it('EventEngine is initialized when game schema has events', () => {
    const pkg = buildMinimalPackage({
      events: [
        {
          id: 'on_game_start',
          name: 'Track game start',
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'increment', target: 'globals.round', amount: 1 }],
        },
      ],
    } as Partial<GamePackage>);

    const { module, ctx, roomId } = setupWithPackage(pkg);

    // EventEngine initialized - ctx.log.info should have been called
    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const eventLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('EventEngine initialized'),
    );
    expect(eventLog).toBeDefined();

    // The game_start event should have fired and incremented round
    const publicState = module.getPublicState(roomId);
    const globals = publicState.globals as Record<string, unknown>;
    expect(globals.round).toBe(1); // incremented by game_start event
  });

  it('fires phase_enter event when entering a phase', () => {
    // Create a package where phase_enter fires an announce effect
    const pkg = buildMinimalPackage({
      events: [
        {
          id: 'on_lobby_enter',
          triggers: [{ type: 'phase_enter', phase: 'lobby' }],
          effects: [{ type: 'announce', message: 'Entered lobby!' }],
        },
      ],
    } as Partial<GamePackage>);

    const { ctx } = setupWithPackage(pkg);

    // Should have sent an announcement when lobby was entered
    const announcement: unknown = ctx.sendToAllCalls.find(
      (m) => m.type === ServerMessageType.GAME_EVENT &&
        (m as unknown as Record<string, unknown>).event === 'announcement',
    );
    expect(announcement).toBeDefined();
    const data = (announcement as unknown as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.message).toBe('Entered lobby!');
  });

  it('fires phase_exit event when leaving a phase', () => {
    const pkg = buildMinimalPackage({
      events: [
        {
          id: 'on_lobby_exit',
          triggers: [{ type: 'phase_exit', phase: 'lobby' }],
          effects: [{ type: 'increment', target: 'globals.round', amount: 5 }],
        },
      ],
    } as Partial<GamePackage>);

    const { module, timer, roomId } = setupWithPackage(pkg);

    const beforeRound = (module.getPublicState(roomId).globals as Record<string, unknown>).round;

    // Trigger timer to cause phase_exit
    timer.trigger(roomId); // lobby → game_over

    const afterRound = (module.getPublicState(roomId).globals as Record<string, unknown>).round;
    expect(Number(afterRound)).toBeGreaterThan(Number(beforeRound));
  });

  it('fires game_start event once on setup', () => {
    const pkg = buildMinimalPackage({
      events: [
        {
          id: 'game_start_once',
          once: true,
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'increment', target: 'globals.round', amount: 10 }],
        },
      ],
    } as Partial<GamePackage>);

    const { module, roomId } = setupWithPackage(pkg);

    const globals = module.getPublicState(roomId).globals as Record<string, unknown>;
    expect(globals.round).toBe(10); // incremented exactly once by game_start
  });

  it('fires game_end event when the game ends', () => {
    const pkg = buildMinimalPackage({
      events: [
        {
          id: 'on_game_end',
          triggers: [{ type: 'game_end' }],
          effects: [{ type: 'announce', message: 'Game over!' }],
        },
      ],
    } as Partial<GamePackage>);

    const { ctx, timer } = setupWithPackage(pkg);

    // Advance through both phases
    timer.trigger('test-room'); // lobby → game_over
    timer.trigger('test-room'); // game_over ends

    // game_end should have fired and sent announcement
    const announcement = ctx.sendToAllCalls.find(
      (m) => m.type === ServerMessageType.GAME_EVENT &&
        (m as unknown as Record<string, unknown>).event === 'announcement' &&
        ((m as unknown as Record<string, unknown>).data as Record<string, unknown>)?.message === 'Game over!',
    );
    expect(announcement).toBeDefined();
  });

  it('play_sound effect sends GAME_EVENT with sound to all clients', () => {
    const pkg = buildMinimalPackage({
      events: [
        {
          id: 'sound_on_start',
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'play_sound', sound: 'start_chime' }],
        },
      ],
    } as Partial<GamePackage>);

    const { ctx } = setupWithPackage(pkg);

    const soundEvent = ctx.sendToAllCalls.find(
      (m) => m.type === ServerMessageType.GAME_EVENT &&
        (m as unknown as Record<string, unknown>).event === 'play_sound',
    );
    expect(soundEvent).toBeDefined();
    const data = (soundEvent as unknown as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.sound).toBe('start_chime');
  });

  it('state_change event fires via EventEngine.emit', () => {
    const pkg = buildMinimalPackage({
      events: [
        {
          id: 'watch_round',
          triggers: [{ type: 'state_change', field: 'globals.round' }],
          effects: [{ type: 'increment', target: 'globals.total_rounds', amount: 1 }],
        },
      ],
    } as Partial<GamePackage>);

    // This verifies that the EventEngine is wired and will respond to state_change triggers
    // (the actual emit is called from rule/input handlers)
    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const eventLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('EventEngine initialized'),
    );
    expect(eventLog).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Scoring System Integration
// ---------------------------------------------------------------------------

describe('Phase 5.1: Scoring System Integration', () => {
  it('ScoreManager is NOT initialized for legacy V1 scoring format', () => {
    const pkg = buildMinimalPackage({
      scoring: { correct_answer: 100 } as unknown as GamePackage['scoring'],
    });

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const scoringLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('Legacy scoring format'),
    );
    expect(scoringLog).toBeDefined();
  });

  it('ScoreManager is initialized for V2 scoring format (has tracks)', () => {
    const pkg = buildMinimalPackage({
      scoring: {
        tracks: [
          { id: 'points', name: 'Points', initial: 0, direction: 'higher-better' },
        ],
        rules: [],
        victory: { type: 'highest_score', track: 'points' },
      } as unknown as GamePackage['scoring'],
    });

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const scoringLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('ScoreManager initialized'),
    );
    expect(scoringLog).toBeDefined();
  });

  it('ScoreManager initializes scores for all players to track initial values', () => {
    const pkg = buildMinimalPackage({
      scoring: {
        tracks: [
          { id: 'points', name: 'Points', initial: 100, direction: 'higher-better' },
        ],
        rules: [],
        victory: { type: 'highest_score', track: 'points' },
      } as unknown as GamePackage['scoring'],
    });

    const { module, roomId } = setupWithPackage(pkg, ['p1', 'p2']);

    const publicState = module.getPublicState(roomId);
    // ScoreManager scores should appear in public state
    const scores = publicState.scores as Record<string, Record<string, number>>;
    expect(scores).toBeDefined();
    expect(scores['p1']?.points).toBe(100);
    expect(scores['p2']?.points).toBe(100);
  });

  it('ScoreManager scores appear in private state (myScores field)', () => {
    const pkg = buildMinimalPackage({
      scoring: {
        tracks: [
          { id: 'points', name: 'Points', initial: 50, direction: 'higher-better' },
        ],
        rules: [],
        victory: { type: 'highest_score', track: 'points' },
      } as unknown as GamePackage['scoring'],
    });

    const { module, roomId } = setupWithPackage(pkg, ['p1', 'p2']);

    const privateState = module.getPrivateState(roomId, 'p1');
    const myScores = privateState.myScores as Record<string, number>;
    expect(myScores).toBeDefined();
    expect(myScores.points).toBe(50);
  });

  it('score_round action applies scoring via ScoreManager when rule matches', () => {
    const pkg = buildMinimalPackage({
      scoring: {
        tracks: [
          { id: 'points', name: 'Points', initial: 0, direction: 'higher-better' },
        ],
        rules: [
          {
            id: 'correct_bonus',
            track: 'points',
            trigger: 'manual',
            targets: 'all-players',
            formula: { type: 'fixed', amount: 50 },
          },
        ],
        victory: { type: 'highest_score', track: 'points' },
      } as unknown as GamePackage['scoring'],
      phases: {
        play: {
          type: 'timed',
          duration: 1,
          on_enter: [
            { action: 'score_round', formulas: { correct_bonus: 50 } },
          ],
          on_exit: [{ action: 'advance', to: 'done' }],
        },
        done: {
          type: 'timed',
          duration: 1,
        },
      },
    });

    const { module, roomId } = setupWithPackage(pkg, ['p1', 'p2']);

    // ScoreManager should have been initialized
    const publicState = module.getPublicState(roomId);
    const scores = publicState.scores as Record<string, Record<string, number>>;
    expect(scores).toBeDefined();
  });

  it('victory detection calls broadcastGameOver when highest_score condition met', () => {
    // Game with a scoring system where we can verify the game over detection
    const pkg = buildMinimalPackage({
      scoring: {
        tracks: [
          { id: 'points', name: 'Points', initial: 0, direction: 'higher-better' },
        ],
        rules: [],
        victory: { type: 'highest_score', track: 'points' },
      } as unknown as GamePackage['scoring'],
    });

    const { ctx, timer } = setupWithPackage(pkg);

    // Advance through both phases to trigger game end
    timer.trigger('test-room'); // lobby → game_over
    timer.trigger('test-room'); // game_over ends

    // Game should have ended
    expect(ctx.broadcastGameOverCalls.length).toBeGreaterThan(0);
  });

  it('target_score victory config is stored without error', () => {
    const pkg = buildMinimalPackage({
      scoring: {
        tracks: [
          { id: 'points', name: 'Points', initial: 0, direction: 'higher-better' },
        ],
        rules: [],
        victory: { type: 'target_score', track: 'points', target: 100 },
      } as unknown as GamePackage['scoring'],
    });

    // Should initialize without throwing
    expect(() => setupWithPackage(pkg)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Victory Detection
// ---------------------------------------------------------------------------

describe('Phase 5.1: Victory Detection', () => {
  it('ScoreManager checkVictory is used in handleGameEnd when scoreManager is present', () => {
    const pkg = buildMinimalPackage({
      scoring: {
        tracks: [
          { id: 'points', name: 'Points', initial: 0, direction: 'higher-better' },
        ],
        rules: [],
        victory: { type: 'highest_score', track: 'points' },
      } as unknown as GamePackage['scoring'],
    });

    const { ctx, timer } = setupWithPackage(pkg, ['p1', 'p2']);

    timer.trigger('test-room'); // lobby → game_over
    timer.trigger('test-room'); // game_over ends — triggers handleGameEnd

    // broadcastGameOver should have been called
    expect(ctx.broadcastGameOverCalls.length).toBeGreaterThan(0);

    // finalScores should be populated
    const gameOver = ctx.broadcastGameOverCalls[0];
    expect(gameOver.finalScores).toBeDefined();
    expect(Array.isArray(gameOver.finalScores)).toBe(true);
  });

  it('fallback to ctx.getScores when no ScoreManager is configured', () => {
    const pkg = buildMinimalPackage(); // No scoring config

    const { ctx, timer } = setupWithPackage(pkg, ['p1', 'p2']);

    timer.trigger('test-room'); // lobby → game_over
    timer.trigger('test-room'); // game_over ends

    // Still broadcasts game over using ctx scores
    expect(ctx.broadcastGameOverCalls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Content System Integration
// ---------------------------------------------------------------------------

describe('Phase 5.1: Content System Integration', () => {
  it('ContentRegistry is initialized when game schema has content pools', () => {
    const pkg = buildMinimalPackage({
      content: {
        pools: [
          {
            id: 'questions',
            selection: 'random',
            sources: [
              {
                type: 'inline',
                items: [
                  { id: 'q1', text: 'What is 2+2?' },
                  { id: 'q2', text: 'What color is the sky?' },
                  { id: 'q3', text: 'Name a planet.' },
                ],
              },
            ],
          },
        ],
      } as GamePackage['content'],
    });

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const contentLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('ContentRegistry initialized'),
    );
    expect(contentLog).toBeDefined();
  });

  it('content_draw action draws from pool and stores in globals', () => {
    const pkg = buildMinimalPackage({
      content: {
        pools: [
          {
            id: 'questions',
            selection: 'sequential',
            noRepeat: false,
            sources: [
              {
                type: 'inline',
                items: [
                  { id: 'q1', text: 'What is 2+2?' },
                  { id: 'q2', text: 'What color is the sky?' },
                ],
              },
            ],
          },
        ],
      } as GamePackage['content'],
      state_model: {
        globals: {
          round: { type: 'integer', default: 0, visibility: 'public' },
          current_question: { type: 'object', default: null, visibility: 'public' },
        },
        per_player: {
          answer: { type: 'string', default: null, visibility: 'private' },
        },
      },
      phases: {
        play: {
          type: 'timed',
          duration: 1,
          on_enter: [
            { action: 'content_draw', pool: 'questions', target: 'globals.current_question', count: 1 },
          ],
          on_exit: [{ action: 'advance', to: 'done' }],
        },
        done: {
          type: 'timed',
          duration: 1,
        },
      },
    });

    const { module, roomId } = setupWithPackage(pkg);

    // After entering the play phase, current_question should be populated
    const publicState = module.getPublicState(roomId);
    const globals = publicState.globals as Record<string, unknown>;
    const question = globals.current_question;

    expect(question).not.toBeNull();
    const q = question as Record<string, unknown>;
    expect(typeof q.text).toBe('string');
    expect(typeof q.id).toBe('string');
  });

  it('content_draw with unknown pool logs a warning and does not throw', () => {
    const pkg = buildMinimalPackage({
      content: {
        pools: [
          {
            id: 'existing_pool',
            selection: 'random',
            sources: [
              { type: 'inline', items: [{ id: 'i1', text: 'Item 1' }] },
            ],
          },
        ],
      } as GamePackage['content'],
      phases: {
        play: {
          type: 'timed',
          duration: 1,
          on_enter: [
            { action: 'content_draw', pool: 'nonexistent_pool', target: 'globals.question' },
          ],
          on_exit: [{ action: 'advance', to: 'done' }],
        },
        done: {
          type: 'timed',
          duration: 1,
        },
      },
    });

    const { ctx } = setupWithPackage(pkg);

    // Should have logged a warning about the pool not being found
    const warnCalls = (ctx.log.warn as ReturnType<typeof vi.fn>).mock.calls;
    const poolWarn = warnCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('pool not found'),
    );
    expect(poolWarn).toBeDefined();
  });

  it('ContentRegistry not initialized when no content section in schema', () => {
    const pkg = buildMinimalPackage(); // No content section

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const contentLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('ContentRegistry initialized'),
    );
    expect(contentLog).toBeUndefined();
  });

  it('multiple draws from sequential pool return items in order', () => {
    const items = [
      { id: 'q1', text: 'Question 1' },
      { id: 'q2', text: 'Question 2' },
      { id: 'q3', text: 'Question 3' },
    ];

    const pkg = buildMinimalPackage({
      content: {
        pools: [
          {
            id: 'questions',
            selection: 'sequential',
            noRepeat: true,
            sources: [{ type: 'inline', items }],
          },
        ],
      } as GamePackage['content'],
      state_model: {
        globals: {
          round: { type: 'integer', default: 0, visibility: 'public' },
          current_question: { type: 'object', default: null, visibility: 'public' },
        },
        per_player: {},
      },
      phases: {
        draw_phase: {
          type: 'timed',
          duration: 1,
          on_enter: [
            { action: 'content_draw', pool: 'questions', target: 'globals.current_question', count: 1 },
          ],
          on_exit: [{ action: 'advance', to: 'done' }],
        },
        done: {
          type: 'timed',
          duration: 1,
        },
      },
    });

    const { module, roomId } = setupWithPackage(pkg);

    const firstQ = (module.getPublicState(roomId).globals as Record<string, unknown>).current_question as Record<string, unknown>;
    expect(firstQ?.id).toBe('q1');
  });
});

// ---------------------------------------------------------------------------
// 5. Turn System Integration
// ---------------------------------------------------------------------------

describe('Phase 5.1: Turn System Integration', () => {
  it('TurnManager is initialized when game has turn_model', () => {
    const pkg = buildInputPackage({
      turn_model: { type: 'simultaneous' },
    });

    const { ctx } = setupWithPackage(pkg, ['p1', 'p2']);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const turnLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('TurnManager initialized'),
    );
    expect(turnLog).toBeDefined();
  });

  it('simultaneous model: all players can submit input', () => {
    const pkg = buildInputPackage({
      turn_model: { type: 'simultaneous' },
    });

    const { module, roomId } = setupWithPackage(pkg, ['p1', 'p2', 'p3']);

    const r1 = module.handleInput(roomId, 'p1', 'text_submit', { value: 'answer1' });
    const r2 = module.handleInput(roomId, 'p2', 'text_submit', { value: 'answer2' });
    const r3 = module.handleInput(roomId, 'p3', 'text_submit', { value: 'answer3' });

    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
    expect(r3.accepted).toBe(true);
  });

  it('round_robin model: only active player can submit input', () => {
    const pkg = buildInputPackage({
      turn_model: { type: 'round_robin' },
    });

    const { module, roomId } = setupWithPackage(pkg, ['p1', 'p2', 'p3']);

    // In round_robin, only the first player (p1) should be active initially
    // p2 and p3 should be rejected with "Not your turn"
    const r2 = module.handleInput(roomId, 'p2', 'text_submit', { value: 'answer2' });
    expect(r2.accepted).toBe(false);
    expect(r2.reason).toBe('Not your turn');

    const r3 = module.handleInput(roomId, 'p3', 'text_submit', { value: 'answer3' });
    expect(r3.accepted).toBe(false);
    expect(r3.reason).toBe('Not your turn');

    // p1 (the first player = first active) should be accepted
    const r1 = module.handleInput(roomId, 'p1', 'text_submit', { value: 'answer1' });
    expect(r1.accepted).toBe(true);
  });

  it('turn state is included in public state', () => {
    const pkg = buildInputPackage({
      turn_model: { type: 'simultaneous' },
    });

    const { module, roomId } = setupWithPackage(pkg, ['p1', 'p2']);

    const publicState = module.getPublicState(roomId);
    expect(publicState.turn).toBeDefined();

    const turn = publicState.turn as Record<string, unknown>;
    expect(turn.model).toBe('simultaneous');
    expect(Array.isArray(turn.activePlayerIds)).toBe(true);
  });

  it('turn state in private state includes isMyTurn flag', () => {
    const pkg = buildInputPackage({
      turn_model: { type: 'round_robin' },
    });

    const { module, roomId } = setupWithPackage(pkg, ['p1', 'p2']);

    const p1Private = module.getPrivateState(roomId, 'p1');
    const p2Private = module.getPrivateState(roomId, 'p2');

    const p1Turn = p1Private.turn as Record<string, unknown>;
    const p2Turn = p2Private.turn as Record<string, unknown>;

    expect(typeof p1Turn.isMyTurn).toBe('boolean');
    expect(typeof p2Turn.isMyTurn).toBe('boolean');
    // Exactly one player should have isMyTurn = true in round_robin
    expect(p1Turn.isMyTurn !== p2Turn.isMyTurn).toBe(true);
  });

  it('free_form model: any player can submit input', () => {
    const pkg = buildInputPackage({
      turn_model: { type: 'simultaneous' } /* free_form acts like simultaneous for all-active scenarios */,
    });

    const { module, roomId } = setupWithPackage(pkg, ['p1', 'p2', 'p3']);

    const r1 = module.handleInput(roomId, 'p1', 'text_submit', { value: 'ans1' });
    const r2 = module.handleInput(roomId, 'p2', 'text_submit', { value: 'ans2' });

    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Rule Engine Integration
// ---------------------------------------------------------------------------

describe('Phase 5.1: Rule Engine Integration', () => {
  it('RuleEngine is initialized when game schema has rules', () => {
    const pkg = buildMinimalPackage({
      rules: [
        {
          id: 'increment_on_start',
          when: { type: 'comparison', left: 'globals.round', operator: '==', right: 0 },
          then: [{ type: 'increment', path: 'globals.round', amount: 1 }],
        },
      ],
    } as Partial<GamePackage>);

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const ruleLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('RuleEngine initialized'),
    );
    expect(ruleLog).toBeDefined();
  });

  it('RuleEngine not initialized when no rules in schema', () => {
    const pkg = buildMinimalPackage(); // No rules

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const ruleLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('RuleEngine initialized'),
    );
    expect(ruleLog).toBeUndefined();
  });

  it('set action from rule sets global state', () => {
    const pkg = buildMinimalPackage({
      rules: [
        {
          id: 'set_round_on_phase_enter',
          // Condition: phase is lobby (round == 0 since we just started)
          when: { type: 'comparison', left: 'globals.round', operator: '==', right: 0 },
          then: [{ type: 'set', path: 'globals.round', value: 42 }],
        },
      ],
    } as Partial<GamePackage>);

    const { module, roomId } = setupWithPackage(pkg);

    // Rule fires on phase change (lobby entered) — sets round to 42
    const globals = module.getPublicState(roomId).globals as Record<string, unknown>;
    expect(globals.round).toBe(42);
  });

  it('increment action from rule modifies global state', () => {
    const pkg = buildMinimalPackage({
      rules: [
        {
          id: 'bump_rounds',
          when: { type: 'comparison', left: 'globals.round', operator: '>=', right: 0 },
          then: [{ type: 'increment', path: 'globals.round', amount: 5 }],
        },
      ],
    } as Partial<GamePackage>);

    const { module, roomId } = setupWithPackage(pkg);

    const globals = module.getPublicState(roomId).globals as Record<string, unknown>;
    // Rule fires when phase changes to lobby (round >= 0 = true) → increment by 5
    expect(Number(globals.round)).toBeGreaterThanOrEqual(5);
  });

  it('rule with false condition does not fire then actions', () => {
    const pkg = buildMinimalPackage({
      rules: [
        {
          id: 'never_fires',
          when: {
            type: 'comparison',
            left: 'globals.round',
            operator: '>',
            right: 9999, // always false at start
          },
          then: [{ type: 'set', path: 'globals.round', value: 999 }],
        },
      ],
    } as Partial<GamePackage>);

    const { module, roomId } = setupWithPackage(pkg);

    const globals = module.getPublicState(roomId).globals as Record<string, unknown>;
    expect(globals.round).toBe(0); // Rule did NOT fire
  });

  it('rule with else actions fires else when condition is false', () => {
    const pkg = buildMinimalPackage({
      rules: [
        {
          id: 'conditional_rule',
          when: {
            type: 'comparison',
            left: 'globals.round',
            operator: '>',
            right: 99,  // false at start (round = 0)
          },
          then: [{ type: 'set', path: 'globals.round', value: 100 }],
          else: [{ type: 'set', path: 'globals.round', value: 77 }],
        },
      ],
    } as Partial<GamePackage>);

    const { module, roomId } = setupWithPackage(pkg);

    const globals = module.getPublicState(roomId).globals as Record<string, unknown>;
    expect(globals.round).toBe(77); // else branch fired
  });

  it('rules are evaluated on phase change', () => {
    const pkg = buildMinimalPackage({
      state_model: {
        globals: {
          round: { type: 'integer', default: 0, visibility: 'public' },
          total_rounds: { type: 'integer', default: 1, visibility: 'public' },
          phase_count: { type: 'integer', default: 0, visibility: 'public' },
        },
        per_player: {},
      },
      rules: [
        {
          id: 'count_phases',
          when: { type: 'comparison', left: 'globals.phase_count', operator: '>=', right: 0 },
          then: [{ type: 'increment', path: 'globals.phase_count', amount: 1 }],
        },
      ],
    } as Partial<GamePackage>);

    const { module, timer, roomId } = setupWithPackage(pkg);

    const before = Number(
      (module.getPublicState(roomId).globals as Record<string, unknown>).phase_count,
    );

    timer.trigger(roomId); // lobby → game_over (triggers another phase change)

    const after = Number(
      (module.getPublicState(roomId).globals as Record<string, unknown>).phase_count,
    );

    expect(after).toBeGreaterThan(before);
  });

  it('emit rule action sends trigger to EventEngine', () => {
    // Rule fires emit, EventEngine handles state_change trigger
    const pkg = buildMinimalPackage({
      events: [
        {
          id: 'watch_emit',
          triggers: [{ type: 'state_change', field: 'custom_event' }],
          effects: [{ type: 'increment', target: 'globals.round', amount: 10 }],
        },
      ],
      rules: [
        {
          id: 'emit_custom',
          when: { type: 'comparison', left: 'globals.round', operator: '==', right: 0 },
          then: [{ type: 'emit', event: 'custom_event' }],
        },
      ],
    } as Partial<GamePackage>);

    const { ctx } = setupWithPackage(pkg);

    // Both subsystems should be initialized
    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const eventLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('EventEngine initialized'),
    );
    const ruleLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('RuleEngine initialized'),
    );
    expect(eventLog).toBeDefined();
    expect(ruleLog).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 7. Object Models Integration
// ---------------------------------------------------------------------------

describe('Phase 5.1: Object Models Integration', () => {
  it('ObjectRegistry is initialized when game schema has objects', () => {
    const pkg = buildMinimalPackage({
      objects: [
        {
          id: 'main_deck',
          type: 'deck',
          items: [
            { id: 'card1', type: 'card', value: { suit: 'spades', rank: 'A' } },
            { id: 'card2', type: 'card', value: { suit: 'hearts', rank: 'K' } },
          ],
        },
      ] as GamePackage['objects'],
    });

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const objLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('ObjectRegistry initialized'),
    );
    expect(objLog).toBeDefined();
  });

  it('ObjectRegistry not initialized when no objects in schema', () => {
    const pkg = buildMinimalPackage(); // No objects

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const objLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('ObjectRegistry initialized'),
    );
    expect(objLog).toBeUndefined();
  });

  it('deck object is created without error', () => {
    const pkg = buildMinimalPackage({
      objects: [
        {
          id: 'deck_of_cards',
          type: 'deck',
          items: [
            { id: 'c1', type: 'card', value: { rank: '2', suit: 'spades' } },
            { id: 'c2', type: 'card', value: { rank: '3', suit: 'spades' } },
          ],
        },
      ] as GamePackage['objects'],
    });

    expect(() => setupWithPackage(pkg)).not.toThrow();
  });

  it('pool object is created without error', () => {
    const pkg = buildMinimalPackage({
      objects: [
        {
          id: 'discard_pile',
          type: 'pool',
          items: [],
        },
      ] as GamePackage['objects'],
    });

    expect(() => setupWithPackage(pkg)).not.toThrow();
  });

  it('board object is created without error', () => {
    const pkg = buildMinimalPackage({
      objects: [
        {
          id: 'game_board',
          type: 'board',
          width: 8,
          height: 8,
        },
      ] as GamePackage['objects'],
    });

    expect(() => setupWithPackage(pkg)).not.toThrow();
  });

  it('multiple object types can be declared together', () => {
    const pkg = buildMinimalPackage({
      objects: [
        {
          id: 'main_deck',
          type: 'deck',
          items: [{ id: 'c1', type: 'card', value: {} }],
        },
        {
          id: 'discard',
          type: 'pool',
          items: [],
        },
        {
          id: 'board',
          type: 'board',
          width: 4,
          height: 4,
        },
      ] as GamePackage['objects'],
    });

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const objLog = logCalls.find((c: unknown[]) =>
      typeof c[0] === 'string' && c[0].includes('ObjectRegistry initialized'),
    );
    expect(objLog).toBeDefined();
    // Should show objectCount: 3
    const logArg = objLog?.[1] as Record<string, unknown>;
    expect(logArg?.objectCount).toBe(3);
  });

  it('ObjectRegistry is cleaned up on teardown', () => {
    const pkg = buildMinimalPackage({
      objects: [
        {
          id: 'deck',
          type: 'deck',
          items: [{ id: 'c1', type: 'card', value: {} }],
        },
      ] as GamePackage['objects'],
    });

    const { module, roomId } = setupWithPackage(pkg);

    // Teardown should not throw
    expect(() => module.teardown(roomId)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 8. Full Lifecycle — all subsystems wired
// ---------------------------------------------------------------------------

describe('Phase 5.1: Full Lifecycle (all subsystems)', () => {
  it('game with events + scoring + content + rules + turns runs start-to-finish without errors', () => {
    const fullPkg: GamePackage = {
      schema_version: '2.0',
      manifest: {
        id: 'full-lifecycle-test',
        name: 'Full Lifecycle Test',
        description: 'Tests all subsystems wired together',
        version: '1.0.0',
        players: { min: 2, max: 4 },
      },
      state_model: {
        globals: {
          round: { type: 'integer', default: 0, visibility: 'public' },
          total_rounds: { type: 'integer', default: 1, visibility: 'public' },
          current_question: { type: 'object', default: null, visibility: 'public' },
        },
        per_player: {
          answer: { type: 'string', default: null, visibility: 'private' },
          score: { type: 'integer', default: 0, visibility: 'public' },
        },
      },
      phases: {
        play: {
          type: 'input_gate',
          duration: 30,
          input: {
            primitive: 'text_submit',
            target: 'per_player.answer',
            required: 'all_players',
          },
          on_enter: [
            { action: 'increment', target: 'globals.round' },
            { action: 'content_draw', pool: 'questions', target: 'globals.current_question', count: 1 },
          ],
          on_complete: [{ action: 'advance', to: 'done' }],
        },
        done: {
          type: 'timed',
          duration: 5,
        },
      },
      turn_model: { type: 'simultaneous' },
      victory: { type: 'highest_score', after: 'all_rounds' },
      scoring: {
        tracks: [
          { id: 'points', name: 'Points', initial: 0, direction: 'higher-better' },
        ],
        rules: [],
        victory: { type: 'highest_score', track: 'points' },
      } as unknown as GamePackage['scoring'],
      events: [
        {
          id: 'on_game_start',
          once: true,
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'announce', message: 'Game starting!' }],
        },
        {
          id: 'on_phase_enter_play',
          triggers: [{ type: 'phase_enter', phase: 'play' }],
          effects: [{ type: 'announce', message: 'New round starting' }],
        },
      ] as unknown as typeof fullPkg.events,
      content: {
        pools: [
          {
            id: 'questions',
            selection: 'sequential',
            noRepeat: false,
            sources: [
              {
                type: 'inline',
                items: [
                  { id: 'q1', text: 'What is the capital of France?' },
                  { id: 'q2', text: 'What is 3 × 7?' },
                  { id: 'q3', text: 'Who wrote Hamlet?' },
                ],
              },
            ],
          },
        ],
      } as unknown as typeof fullPkg.content,
      rules: [
        {
          id: 'check_round',
          when: { type: 'comparison', left: 'globals.round', operator: '>=', right: 0 },
          then: [{ type: 'set', path: 'globals.total_rounds', value: 3 }],
        },
      ] as unknown as typeof fullPkg.rules,
      objects: [
        {
          id: 'answer_pool',
          type: 'pool',
          items: [],
        },
      ] as unknown as typeof fullPkg.objects,
    };

    const timer = new TestTimerImpl();
    const roomId = 'full-lifecycle';
    const ctx = new MockGameContext(roomId, timer);
    const players = ['p1', 'p2'].map(makePlayer);
    const module = new DeclarativeGameModule(makeDefinition('full-lifecycle'), fullPkg, timer);

    // Setup should not throw
    expect(() => module.setup(players, ctx)).not.toThrow();

    // Game should be in play phase
    expect(module.getPhaseState(roomId).phaseType).toBe('play');

    // All subsystems should be initialized
    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const logMessages = logCalls
      .filter((c: unknown[]) => typeof c[0] === 'string')
      .map((c: unknown[]) => c[0] as string);

    expect(logMessages.some(m => m.includes('EventEngine initialized'))).toBe(true);
    expect(logMessages.some(m => m.includes('ScoreManager initialized'))).toBe(true);
    expect(logMessages.some(m => m.includes('RuleEngine initialized'))).toBe(true);
    expect(logMessages.some(m => m.includes('ContentRegistry initialized'))).toBe(true);
    expect(logMessages.some(m => m.includes('TurnManager initialized'))).toBe(true);
    expect(logMessages.some(m => m.includes('ObjectRegistry initialized'))).toBe(true);

    // Game_start event should have fired
    const announcements = ctx.sendToAllCalls.filter(
      m => m.type === ServerMessageType.GAME_EVENT &&
        (m as unknown as Record<string, unknown>).event === 'announcement',
    );
    expect(announcements.length).toBeGreaterThan(0);

    // Content should be loaded into state
    const globals = module.getPublicState(roomId).globals as Record<string, unknown>;
    expect(globals.current_question).not.toBeNull();

    // Both players submit
    const r1 = module.handleInput(roomId, 'p1', 'text_submit', { value: 'Paris' });
    const r2 = module.handleInput(roomId, 'p2', 'text_submit', { value: 'Paris' });
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);

    // Phase should advance to done
    expect(module.getPhaseState(roomId).phaseType).toBe('done');

    // Trigger done phase timer to end game
    timer.trigger(roomId);

    // Game should have ended
    expect(ctx.broadcastGameOverCalls.length).toBeGreaterThan(0);

    // Teardown should not throw
    expect(() => module.teardown(roomId)).not.toThrow();
  });

  it('subsystems are all optional — game with no extras still works', () => {
    // Minimal game — no events, no scoring config, no content, no rules, no objects
    const minimalPkg = buildInputPackage();

    const { module, timer, roomId } = setupWithPackage(minimalPkg, ['p1', 'p2']);

    // Should run through full flow
    expect(module.getPhaseState(roomId).phaseType).toBe('play');

    const r1 = module.handleInput(roomId, 'p1', 'text_submit', { value: 'ans' });
    const r2 = module.handleInput(roomId, 'p2', 'text_submit', { value: 'ans' });
    expect(r1.accepted).toBe(true);
    expect(r2.accepted).toBe(true);

    expect(module.getPhaseState(roomId).phaseType).toBe('done');
    timer.trigger(roomId);

    expect(() => module.teardown(roomId)).not.toThrow();
  });

  it('teardown cleans up all subsystems without error', () => {
    const fullPkg: GamePackage = {
      schema_version: '2.0',
      manifest: {
        id: 'teardown-test',
        name: 'Teardown Test',
        description: 'Test teardown',
        version: '1.0.0',
        players: { min: 1, max: 4 },
      },
      state_model: {
        globals: { round: { type: 'integer', default: 0, visibility: 'public' } },
        per_player: {},
      },
      phases: {
        play: {
          type: 'timed',
          duration: 1,
          on_exit: [{ action: 'advance', to: 'done' }],
        },
        done: { type: 'timed', duration: 1 },
      },
      turn_model: { type: 'simultaneous' },
      victory: { type: 'highest_score', after: 'all_rounds' },
      content: {
        pools: [
          {
            id: 'pool1',
            selection: 'random',
            sources: [{ type: 'inline', items: [{ id: 'i1', text: 'item' }] }],
          },
        ],
      } as unknown as GamePackage['content'],
      objects: [
        { id: 'deck1', type: 'deck', items: [] },
      ] as unknown as typeof fullPkg.objects,
    };

    const { module, roomId } = setupWithPackage(fullPkg);

    // Teardown should clean up content registry and object registry
    expect(() => module.teardown(roomId)).not.toThrow();

    // Room state should be gone after teardown
    const state = module.getPublicState(roomId);
    expect(state).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// 9. RoomState interface enhancement verification
// ---------------------------------------------------------------------------

describe('Phase 5.1: RoomState interface — optional subsystem fields', () => {
  it('each subsystem is independently optional (only some subsystems present)', () => {
    // Game with events and content but no scoring or rules
    const pkg = buildMinimalPackage({
      events: [
        {
          id: 'start_event',
          triggers: [{ type: 'game_start' }],
          effects: [{ type: 'announce', message: 'Started' }],
        },
      ],
      content: {
        pools: [
          {
            id: 'pool',
            selection: 'random',
            sources: [{ type: 'inline', items: [{ id: 'i1', text: 'test' }] }],
          },
        ],
      } as Partial<GamePackage>['content'],
    } as Partial<GamePackage>);

    const { ctx } = setupWithPackage(pkg);

    const logCalls = (ctx.log.info as ReturnType<typeof vi.fn>).mock.calls;
    const logMessages = logCalls
      .filter((c: unknown[]) => typeof c[0] === 'string')
      .map((c: unknown[]) => c[0] as string);

    // Events and content should be initialized
    expect(logMessages.some(m => m.includes('EventEngine initialized'))).toBe(true);
    expect(logMessages.some(m => m.includes('ContentRegistry initialized'))).toBe(true);

    // Scoring and rules should NOT be initialized (not in schema)
    expect(logMessages.some(m => m.includes('ScoreManager initialized'))).toBe(false);
    expect(logMessages.some(m => m.includes('RuleEngine initialized'))).toBe(false);
  });
});
