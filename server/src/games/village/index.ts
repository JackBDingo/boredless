import type { GameModule } from '../game-module.js';
import type { GameContext } from '../game-context.js';
import type {
  Player,
  PhaseState,
  GameDefinition,
  VillagePublicState,
  VillagePrivateState,
  VillagePublicPlayer,
  SeerInspectionResult,
  VillageNightTarget,
  VillageVoteTarget,
} from '@boredless/shared';
import {
  GameId,
  PhaseType,
  InputType,
  VillageRole,
  ServerMessageType,
  RoomStatus,
  VOS_ROLE_REVEAL_TIME_SECONDS,
  VOS_NIGHT_TIME_SECONDS,
  VOS_NIGHT_RESULT_TIME_SECONDS,
  VOS_DAY_TIME_SECONDS,
  VOS_VOTE_TIME_SECONDS,
  VOS_VOTE_RESULT_TIME_SECONDS,
  GAME_CATALOG,
} from '@boredless/shared';
import { distributeRoles, type RoleAssignment } from './roles.js';
import { resolveNight, checkWinCondition, type NightAction } from './resolution.js';

/** Internal game state */
interface VillageGameState {
  roomId: string;
  ctx: GameContext;
  players: Player[];
  roleAssignments: RoleAssignment[];
  dayNumber: number;
  currentPhase: PhaseType;

  /** Alive status per player */
  alive: Map<string, boolean>;

  /** Night actions collected this night */
  nightActions: NightAction[];
  /** Which players have submitted night actions */
  nightActedPlayerIds: Set<string>;
  /** Expected night action count */
  expectedNightActions: number;

  /** Day vote tallies */
  dayVotes: Map<string, string>; // voterId → targetPlayerId
  /** Last night's result message */
  nightResultMessage: string | null;
  /** Last vote result message */
  voteResultMessage: string | null;
  /** Last eliminated player info */
  eliminatedPlayerId: string | null;
  eliminatedPlayerName: string | null;
  eliminatedPlayerRole: VillageRole | null;
  /** Seer results per seer (playerId → last result) */
  seerResults: Map<string, SeerInspectionResult>;
  /** Win state */
  winningTeam: 'villagers' | 'werewolves' | null;
}

class VillageModule implements GameModule {
  readonly definition: GameDefinition = GAME_CATALOG.find(g => g.id === GameId.VILLAGE_OF_SHADOWS)!;

  private states = new Map<string, VillageGameState>();

  setup(players: Player[], ctx: GameContext): void {
    const roomId = ctx.roomId;
    const roles = distributeRoles(players);
    const alive = new Map<string, boolean>(players.map(p => [p.id, true]));

    const state: VillageGameState = {
      roomId,
      ctx,
      players: [...players],
      roleAssignments: roles,
      dayNumber: 0,
      currentPhase: PhaseType.VOS_ROLE_REVEAL,
      alive,
      nightActions: [],
      nightActedPlayerIds: new Set(),
      expectedNightActions: 0,
      dayVotes: new Map(),
      nightResultMessage: null,
      voteResultMessage: null,
      eliminatedPlayerId: null,
      eliminatedPlayerName: null,
      eliminatedPlayerRole: null,
      seerResults: new Map(),
      winningTeam: null,
    };

    this.states.set(roomId, state);
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    // Broadcast game started with public state
    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: GameId.VILLAGE_OF_SHADOWS,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send private state to each player (their role)
    for (const player of players) {
      ctx.sendToPlayer(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start role reveal timer then begin first night
    ctx.startTimer(
      PhaseType.VOS_ROLE_REVEAL,
      VOS_ROLE_REVEAL_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s) return;
        this.startNight(roomId);
      },
    );
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) return { phaseType: PhaseType.LOBBY, roundNumber: 0, totalRounds: 0, timerRemainingMs: null, timerTotalMs: null };
    const remaining = state.ctx.getTimerRemaining();
    let timerTotalMs: number | null = null;
    switch (state.currentPhase) {
      case PhaseType.VOS_ROLE_REVEAL: timerTotalMs = VOS_ROLE_REVEAL_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_NIGHT: timerTotalMs = VOS_NIGHT_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_NIGHT_RESULT: timerTotalMs = VOS_NIGHT_RESULT_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_DAY: timerTotalMs = VOS_DAY_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_VOTE: timerTotalMs = VOS_VOTE_TIME_SECONDS * 1000; break;
      case PhaseType.VOS_VOTE_RESULT: timerTotalMs = VOS_VOTE_RESULT_TIME_SECONDS * 1000; break;
    }
    return {
      phaseType: state.currentPhase,
      roundNumber: state.dayNumber,
      totalRounds: 0,
      timerRemainingMs: remaining,
      timerTotalMs,
    };
  }

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const publicPlayers: VillagePublicPlayer[] = state.players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      playerColor: p.color,
      isAlive: state.alive.get(p.id) ?? false,
    }));

    const publicState: VillagePublicState = {
      gameId: 'village_of_shadows',
      dayNumber: state.dayNumber,
      players: publicPlayers,
      nightResultMessage: state.nightResultMessage,
      voteResultMessage: state.voteResultMessage,
      eliminatedPlayerId: state.eliminatedPlayerId,
      eliminatedPlayerName: state.eliminatedPlayerName,
      eliminatedPlayerRole: state.eliminatedPlayerRole,
      votes: state.currentPhase === PhaseType.VOS_VOTE || state.currentPhase === PhaseType.VOS_VOTE_RESULT
        ? this.buildVoteTally(state)
        : null,
      winningTeam: state.winningTeam,
      nightActionsSubmitted: state.nightActedPlayerIds.size,
      nightActionsExpected: state.expectedNightActions,
    };

    return publicState as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const roleAssignment = state.roleAssignments.find(r => r.playerId === playerId);
    if (!roleAssignment) return {};

    const isAlive = state.alive.get(playerId) ?? false;
    const alivePlayers = state.players.filter(p => state.alive.get(p.id));

    // Werewolf teammates
    const werewolfTeammates: string[] = roleAssignment.role === VillageRole.WEREWOLF
      ? state.roleAssignments
          .filter(r => r.role === VillageRole.WEREWOLF && r.playerId !== playerId)
          .map(r => r.playerId)
      : [];

    // Night targets (for active roles during night phase)
    let nightTargets: VillageNightTarget[] | null = null;
    if (state.currentPhase === PhaseType.VOS_NIGHT && isAlive && !state.nightActedPlayerIds.has(playerId)) {
      if (roleAssignment.role === VillageRole.WEREWOLF) {
        // Werewolves target non-werewolf alive players
        nightTargets = alivePlayers
          .filter(p => {
            const role = state.roleAssignments.find(r => r.playerId === p.id);
            return role?.role !== VillageRole.WEREWOLF;
          })
          .map(p => ({ playerId: p.id, playerName: p.name }));
      } else if (roleAssignment.role === VillageRole.SEER || roleAssignment.role === VillageRole.DOCTOR) {
        // Seer/Doctor target any alive player (doctor can protect self)
        nightTargets = alivePlayers
          .filter(p => p.id !== playerId || roleAssignment.role === VillageRole.DOCTOR)
          .map(p => ({ playerId: p.id, playerName: p.name }));
      }
      // Villagers have no night action
    }

    // Vote targets (alive players during vote phase, excluding self)
    let voteTargets: VillageVoteTarget[] | null = null;
    if (state.currentPhase === PhaseType.VOS_VOTE && isAlive && !state.dayVotes.has(playerId)) {
      voteTargets = alivePlayers
        .filter(p => p.id !== playerId)
        .map(p => ({ playerId: p.id, playerName: p.name }));
    }

    const privateState: VillagePrivateState = {
      gameId: 'village_of_shadows',
      role: roleAssignment.role,
      isAlive,
      seerResult: state.seerResults.get(playerId) ?? null,
      hasActed: state.nightActedPlayerIds.has(playerId),
      hasVoted: state.dayVotes.has(playerId),
      werewolfTeammates,
      nightTargets,
      voteTargets,
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

    const isAlive = state.alive.get(playerId) ?? false;
    if (!isAlive) return { accepted: false, reason: 'Dead players cannot act' };

    switch (inputType) {
      case InputType.NIGHT_ACTION:
        return this.handleNightAction(state, playerId, payload);
      case InputType.VOTE:
        return this.handleDayVote(state, playerId, payload);
      default:
        return { accepted: false, reason: 'Invalid input type' };
    }
  }

  teardown(roomId: string): void {
    const state = this.states.get(roomId);
    if (state) {
      state.ctx.stopTimer();
    }
    this.states.delete(roomId);
  }

  // === Private methods ===

  private handleNightAction(
    state: VillageGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== PhaseType.VOS_NIGHT) {
      return { accepted: false, reason: 'Not night phase' };
    }
    if (state.nightActedPlayerIds.has(playerId)) {
      return { accepted: false, reason: 'Already acted this night' };
    }

    const roleAssignment = state.roleAssignments.find(r => r.playerId === playerId);
    if (!roleAssignment) return { accepted: false, reason: 'No role found' };
    if (roleAssignment.role === VillageRole.VILLAGER) {
      return { accepted: false, reason: 'Villagers have no night action' };
    }

    const targetPlayerId = String(payload.targetPlayerId ?? '');
    const isTargetAlive = state.alive.get(targetPlayerId);
    if (!isTargetAlive) return { accepted: false, reason: 'Target is not alive' };

    // Werewolves cannot target other werewolves
    if (roleAssignment.role === VillageRole.WEREWOLF) {
      const targetRole = state.roleAssignments.find(r => r.playerId === targetPlayerId);
      if (targetRole?.role === VillageRole.WEREWOLF) {
        return { accepted: false, reason: 'Cannot target another werewolf' };
      }
    }

    state.nightActions.push({
      playerId,
      role: roleAssignment.role,
      targetPlayerId,
    });
    state.nightActedPlayerIds.add(playerId);

    // Broadcast updated action count
    state.ctx.sendToAll({
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(state.roomId),
      gamePublicState: this.getPublicState(state.roomId),
    });

    // Check if all expected actions received
    if (state.nightActedPlayerIds.size >= state.expectedNightActions) {
      state.ctx.stopTimer();
      this.resolveNightPhase(state.roomId);
    }

    return { accepted: true };
  }

  private handleDayVote(
    state: VillageGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    if (state.currentPhase !== PhaseType.VOS_VOTE) {
      return { accepted: false, reason: 'Not in vote phase' };
    }
    if (state.dayVotes.has(playerId)) {
      return { accepted: false, reason: 'Already voted' };
    }

    const targetPlayerId = String(payload.answerId ?? ''); // answerId is reused for vote target
    if (targetPlayerId === playerId) return { accepted: false, reason: 'Cannot vote for yourself' };
    const isTargetAlive = state.alive.get(targetPlayerId);
    if (!isTargetAlive) return { accepted: false, reason: 'Target is not alive' };

    state.dayVotes.set(playerId, targetPlayerId);

    // Broadcast updated vote count
    state.ctx.sendToAll({
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(state.roomId),
      gamePublicState: this.getPublicState(state.roomId),
    });

    // Check if all alive players voted
    const aliveCount = [...state.alive.values()].filter(Boolean).length;
    if (state.dayVotes.size >= aliveCount) {
      state.ctx.stopTimer();
      this.resolveVote(state.roomId);
    }

    return { accepted: true };
  }

  private startNight(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.dayNumber++;
    state.currentPhase = PhaseType.VOS_NIGHT;
    state.nightActions = [];
    state.nightActedPlayerIds = new Set();
    state.eliminatedPlayerId = null;
    state.eliminatedPlayerName = null;
    state.eliminatedPlayerRole = null;

    // Count how many players have night actions (werewolves, seer, doctor)
    const aliveRoles = state.roleAssignments.filter(r => state.alive.get(r.playerId));
    state.expectedNightActions = aliveRoles.filter(
      r => r.role !== VillageRole.VILLAGER,
    ).length;

    state.ctx.sendToAll({
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send updated private states (with night targets)
    for (const player of state.players.filter(p => state.alive.get(p.id))) {
      state.ctx.sendToPlayer(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    // Start night timer
    state.ctx.startTimer(
      PhaseType.VOS_NIGHT,
      VOS_NIGHT_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== PhaseType.VOS_NIGHT) return;
        this.resolveNightPhase(roomId);
      },
    );
  }

  private resolveNightPhase(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;
    if (state.currentPhase !== PhaseType.VOS_NIGHT) return;

    state.ctx.stopTimer();
    state.currentPhase = PhaseType.VOS_NIGHT_RESULT;

    // Run resolution
    const alivePlayers = state.players
      .filter(p => state.alive.get(p.id))
      .map(p => ({ playerId: p.id, playerName: p.name }));

    const resolution = resolveNight(state.nightActions, state.roleAssignments, alivePlayers);

    // Apply results
    if (resolution.killedPlayerId) {
      state.alive.set(resolution.killedPlayerId, false);
      state.nightResultMessage = `${resolution.killedPlayerName} was found dead in the village.`;
      state.eliminatedPlayerId = resolution.killedPlayerId;
      state.eliminatedPlayerName = resolution.killedPlayerName;
      const killedRole = state.roleAssignments.find(r => r.playerId === resolution.killedPlayerId);
      state.eliminatedPlayerRole = killedRole?.role ?? null;
    } else {
      state.nightResultMessage = 'The village was quiet. No one was killed last night.';
    }

    // Update seer's private state with their result
    if (resolution.seerResult) {
      const seerAssignment = state.roleAssignments.find(r => r.role === VillageRole.SEER);
      if (seerAssignment) {
        state.seerResults.set(seerAssignment.playerId, resolution.seerResult);
      }
    }

    // Check win condition
    const aliveNow = state.players.filter(p => state.alive.get(p.id));
    const winTeam = checkWinCondition(
      aliveNow.map(p => ({ playerId: p.id })),
      state.roleAssignments,
    );

    state.ctx.sendToAll({
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send updated private states
    for (const player of state.players) {
      state.ctx.sendToPlayer(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    if (winTeam) {
      state.ctx.startTimer(
        PhaseType.VOS_NIGHT_RESULT,
        VOS_NIGHT_RESULT_TIME_SECONDS * 1000,
        () => {
          const s = this.states.get(roomId);
          if (!s) return;
          this.endGame(roomId, winTeam);
        },
      );
    } else {
      state.ctx.startTimer(
        PhaseType.VOS_NIGHT_RESULT,
        VOS_NIGHT_RESULT_TIME_SECONDS * 1000,
        () => {
          const s = this.states.get(roomId);
          if (!s || s.currentPhase !== PhaseType.VOS_NIGHT_RESULT) return;
          this.startDay(roomId);
        },
      );
    }
  }

  private startDay(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.ctx.stopTimer();
    state.currentPhase = PhaseType.VOS_DAY;
    state.dayVotes = new Map();
    state.voteResultMessage = null;

    state.ctx.sendToAll({
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    state.ctx.startTimer(
      PhaseType.VOS_DAY,
      VOS_DAY_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== PhaseType.VOS_DAY) return;
        this.startVote(roomId);
      },
    );
  }

  private startVote(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.ctx.stopTimer();
    state.currentPhase = PhaseType.VOS_VOTE;
    state.dayVotes = new Map();

    state.ctx.sendToAll({
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    // Send vote targets to each alive player
    for (const player of state.players.filter(p => state.alive.get(p.id))) {
      state.ctx.sendToPlayer(player.sessionId, {
        type: ServerMessageType.PRIVATE_STATE,
        state: this.getPrivateState(roomId, player.id),
      });
    }

    state.ctx.startTimer(
      PhaseType.VOS_VOTE,
      VOS_VOTE_TIME_SECONDS * 1000,
      () => {
        const s = this.states.get(roomId);
        if (!s || s.currentPhase !== PhaseType.VOS_VOTE) return;
        this.resolveVote(roomId);
      },
    );
  }

  private resolveVote(roomId: string): void {
    const state = this.states.get(roomId);
    if (!state) return;
    if (state.currentPhase !== PhaseType.VOS_VOTE) return;

    state.ctx.stopTimer();
    state.currentPhase = PhaseType.VOS_VOTE_RESULT;

    // Tally votes
    const tally = new Map<string, number>();
    for (const targetId of state.dayVotes.values()) {
      tally.set(targetId, (tally.get(targetId) ?? 0) + 1);
    }

    // Find player with most votes
    let maxVotes = 0;
    let eliminatedId: string | null = null;
    for (const [targetId, count] of tally) {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = targetId;
      }
    }

    // Handle tie (no elimination)
    const maxCount = tally.size > 0 ? Math.max(...tally.values()) : 0;
    const playersWithMax = [...tally.entries()].filter(([, v]) => v === maxCount);

    if (playersWithMax.length > 1 || !eliminatedId || tally.size === 0) {
      state.voteResultMessage = 'The vote was tied. No one was eliminated.';
      state.eliminatedPlayerId = null;
      state.eliminatedPlayerName = null;
      state.eliminatedPlayerRole = null;
    } else {
      const eliminatedPlayer = state.players.find(p => p.id === eliminatedId);
      if (eliminatedPlayer) {
        state.alive.set(eliminatedId, false);
        const role = state.roleAssignments.find(r => r.playerId === eliminatedId);
        state.eliminatedPlayerId = eliminatedId;
        state.eliminatedPlayerName = eliminatedPlayer.name;
        state.eliminatedPlayerRole = role?.role ?? null;
        state.voteResultMessage = `${eliminatedPlayer.name} was eliminated by the village.`;
      }
    }

    // Check win
    const aliveNow = state.players.filter(p => state.alive.get(p.id));
    const winTeam = checkWinCondition(
      aliveNow.map(p => ({ playerId: p.id })),
      state.roleAssignments,
    );

    state.ctx.sendToAll({
      type: ServerMessageType.PHASE_CHANGED,
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });

    if (winTeam) {
      state.ctx.startTimer(
        PhaseType.VOS_VOTE_RESULT,
        VOS_VOTE_RESULT_TIME_SECONDS * 1000,
        () => {
          const s = this.states.get(roomId);
          if (!s) return;
          this.endGame(roomId, winTeam);
        },
      );
    } else {
      state.ctx.startTimer(
        PhaseType.VOS_VOTE_RESULT,
        VOS_VOTE_RESULT_TIME_SECONDS * 1000,
        () => {
          const s = this.states.get(roomId);
          if (!s || s.currentPhase !== PhaseType.VOS_VOTE_RESULT) return;
          this.startNight(roomId);
        },
      );
    }
  }

  private endGame(roomId: string, winTeam: 'villagers' | 'werewolves'): void {
    const state = this.states.get(roomId);
    if (!state) return;

    state.ctx.stopTimer();
    state.currentPhase = PhaseType.GAME_OVER;
    state.winningTeam = winTeam;

    state.ctx.sendToAll({
      type: ServerMessageType.GAME_OVER,
      result: {
        winnerId: null,
        winnerName: null,
        winnerTeam: winTeam,
        finalScores: [],
        gameId: GameId.VILLAGE_OF_SHADOWS,
      },
    });

    state.ctx.setRoomStatus(RoomStatus.GAME_ENDED);
    state.ctx.log.info('Village game ended', { winTeam });
  }

  private buildVoteTally(state: VillageGameState) {
    const tally = new Map<string, string[]>(); // targetId → voterNames
    for (const [voterId, targetId] of state.dayVotes) {
      if (!tally.has(targetId)) tally.set(targetId, []);
      const voter = state.players.find(p => p.id === voterId);
      tally.get(targetId)!.push(voter?.name ?? 'Unknown');
    }

    return [...tally.entries()].map(([targetId, voterNames]) => {
      const target = state.players.find(p => p.id === targetId);
      return {
        targetPlayerId: targetId,
        targetPlayerName: target?.name ?? 'Unknown',
        voteCount: voterNames.length,
        voterNames: state.currentPhase === PhaseType.VOS_VOTE_RESULT ? voterNames : [],
      };
    });
  }
}

export const villageModule = new VillageModule();
