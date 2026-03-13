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
  BS_SETUP_TIME_SECONDS,
  BS_TURN_TIME_SECONDS,
  BS_RESULT_TIME_SECONDS,
  BS_SCORES_TIME_SECONDS,
} from '../constants.js';
import { BSPhase } from '../phases.js';
import {
  validatePlacement,
  randomPlacement,
  toDisplayBoard,
  fireShot,
  allShipsSunk,
  randomUntargetedCell,
} from './board.js';
import type {
  PlayerBoard,
  BSPublicState,
  BSPrivateState,
  PlacedShip,
  Shot,
} from '../types.js';
import { BS_FLEET } from '../constants.js';

// ── Internal state per room ─────────────────────────────────

interface BSPlayerState {
  playerId: string;
  playerName: string;
  board: PlayerBoard;
  isReady: boolean;
}

interface BSGameState {
  roomId: string;
  ctx: GameContext;
  players: Player[];
  currentPhase: string;

  playerStates: Map<string, BSPlayerState>;  // playerId → player state
  activePlayerId: string;
  lastShot: BSPublicState['lastShot'];
  turnNumber: number;
  winnerId: string | null;
}

// ── Module class ────────────────────────────────────────────

class BattleshipModule implements GameModule {
  readonly definition: GameDefinition;
  private states = new Map<string, BSGameState>();

  constructor(definition: GameDefinition) {
    this.definition = definition;
  }

  setup(players: Player[], ctx: GameContext): void {
    const roomId = ctx.roomId;

    // Initialize per-player state
    const playerStates = new Map<string, BSPlayerState>();
    for (const p of players) {
      playerStates.set(p.id, {
        playerId: p.id,
        playerName: p.name,
        board: { ships: [], incomingShots: [] },
        isReady: false,
      });
    }

    // Random first player
    const activePlayerId = players[Math.floor(Math.random() * players.length)]!.id;

    const state: BSGameState = {
      roomId,
      ctx,
      players: [...players],
      currentPhase: BSPhase.SETUP,
      playerStates,
      activePlayerId,
      lastShot: null,
      turnNumber: 0,
      winnerId: null,
    };

    this.states.set(roomId, state);

    ctx.initScores(players.map(p => p.id));
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    // Broadcast game started
    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: 'battleship',
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    ctx.broadcastPrivateState(playerId => this.getPrivateState(roomId, playerId));

    // Setup timer — auto-place if not ready
    ctx.startTimer(
      BSPhase.SETUP,
      BS_SETUP_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== BSPhase.SETUP) return;
        this.autoPlaceAndStartBattle(roomId);
      },
    );

    ctx.log.info('Battleship setup complete', { roomId, players: players.map(p => p.id) });
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) {
      return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 1, timerRemainingMs: null, timerTotalMs: null };
    }
    const remaining = state.ctx.getTimerRemaining();
    let timerTotalMs: number | null = null;
    switch (state.currentPhase) {
      case BSPhase.SETUP:   timerTotalMs = BS_SETUP_TIME_SECONDS * 1000; break;
      case BSPhase.BATTLE:  timerTotalMs = BS_TURN_TIME_SECONDS * 1000; break;
      case BSPhase.RESULT:  timerTotalMs = BS_RESULT_TIME_SECONDS * 1000; break;
      case BSPhase.SCORES:  timerTotalMs = BS_SCORES_TIME_SECONDS * 1000; break;
    }
    return {
      phaseType: state.currentPhase,
      roundNumber: state.turnNumber,
      totalRounds: 1,
      timerRemainingMs: remaining,
      timerTotalMs,
    };
  }

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const [p1, p2] = this.getOrderedPlayers(state);
    if (!p1 || !p2) return {};

    const ps1 = state.playerStates.get(p1.id)!;
    const ps2 = state.playerStates.get(p2.id)!;

    const publicState: BSPublicState = {
      gameId: 'battleship',
      player1: {
        playerId: p1.id,
        playerName: p1.name,
        board: toDisplayBoard(ps1.board.ships, ps1.board.incomingShots),
      },
      player2: {
        playerId: p2.id,
        playerName: p2.name,
        board: toDisplayBoard(ps2.board.ships, ps2.board.incomingShots),
      },
      activePlayerId: state.activePlayerId,
      lastShot: state.lastShot,
      turnNumber: state.turnNumber,
      readyStatus: state.currentPhase === BSPhase.SETUP
        ? Object.fromEntries([...state.playerStates.entries()].map(([id, ps]) => [id, ps.isReady]))
        : undefined,
    };

    return publicState as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const myPs = state.playerStates.get(playerId);
    if (!myPs) return {};

    // Find opponent
    const opponentId = state.players.find(p => p.id !== playerId)?.id;
    const opponentPs = opponentId ? state.playerStates.get(opponentId) : undefined;

    // My outgoing shots = opponent's incoming shots
    const myOutgoing = opponentPs
      ? opponentPs.board.incomingShots.filter(s => {
          // We need to know which shots came from this player.
          // Since all incoming shots on opponent's board came from me (2-player game), all qualify.
          return true;
        })
      : [];

    const myHits = myOutgoing.filter(s => s.result === 'hit').map(s => s.cell);
    const myMisses = myOutgoing.filter(s => s.result === 'miss').map(s => s.cell);
    const opponentSunkShips = opponentPs ? opponentPs.board.ships.filter(s => s.sunk) : [];

    // Available ships for setup phase
    const availableShips = state.currentPhase === BSPhase.SETUP
      ? BS_FLEET.filter(f => !myPs.board.ships.some(s => s.shipId === f.id)).map(f => ({ id: f.id, name: f.name, size: f.size }))
      : undefined;

    const privateState: BSPrivateState = {
      gameId: 'battleship',
      phase: state.currentPhase,
      isActivePlayer: state.activePlayerId === playerId,
      myBoard: {
        ships: myPs.board.ships,
        incomingShots: myPs.board.incomingShots,
      },
      opponentBoard: {
        hits: myHits,
        misses: myMisses,
        sunkShips: opponentSunkShips,
      },
      // Setup phase extras
      availableShips,
      placedShips: state.currentPhase === BSPhase.SETUP ? myPs.board.ships : undefined,
      isReady: state.currentPhase === BSPhase.SETUP ? myPs.isReady : undefined,
      // Already-fired cells (battle phase)
      firedCells: state.currentPhase === BSPhase.BATTLE
        ? myOutgoing.map(s => s.cell)
        : undefined,
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

    switch (inputType) {
      case InputType.CONFIRM:
        return this.handleSetupConfirm(state, playerId, payload);
      case InputType.VOTE:
        return this.handleFireShot(state, playerId, payload);
      default:
        return { accepted: false, reason: `Unexpected input type: ${inputType}` };
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

  // ── Private helpers ─────────────────────────────────────────

  /** Get players in stable order (same every call) */
  private getOrderedPlayers(state: BSGameState): [Player | undefined, Player | undefined] {
    return [state.players[0], state.players[1]];
  }

  private handleSetupConfirm(
    state: BSGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== BSPhase.SETUP) {
      return { accepted: false, reason: 'Not in setup phase' };
    }
    const ps = state.playerStates.get(playerId);
    if (!ps) return { accepted: false, reason: 'Player not found' };
    if (ps.isReady) return { accepted: false, reason: 'Already ready' };

    const ships = payload.ships as PlacedShip[] | undefined;
    if (!ships || !Array.isArray(ships)) {
      return { accepted: false, reason: 'Missing ships array' };
    }

    // Normalize hits/sunk (should be empty at placement)
    const normalizedShips: PlacedShip[] = ships.map(s => ({
      shipId: s.shipId,
      cells: s.cells,
      hits: [],
      sunk: false,
    }));

    const error = validatePlacement(normalizedShips);
    if (error) return { accepted: false, reason: error };

    ps.board.ships = normalizedShips;
    ps.isReady = true;

    // Let the player know their placement was accepted
    state.ctx.sendToPlayer(playerId, {
      type: ServerMessageType.INPUT_ACCEPTED, inputType: 'confirm',
    });

    // Update private state for this player
    state.ctx.sendToPlayer(playerId, {
      type: ServerMessageType.PRIVATE_STATE,
      state: this.getPrivateState(state.roomId, playerId),
    });

    // Broadcast updated ready status to display
    this.broadcastState(state.roomId);

    // If both players ready, start battle
    const allReady = [...state.playerStates.values()].every(p => p.isReady);
    if (allReady) {
      state.ctx.stopTimer();
      this.startBattle(state.roomId);
    }

    return { accepted: true };
  }

  private handleFireShot(
    state: BSGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== BSPhase.BATTLE) {
      return { accepted: false, reason: 'Not in battle phase' };
    }
    if (state.activePlayerId !== playerId) {
      return { accepted: false, reason: 'Not your turn' };
    }

    const cell = String(payload.cell ?? '').toUpperCase().trim();
    if (!cell.match(/^[A-J]([1-9]|10)$/)) {
      return { accepted: false, reason: 'Invalid cell format' };
    }

    // Find opponent
    const opponentId = state.players.find(p => p.id !== playerId)?.id;
    if (!opponentId) return { accepted: false, reason: 'No opponent' };
    const opponentPs = state.playerStates.get(opponentId)!;

    // Check already fired
    if (opponentPs.board.incomingShots.some(s => s.cell === cell)) {
      return { accepted: false, reason: 'Already fired at that cell' };
    }

    return this.executeFire(state, playerId, opponentId, cell);
  }

  private executeFire(
    state: BSGameState,
    attackerId: string,
    defenderId: string,
    cell: string,
  ): { accepted: boolean; reason?: string } {
    const defenderPs = state.playerStates.get(defenderId)!;

    const { result, sunkShip } = fireShot(defenderPs.board.ships, cell);

    const shot: Shot = { cell, result, sunkShip: sunkShip?.id };
    defenderPs.board.incomingShots.push(shot);

    // Update scores
    if (result === 'hit') {
      state.ctx.addPoints(attackerId, 50); // BS_POINTS_HIT
    }
    if (sunkShip) {
      state.ctx.addPoints(attackerId, 200); // BS_POINTS_SHIP_SUNK
    }

    state.lastShot = { playerId: attackerId, cell, result, sunkShip: sunkShip?.id };
    state.turnNumber++;

    // Check win condition
    if (allShipsSunk(defenderPs.board.ships)) {
      state.winnerId = attackerId;
      state.ctx.stopTimer();
      // Give victory bonus
      state.ctx.addPoints(attackerId, 1000); // BS_POINTS_VICTORY_BONUS
      this.startResult(state.roomId);
      return { accepted: true };
    }

    // Swap active player
    state.activePlayerId = defenderId;

    // Broadcast updated state
    this.broadcastState(state.roomId);
    state.ctx.broadcastPrivateState(pid => this.getPrivateState(state.roomId, pid));

    // Restart turn timer
    state.ctx.stopTimer();
    state.ctx.startTimer(
      BSPhase.BATTLE,
      BS_TURN_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(state.roomId);
        if (!s || s.currentPhase !== BSPhase.BATTLE) return;
        this.autoFireForActivePlayer(s.roomId);
      },
    );

    return { accepted: true };
  }

  private autoPlaceAndStartBattle(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state || state.currentPhase !== BSPhase.SETUP) return;

    // Auto-place for any player not ready
    for (const ps of state.playerStates.values()) {
      if (!ps.isReady) {
        try {
          ps.board.ships = randomPlacement();
          ps.isReady = true;
          state.ctx.log.info('Auto-placed ships for player', { playerId: ps.playerId });
        } catch (e) {
          state.ctx.log.error('Failed to auto-place ships', { playerId: ps.playerId });
        }
      }
    }

    this.startBattle(roomId);
  }

  private startBattle(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;
    if (state.currentPhase !== BSPhase.SETUP) return; // Guard

    state.ctx.stopTimer();
    state.currentPhase = BSPhase.BATTLE;

    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));
    state.ctx.broadcastPrivateState(playerId => this.getPrivateState(roomId, playerId));

    // Start first turn timer
    state.ctx.startTimer(
      BSPhase.BATTLE,
      BS_TURN_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== BSPhase.BATTLE) return;
        this.autoFireForActivePlayer(roomId);
      },
    );

    state.ctx.log.info('Battle started', { roomId, activePlayerId: state.activePlayerId });
  }

  private autoFireForActivePlayer(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state || state.currentPhase !== BSPhase.BATTLE) return;

    const attackerId = state.activePlayerId;
    const defenderId = state.players.find(p => p.id !== attackerId)?.id;
    if (!defenderId) return;

    const defenderPs = state.playerStates.get(defenderId)!;
    const firedCells = defenderPs.board.incomingShots.map(s => s.cell);
    const cell = randomUntargetedCell(firedCells);

    state.ctx.log.info('Auto-firing for idle player', { attackerId, cell });
    this.executeFire(state, attackerId, defenderId, cell);
  }

  private startResult(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.ctx.stopTimer();
    state.currentPhase = BSPhase.RESULT;

    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));
    state.ctx.broadcastPrivateState(playerId => this.getPrivateState(roomId, playerId));

    state.ctx.startTimer(
      BSPhase.RESULT,
      BS_RESULT_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== BSPhase.RESULT) return;
        this.showScores(roomId);
      },
    );
  }

  private showScores(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;
    if (state.currentPhase !== BSPhase.RESULT) return;

    state.ctx.stopTimer();
    state.currentPhase = BSPhase.SCORES;

    state.ctx.broadcastScores();
    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));

    state.ctx.startTimer(
      BSPhase.SCORES,
      BS_SCORES_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== BSPhase.SCORES) return;
        this.endGame(roomId);
      },
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
      gameId: 'battleship',
    });

    state.ctx.setRoomStatus(RoomStatus.GAME_ENDED);
    state.ctx.log.info('Game ended', { roomId, winnerId: winner?.playerId });
  }

  private broadcastState(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;
    state.ctx.broadcastPhase(this.getPhaseState(roomId), this.getPublicState(roomId));
  }
}

export function createModule(definition: GameDefinition): GameModule {
  return new BattleshipModule(definition);
}
