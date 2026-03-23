/**
 * extensions/index.ts — Village of Shadows extension actions.
 *
 * Extension actions (fired by game.yaml on_enter/on_exit declarations):
 *   vos_assign_roles  — assign roles on role_reveal entry
 *   vos_setup_night   — build night targeting lists for each player
 *   vos_setup_vote    — build vote targeting lists for each player
 *   vos_resolve_night — process werewolf kill, seer inspect, doctor save
 *   vos_resolve_vote  — process village vote, eliminate player
 *   vos_check_victory — check win conditions after elimination
 *
 * Design:
 *   - All state is stored in the DeclarativeGameModule's StateManager
 *   - Globals for game-wide state (alive_json, roles_json, etc.)
 *   - Per-player fields for individual state (role, is_alive, night_target, etc.)
 *   - ExtensionActionContext.players gives read access to per-player state
 *   - ExtensionActionContext.setPlayer mutates per-player state (Phase 5.1 API)
 *   - vos_resolve_night reads night_target from each player's state (set by input_gate)
 *   - vos_resolve_vote reads vote_target from each player's state (set by input_gate)
 */

import {
  assignRoles,
  roleHasNightAction,
  VOS_ROLE,
  type VOSRole,
  type VOSRoleAssignment,
} from './role-system.js';

import {
  resolveNight,
  resolveVote,
  checkWinCondition,
  type VOSNightAction,
} from './resolution.js';

// Re-exports for external consumers (tests, game-module.ts)
export { VOS_ROLE, assignRoles, roleHasNightAction } from './role-system.js';
export type { VOSRole, VOSRoleAssignment, RoleDistribution } from './role-system.js';
export { resolveNight, resolveVote, checkWinCondition } from './resolution.js';
export type { VOSNightAction, NightResolution, SeerInspectionResult, VoteResolution } from './resolution.js';

// ---------------------------------------------------------------------------
// Extension declaration
// ---------------------------------------------------------------------------

export const VOS_EXTENSION_DECLARATION = {
  id: 'vos-core',
  name: 'Village of Shadows Core Logic',
  version: '2.0.0',
  type: 'lifecycle' as const,
};

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

/**
 * Context provided to Village of Shadows action handlers.
 * Mirrors ExtensionActionContext with the setPlayer addition.
 */
export interface VOSActionContext {
  /** Current global state snapshot (use setGlobal to mutate). */
  globals: Record<string, unknown>;
  /** Per-player state snapshot: playerId → fieldMap (includes private fields). */
  players: Record<string, Record<string, unknown>>;
  /** Player info (id + name). */
  playerInfo: Array<{ id: string; name: string }>;
  /** Mutate a global state field. */
  setGlobal: (field: string, value: unknown) => void;
  /** Mutate a per-player state field. */
  setPlayer: (playerId: string, field: string, value: unknown) => void;
  /** Log a message (for diagnostics). */
  log: (msg: string, data?: unknown) => void;
}

// ---------------------------------------------------------------------------
// State accessors
// ---------------------------------------------------------------------------

/** Parse role assignments from globals.roles_json */
export function getRoleAssignments(globals: Record<string, unknown>): VOSRoleAssignment[] {
  const json = globals['roles_json'];
  if (typeof json !== 'string' || !json) return [];
  try { return JSON.parse(json) as VOSRoleAssignment[]; } catch { return []; }
}

/** Parse alive map from globals.alive_json */
export function getAliveMap(globals: Record<string, unknown>): Map<string, boolean> {
  const json = globals['alive_json'];
  if (typeof json !== 'string' || !json) return new Map();
  try {
    const parsed = JSON.parse(json) as Record<string, boolean>;
    return new Map(Object.entries(parsed));
  } catch { return new Map(); }
}

// ---------------------------------------------------------------------------
// Action: vos_assign_roles
// ---------------------------------------------------------------------------

/**
 * Distributes roles randomly based on player count.
 * Runs on entry to role_reveal phase.
 */
export function handleAssignRoles(ctx: VOSActionContext): void {
  const playerIds = ctx.playerInfo.map(p => p.id);

  if (playerIds.length < 5 || playerIds.length > 10) {
    ctx.log('[vos] Invalid player count for role assignment', { count: playerIds.length });
    return;
  }

  const assignments = assignRoles(playerIds);

  // Build alive map (all true at start)
  const aliveRecord: Record<string, boolean> = {};
  for (const pid of playerIds) {
    aliveRecord[pid] = true;
  }

  ctx.setGlobal('roles_json', JSON.stringify(assignments));
  ctx.setGlobal('alive_json', JSON.stringify(aliveRecord));

  // Build public players list (no role info)
  const publicPlayers = ctx.playerInfo.map(p => ({
    playerId: p.id,
    playerName: p.name,
    isAlive: true,
  }));
  ctx.setGlobal('public_players_json', JSON.stringify(publicPlayers));

  // Set per-player private state
  for (const assignment of assignments) {
    ctx.setPlayer(assignment.playerId, 'role', assignment.role);
    ctx.setPlayer(assignment.playerId, 'is_alive', true);

    // Give werewolves their teammate list
    if (assignment.role === VOS_ROLE.WEREWOLF) {
      const teammates = assignments
        .filter(a => a.role === VOS_ROLE.WEREWOLF && a.playerId !== assignment.playerId)
        .map(a => a.playerId);
      ctx.setPlayer(assignment.playerId, 'werewolf_teammates_json', JSON.stringify(teammates));
    }
  }

  ctx.log('[vos] Roles assigned', {
    playerCount: playerIds.length,
    wolfCount: assignments.filter(a => a.role === VOS_ROLE.WEREWOLF).length,
  });
}

// ---------------------------------------------------------------------------
// Action: vos_setup_night
// ---------------------------------------------------------------------------

/**
 * Prepares night phase targeting lists for each alive player.
 * Runs on entry to night phase (after day_number increment).
 */
export function handleSetupNight(ctx: VOSActionContext): void {
  const assignments = getRoleAssignments(ctx.globals);
  const aliveMap = getAliveMap(ctx.globals);

  if (assignments.length === 0) {
    ctx.log('[vos] setup_night: no role assignments found');
    return;
  }

  const aliveAssignments = assignments.filter(a => aliveMap.get(a.playerId) === true);
  const alivePlayers = ctx.playerInfo.filter(p => aliveMap.get(p.id) === true);

  // Count expected night actions (non-villager alive players)
  const expectedActions = aliveAssignments.filter(a => roleHasNightAction(a.role)).length;
  ctx.setGlobal('night_actions_expected', expectedActions);

  // Set per-player night targeting lists
  for (const assignment of aliveAssignments) {
    let nightTargets: Array<{ playerId: string; playerName: string }> | null = null;

    if (assignment.role === VOS_ROLE.WEREWOLF) {
      nightTargets = alivePlayers
        .filter(p => {
          const pr = assignments.find(a => a.playerId === p.id);
          return pr?.role !== VOS_ROLE.WEREWOLF;
        })
        .map(p => ({ playerId: p.id, playerName: p.name }));
    } else if (assignment.role === VOS_ROLE.SEER) {
      nightTargets = alivePlayers
        .filter(p => p.id !== assignment.playerId)
        .map(p => ({ playerId: p.id, playerName: p.name }));
    } else if (assignment.role === VOS_ROLE.DOCTOR) {
      nightTargets = alivePlayers.map(p => ({ playerId: p.id, playerName: p.name }));
    }
    // Villagers → null (no night action)

    ctx.setPlayer(
      assignment.playerId,
      'night_targets_json',
      nightTargets !== null ? JSON.stringify(nightTargets) : null,
    );
    // Reset night action submission tracking
    ctx.setPlayer(assignment.playerId, 'has_acted', false);
    ctx.setPlayer(assignment.playerId, 'night_target', null);
  }

  ctx.log('[vos] Night setup complete', {
    expectedActions,
    aliveCount: aliveAssignments.length,
  });
}

// ---------------------------------------------------------------------------
// Action: vos_setup_vote
// ---------------------------------------------------------------------------

/**
 * Prepares vote phase targeting lists.
 * Runs on entry to vote phase.
 */
export function handleSetupVote(ctx: VOSActionContext): void {
  const aliveMap = getAliveMap(ctx.globals);
  const alivePlayers = ctx.playerInfo.filter(p => aliveMap.get(p.id) === true);

  for (const player of alivePlayers) {
    const voteTargets = alivePlayers
      .filter(p => p.id !== player.id)
      .map(p => ({ playerId: p.id, playerName: p.name }));

    ctx.setPlayer(player.id, 'vote_targets_json', JSON.stringify(voteTargets));
    ctx.setPlayer(player.id, 'has_voted', false);
    ctx.setPlayer(player.id, 'vote_target', null);
  }

  ctx.log('[vos] Vote setup complete', { aliveCount: alivePlayers.length });
}

// ---------------------------------------------------------------------------
// Action: vos_resolve_night
// ---------------------------------------------------------------------------

/**
 * Processes night actions submitted by players.
 * Reads per_player.night_target and per_player.role from ctx.players.
 * Runs on entry to night_result phase.
 */
export function handleResolveNight(ctx: VOSActionContext): void {
  const assignments = getRoleAssignments(ctx.globals);
  const aliveMap = getAliveMap(ctx.globals);

  if (assignments.length === 0) {
    ctx.log('[vos] resolve_night: no role assignments');
    return;
  }

  // Build night actions from per-player state (set during input_gate phase)
  const nightActions: VOSNightAction[] = [];
  for (const assignment of assignments) {
    if (aliveMap.get(assignment.playerId) !== true) continue;
    if (!roleHasNightAction(assignment.role)) continue;

    const playerState = ctx.players[assignment.playerId] ?? {};
    const target = playerState['night_target'];
    if (typeof target === 'string' && target) {
      nightActions.push({
        playerId: assignment.playerId,
        role: assignment.role,
        targetPlayerId: target,
      });
    }
  }

  const alivePlayers = ctx.playerInfo
    .filter(p => aliveMap.get(p.id) === true)
    .map(p => ({ playerId: p.id, playerName: p.name }));

  const resolution = resolveNight(nightActions, assignments, alivePlayers);

  // Apply kill
  if (resolution.killedPlayerId) {
    aliveMap.set(resolution.killedPlayerId, false);
    ctx.setPlayer(resolution.killedPlayerId, 'is_alive', false);

    const killedRole = assignments.find(a => a.playerId === resolution.killedPlayerId);
    ctx.setGlobal('night_result_message',
      `${resolution.killedPlayerName} was found dead in the village.`,
    );
    ctx.setGlobal('eliminated_player_id', resolution.killedPlayerId);
    ctx.setGlobal('eliminated_player_name', resolution.killedPlayerName);
    ctx.setGlobal('eliminated_player_role', killedRole?.role ?? null);
  } else {
    ctx.setGlobal('night_result_message',
      'The village was quiet. No one was killed last night.',
    );
    ctx.setGlobal('eliminated_player_id', null);
    ctx.setGlobal('eliminated_player_name', null);
    ctx.setGlobal('eliminated_player_role', null);
  }

  // Update alive map and public player list
  ctx.setGlobal('alive_json', JSON.stringify(Object.fromEntries(aliveMap)));
  ctx.setGlobal('public_players_json', JSON.stringify(
    ctx.playerInfo.map(p => ({
      playerId: p.id,
      playerName: p.name,
      isAlive: aliveMap.get(p.id) ?? false,
    })),
  ));

  // Store seer result in seer's per-player state
  if (resolution.seerResult) {
    const seerAssignment = assignments.find(a => a.role === VOS_ROLE.SEER);
    if (seerAssignment) {
      ctx.setPlayer(
        seerAssignment.playerId,
        'seer_result_json',
        JSON.stringify(resolution.seerResult),
      );
    }
  }

  ctx.log('[vos] Night resolved', {
    actions: nightActions.length,
    killed: resolution.killedPlayerId,
    seerInspected: resolution.seerTargetId,
    doctorProtected: resolution.doctorTargetId,
  });
}

// ---------------------------------------------------------------------------
// Action: vos_resolve_vote
// ---------------------------------------------------------------------------

/**
 * Processes day votes.
 * Reads per_player.vote_target from ctx.players.
 * Runs on entry to vote_result phase.
 */
export function handleResolveVote(ctx: VOSActionContext): void {
  const assignments = getRoleAssignments(ctx.globals);
  const aliveMap = getAliveMap(ctx.globals);

  if (assignments.length === 0) {
    ctx.log('[vos] resolve_vote: no role assignments');
    return;
  }

  // Build vote map from per-player state
  const dayVotes = new Map<string, string>(); // voterId → targetId
  for (const pid of ctx.playerInfo.map(p => p.id)) {
    if (aliveMap.get(pid) !== true) continue;
    const playerState = ctx.players[pid] ?? {};
    const target = playerState['vote_target'];
    if (typeof target === 'string' && target) {
      dayVotes.set(pid, target);
    }
  }

  const allPlayers = ctx.playerInfo.map(p => ({ playerId: p.id, playerName: p.name }));
  const resolution = resolveVote(dayVotes, assignments, allPlayers);

  // Apply elimination
  if (resolution.eliminatedPlayerId) {
    aliveMap.set(resolution.eliminatedPlayerId, false);
    ctx.setPlayer(resolution.eliminatedPlayerId, 'is_alive', false);
    ctx.setGlobal('eliminated_player_id', resolution.eliminatedPlayerId);
    ctx.setGlobal('eliminated_player_name', resolution.eliminatedPlayerName);
    ctx.setGlobal('eliminated_player_role', resolution.eliminatedPlayerRole);
  } else {
    ctx.setGlobal('eliminated_player_id', null);
    ctx.setGlobal('eliminated_player_name', null);
    ctx.setGlobal('eliminated_player_role', null);
  }

  ctx.setGlobal('vote_result_message', resolution.message);
  ctx.setGlobal('vote_tally_json', JSON.stringify(resolution.voteTally));

  // Update alive map and public player list
  ctx.setGlobal('alive_json', JSON.stringify(Object.fromEntries(aliveMap)));
  ctx.setGlobal('public_players_json', JSON.stringify(
    ctx.playerInfo.map(p => ({
      playerId: p.id,
      playerName: p.name,
      isAlive: aliveMap.get(p.id) ?? false,
    })),
  ));

  ctx.log('[vos] Vote resolved', {
    eliminated: resolution.eliminatedPlayerId,
    tied: resolution.isTied,
    voteCount: dayVotes.size,
  });
}

// ---------------------------------------------------------------------------
// Action: vos_check_victory
// ---------------------------------------------------------------------------

/**
 * Checks win conditions after elimination.
 * Sets globals.game_over and globals.winning_team.
 * Runs after vos_resolve_night and vos_resolve_vote.
 */
export function handleCheckVictory(ctx: VOSActionContext): void {
  const assignments = getRoleAssignments(ctx.globals);
  const aliveMap = getAliveMap(ctx.globals);

  if (assignments.length === 0) {
    ctx.log('[vos] check_victory: no role assignments');
    return;
  }

  const alivePlayers = ctx.playerInfo
    .filter(p => aliveMap.get(p.id) === true)
    .map(p => ({ playerId: p.id }));

  const winTeam = checkWinCondition(alivePlayers, assignments);

  if (winTeam) {
    ctx.setGlobal('game_over', true);
    ctx.setGlobal('winning_team', winTeam);
    ctx.log('[vos] Victory condition met', { winner: winTeam });
  } else {
    ctx.setGlobal('game_over', false);
    ctx.log('[vos] No victory yet', { aliveCount: alivePlayers.length });
  }
}

// ---------------------------------------------------------------------------
// Action dispatcher
// ---------------------------------------------------------------------------

export type VOSActionName =
  | 'vos_assign_roles'
  | 'vos_setup_night'
  | 'vos_setup_vote'
  | 'vos_resolve_night'
  | 'vos_resolve_vote'
  | 'vos_check_victory';

export function isVOSAction(actionName: string): actionName is VOSActionName {
  return [
    'vos_assign_roles',
    'vos_setup_night',
    'vos_setup_vote',
    'vos_resolve_night',
    'vos_resolve_vote',
    'vos_check_victory',
  ].includes(actionName);
}

export function dispatchVOSAction(actionName: VOSActionName, ctx: VOSActionContext): void {
  switch (actionName) {
    case 'vos_assign_roles':    handleAssignRoles(ctx);    break;
    case 'vos_setup_night':     handleSetupNight(ctx);     break;
    case 'vos_setup_vote':      handleSetupVote(ctx);      break;
    case 'vos_resolve_night':   handleResolveNight(ctx);   break;
    case 'vos_resolve_vote':    handleResolveVote(ctx);    break;
    case 'vos_check_victory':   handleCheckVictory(ctx);   break;
    default:
      console.warn('[vos-extensions] Unknown action:', actionName);
  }
}
