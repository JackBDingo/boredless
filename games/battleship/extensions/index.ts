/**
 * extensions/index.ts — Battleship extension registration.
 *
 * This module is the entry point for the battleship-core extension package.
 * It exports:
 *   1. Extension metadata matching game.yaml extensions section
 *   2. BattleshipActionContext — typed state access for extension functions
 *   3. Phase lifecycle action handlers (bs_init_boards, bs_start_battle, bs_broadcast_scores)
 *   4. Input handlers (handleSetupConfirm, handleFireShot)
 *   5. Auto-play helpers (autoPlace, autoFire)
 *
 * Architecture Note:
 *   Battleship's input routing requires a thin wrapper module (game-module.ts)
 *   because the battle phase has per-turn active-player logic that the
 *   declarative input_gate primitive cannot express. The wrapper intercepts
 *   handleInput and delegates to these pure extension functions.
 *
 *   All functions are pure TypeScript with no runtime subsystem imports.
 *   They receive typed state snapshots and return mutations via context methods.
 */

import {
  validatePlacement,
  randomPlacement,
  fireShot,
  allShipsSunk,
  randomUntargetedCell,
  BS_FLEET,
} from './board.js';

import type { PlacedShip, Shot, DisplayBoard, Ship } from './board.js';

export { PlacedShip, Shot, DisplayBoard, Ship };

// ---------------------------------------------------------------------------
// Extension declaration (mirrors game.yaml extensions section)
// ---------------------------------------------------------------------------

export const BATTLESHIP_EXTENSION_DECLARATION = {
  id: 'battleship-core',
  name: 'Battleship Core Logic',
  version: '2.0.0',
  type: 'lifecycle' as const,
  description:
    'Implements ship placement validation, shot processing, sunk detection, turn management, and auto-play fallback.',
  entryPoint: './extensions/index.ts',
};

// ---------------------------------------------------------------------------
// State serialisation helpers
// ---------------------------------------------------------------------------

export function parseShips(json: unknown): PlacedShip[] {
  if (typeof json !== 'string' || !json) return [];
  try {
    const parsed = JSON.parse(json) as PlacedShip[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseShots(json: unknown): Shot[] {
  if (typeof json !== 'string' || !json) return [];
  try {
    const parsed = JSON.parse(json) as Shot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parsePlayerOrder(json: unknown): string[] {
  if (typeof json !== 'string' || !json) return [];
  try {
    const parsed = JSON.parse(json) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseReadyStatus(json: unknown): Record<string, boolean> {
  if (typeof json !== 'string' || !json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, boolean>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Action handler context
// ---------------------------------------------------------------------------

/**
 * Context provided to Battleship action handlers.
 * Mirrors the interpreter's ExtensionActionContext but scoped to Battleship's needs.
 */
export interface BattleshipActionContext {
  /** Room ID */
  roomId: string;
  /** Stable player list */
  players: Array<{ id: string; name: string }>;
  /** Current global state (read-only snapshot — use setGlobal to mutate) */
  globals: Record<string, unknown>;
  /** Per-player state (read-only snapshot) */
  playerState: Record<string, Record<string, unknown>>;
  /** Mutate a global state field */
  setGlobal: (field: string, value: unknown) => void;
  /** Mutate a per-player state field */
  setPlayer: (playerId: string, field: string, value: unknown) => void;
  /** Get a player's current score */
  getScore: (playerId: string) => number;
  /** Award points to a player */
  addPoints: (playerId: string, amount: number) => void;
  /** Log a message */
  log: (msg: string, data?: unknown) => void;
}

// ---------------------------------------------------------------------------
// Scoring constants (match game.yaml scoring section)
// ---------------------------------------------------------------------------

const BS_POINTS_HIT = 50;
const BS_POINTS_SHIP_SUNK = 200;
const BS_POINTS_VICTORY_BONUS = 1000;

// ---------------------------------------------------------------------------
// Phase lifecycle action handlers
// ---------------------------------------------------------------------------

/**
 * bs_init_boards
 *
 * Called on_enter of the setup phase.
 * Initialises per-player board state (empty ships + shots) and stores
 * the stable player order in globals so we can build consistent public state.
 */
export function handleInitBoards(ctx: BattleshipActionContext): void {
  const playerIds = ctx.players.map(p => p.id);

  // Store stable player order
  ctx.setGlobal('player_order_json', JSON.stringify(playerIds));

  // Initialise board state for each player
  for (const playerId of playerIds) {
    ctx.setPlayer(playerId, 'ships_json', JSON.stringify([]));
    ctx.setPlayer(playerId, 'incoming_shots_json', JSON.stringify([]));
    ctx.setPlayer(playerId, 'is_ready', false);
  }

  // Initialise ready status
  const readyStatus: Record<string, boolean> = {};
  for (const id of playerIds) readyStatus[id] = false;
  ctx.setGlobal('ready_status_json', JSON.stringify(readyStatus));
  ctx.setGlobal('turn_number', 0);
  ctx.setGlobal('winner_id', null);
  ctx.setGlobal('last_shot_json', null);

  ctx.log('[battleship] Boards initialised', { playerCount: playerIds.length });
}

/**
 * bs_start_battle
 *
 * Called on_enter of the battle phase.
 * Picks a random starting player and stores in globals.active_player_id.
 */
export function handleStartBattle(ctx: BattleshipActionContext): void {
  const playerIds = ctx.players.map(p => p.id);
  const startingPlayer = playerIds[Math.floor(Math.random() * playerIds.length)]!;
  ctx.setGlobal('active_player_id', startingPlayer);
  ctx.log('[battleship] Battle started', { activePlayerId: startingPlayer });
}

/**
 * bs_broadcast_scores
 *
 * Called on_enter of the scores phase.
 * No-op in extension (GameContext.broadcastScores() is called by the wrapper module).
 */
export function handleBroadcastScores(ctx: BattleshipActionContext): void {
  ctx.log('[battleship] Scores phase entered');
}

// ---------------------------------------------------------------------------
// Custom action dispatcher
// ---------------------------------------------------------------------------

export type BattleshipActionName =
  | 'bs_init_boards'
  | 'bs_start_battle'
  | 'bs_broadcast_scores';

export function isBattleshipAction(actionName: string): actionName is BattleshipActionName {
  return ['bs_init_boards', 'bs_start_battle', 'bs_broadcast_scores'].includes(actionName);
}

export function dispatchBattleshipAction(
  actionName: BattleshipActionName,
  ctx: BattleshipActionContext,
): void {
  switch (actionName) {
    case 'bs_init_boards':
      handleInitBoards(ctx);
      break;
    case 'bs_start_battle':
      handleStartBattle(ctx);
      break;
    case 'bs_broadcast_scores':
      handleBroadcastScores(ctx);
      break;
    default:
      ctx.log('[battleship] Unknown action', { actionName });
  }
}

// ---------------------------------------------------------------------------
// Input handler: setup confirm (ship placement)
// ---------------------------------------------------------------------------

export interface SetupConfirmResult {
  accepted: boolean;
  reason?: string;
  /** True if both players are now ready (caller should advance phase) */
  allReady: boolean;
}

/**
 * Handle a player confirming their ship placement.
 *
 * @param ctx        - Action context providing state access
 * @param playerId   - The player submitting their placement
 * @param ships      - The PlacedShip[] payload from the client
 */
export function handleSetupConfirm(
  ctx: BattleshipActionContext,
  playerId: string,
  ships: PlacedShip[],
): SetupConfirmResult {
  // Check already ready
  const isReady = ctx.playerState[playerId]?.['is_ready'];
  if (isReady === true) {
    return { accepted: false, reason: 'Already ready', allReady: false };
  }

  // Normalize: remove any existing hits/sunk data from client payload
  const normalizedShips: PlacedShip[] = ships.map(s => ({
    shipId: s.shipId,
    cells: s.cells,
    hits: [],
    sunk: false,
  }));

  const error = validatePlacement(normalizedShips);
  if (error) {
    return { accepted: false, reason: error, allReady: false };
  }

  // Store ships
  ctx.setPlayer(playerId, 'ships_json', JSON.stringify(normalizedShips));
  ctx.setPlayer(playerId, 'is_ready', true);

  // Update ready status
  const readyStatus = parseReadyStatus(ctx.globals['ready_status_json']);
  readyStatus[playerId] = true;
  ctx.setGlobal('ready_status_json', JSON.stringify(readyStatus));

  ctx.log('[battleship] Player placed ships', { playerId, shipCount: normalizedShips.length });

  // Check if all players are ready
  const playerIds = ctx.players.map(p => p.id);
  const allReady = playerIds.every(id => readyStatus[id] === true);

  return { accepted: true, allReady };
}

// ---------------------------------------------------------------------------
// Auto-place: fill in ships for any player who is not ready
// ---------------------------------------------------------------------------

/**
 * Auto-place ships for any player who hasn't submitted their fleet.
 * Returns whether any players were auto-placed.
 */
export function autoPlaceAll(ctx: BattleshipActionContext): void {
  for (const player of ctx.players) {
    const isReady = ctx.playerState[player.id]?.['is_ready'];
    if (isReady !== true) {
      try {
        const ships = randomPlacement();
        ctx.setPlayer(player.id, 'ships_json', JSON.stringify(ships));
        ctx.setPlayer(player.id, 'is_ready', true);

        const readyStatus = parseReadyStatus(ctx.globals['ready_status_json']);
        readyStatus[player.id] = true;
        ctx.setGlobal('ready_status_json', JSON.stringify(readyStatus));

        ctx.log('[battleship] Auto-placed ships for player', { playerId: player.id });
      } catch (err) {
        ctx.log('[battleship] Failed to auto-place ships', { playerId: player.id, err: String(err) });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Input handler: fire shot (battle phase)
// ---------------------------------------------------------------------------

export interface FireShotResult {
  accepted: boolean;
  reason?: string;
  /** True if the game is over (all opponent ships sunk) */
  gameOver: boolean;
  /** The winner's player ID, if game is over */
  winnerId?: string;
  /** The shot that was fired */
  shot?: Shot;
}

/**
 * Handle a player firing a shot during the battle phase.
 *
 * @param ctx      - Action context providing state access
 * @param playerId - The player firing the shot
 * @param cell     - The target cell (e.g. "B5")
 */
export function handleFireShot(
  ctx: BattleshipActionContext,
  playerId: string,
  cell: string,
): FireShotResult {
  // Validate active player
  const activePlayerId = String(ctx.globals['active_player_id'] ?? '');
  if (activePlayerId !== playerId) {
    return { accepted: false, reason: 'Not your turn', gameOver: false };
  }

  // Validate cell format
  const normalizedCell = cell.toUpperCase().trim();
  if (!normalizedCell.match(/^[A-J]([1-9]|10)$/)) {
    return { accepted: false, reason: 'Invalid cell format', gameOver: false };
  }

  // Find opponent
  const opponentId = ctx.players.find(p => p.id !== playerId)?.id;
  if (!opponentId) {
    return { accepted: false, reason: 'No opponent found', gameOver: false };
  }

  // Load opponent's board
  const opponentShips = parseShips(ctx.playerState[opponentId]?.['ships_json']);
  const opponentShots = parseShots(ctx.playerState[opponentId]?.['incoming_shots_json']);

  // Check already fired at this cell
  if (opponentShots.some(s => s.cell === normalizedCell)) {
    return { accepted: false, reason: 'Already fired at that cell', gameOver: false };
  }

  // Fire the shot (mutates opponentShips in place)
  const { result, sunkShip } = fireShot(opponentShips, normalizedCell);

  const shot: Shot = {
    cell: normalizedCell,
    result,
    sunkShip: sunkShip?.id,
  };

  // Update opponent's board state
  opponentShots.push(shot);
  ctx.setPlayer(opponentId, 'incoming_shots_json', JSON.stringify(opponentShots));
  ctx.setPlayer(opponentId, 'ships_json', JSON.stringify(opponentShips));

  // Award points
  if (result === 'hit') {
    ctx.addPoints(playerId, BS_POINTS_HIT);
  }
  if (sunkShip) {
    ctx.addPoints(playerId, BS_POINTS_SHIP_SUNK);
    ctx.log('[battleship] Ship sunk', { playerId, sunkShip: sunkShip.id });
  }

  // Update last shot and turn number
  const turnNumber = (Number(ctx.globals['turn_number']) || 0) + 1;
  ctx.setGlobal('turn_number', turnNumber);
  ctx.setGlobal('last_shot_json', JSON.stringify({
    playerId,
    cell: normalizedCell,
    result,
    sunkShip: sunkShip?.id,
  }));

  ctx.log('[battleship] Shot fired', { playerId, cell: normalizedCell, result });

  // Check win condition
  if (allShipsSunk(opponentShips)) {
    ctx.addPoints(playerId, BS_POINTS_VICTORY_BONUS);
    ctx.setGlobal('winner_id', playerId);
    ctx.log('[battleship] Game over', { winnerId: playerId });
    return { accepted: true, gameOver: true, winnerId: playerId, shot };
  }

  // Swap active player
  ctx.setGlobal('active_player_id', opponentId);

  return { accepted: true, gameOver: false, shot };
}

// ---------------------------------------------------------------------------
// Auto-fire: fire a random shot for the idle active player
// ---------------------------------------------------------------------------

/**
 * Auto-fire a random shot for the currently active player.
 * Used when a turn timer expires.
 */
export function autoFire(ctx: BattleshipActionContext): FireShotResult {
  const attackerId = String(ctx.globals['active_player_id'] ?? '');
  if (!attackerId) {
    return { accepted: false, reason: 'No active player', gameOver: false };
  }

  const defenderId = ctx.players.find(p => p.id !== attackerId)?.id;
  if (!defenderId) {
    return { accepted: false, reason: 'No opponent', gameOver: false };
  }

  const defenderShots = parseShots(ctx.playerState[defenderId]?.['incoming_shots_json']);
  const firedCells = defenderShots.map(s => s.cell);
  const cell = randomUntargetedCell(firedCells);

  ctx.log('[battleship] Auto-firing', { attackerId, cell });
  return handleFireShot(ctx, attackerId, cell);
}

// ---------------------------------------------------------------------------
// Public state builder
// ---------------------------------------------------------------------------

export interface BattleshipPublicState {
  gameId: 'battleship';
  player1: { playerId: string; playerName: string; board: DisplayBoard };
  player2: { playerId: string; playerName: string; board: DisplayBoard };
  activePlayerId: string | null;
  lastShot: {
    playerId: string;
    cell: string;
    result: 'hit' | 'miss';
    sunkShip?: string;
  } | null;
  turnNumber: number;
  readyStatus?: Record<string, boolean>;
}

/**
 * Build the public game state for the display (TV) screen.
 * Hides ship positions; shows only hits/misses/sunk ships on each board.
 */
export function buildPublicState(
  ctx: BattleshipActionContext,
  phase: string,
): BattleshipPublicState {
  const playerOrder = parsePlayerOrder(ctx.globals['player_order_json']);
  const [p1Id, p2Id] = playerOrder.length >= 2
    ? [playerOrder[0]!, playerOrder[1]!]
    : [ctx.players[0]?.id ?? '', ctx.players[1]?.id ?? ''];

  const p1Name = ctx.players.find(p => p.id === p1Id)?.name ?? p1Id;
  const p2Name = ctx.players.find(p => p.id === p2Id)?.name ?? p2Id;

  const p1Ships = parseShips(ctx.playerState[p1Id]?.['ships_json']);
  const p1Shots = parseShots(ctx.playerState[p1Id]?.['incoming_shots_json']);
  const p2Ships = parseShips(ctx.playerState[p2Id]?.['ships_json']);
  const p2Shots = parseShots(ctx.playerState[p2Id]?.['incoming_shots_json']);

  const lastShotJson = ctx.globals['last_shot_json'];
  let lastShot: BattleshipPublicState['lastShot'] = null;
  if (typeof lastShotJson === 'string' && lastShotJson) {
    try {
      lastShot = JSON.parse(lastShotJson) as BattleshipPublicState['lastShot'];
    } catch {
      lastShot = null;
    }
  }

  const readyStatus = phase === 'setup'
    ? parseReadyStatus(ctx.globals['ready_status_json'])
    : undefined;

  return {
    gameId: 'battleship',
    player1: {
      playerId: p1Id,
      playerName: p1Name,
      board: buildDisplayBoard(p1Ships, p1Shots),
    },
    player2: {
      playerId: p2Id,
      playerName: p2Name,
      board: buildDisplayBoard(p2Ships, p2Shots),
    },
    activePlayerId: typeof ctx.globals['active_player_id'] === 'string'
      ? ctx.globals['active_player_id']
      : null,
    lastShot,
    turnNumber: typeof ctx.globals['turn_number'] === 'number'
      ? ctx.globals['turn_number']
      : 0,
    readyStatus,
  };
}

function buildDisplayBoard(ships: PlacedShip[], incomingShots: Shot[]): DisplayBoard {
  const sunkShips = ships.filter(s => s.sunk);
  return {
    hits: incomingShots.filter(s => s.result === 'hit').map(s => s.cell),
    misses: incomingShots.filter(s => s.result === 'miss').map(s => s.cell),
    sunkShips,
    shipsRemaining: ships.length - sunkShips.length,
  };
}

// ---------------------------------------------------------------------------
// Private state builder
// ---------------------------------------------------------------------------

export interface BattleshipPrivateState {
  gameId: 'battleship';
  phase: string;
  isActivePlayer: boolean;
  myBoard: {
    ships: PlacedShip[];
    incomingShots: Shot[];
  };
  opponentBoard: {
    hits: string[];
    misses: string[];
    sunkShips: PlacedShip[];
  };
  availableShips?: Ship[];
  placedShips?: PlacedShip[];
  isReady?: boolean;
  firedCells?: string[];
}

/**
 * Build the private state for an individual player's phone.
 * Includes their own ship positions (private) and what they know
 * about the opponent's board (hits/misses/sunk only).
 */
export function buildPrivateState(
  ctx: BattleshipActionContext,
  playerId: string,
  phase: string,
): BattleshipPrivateState {
  const myShips = parseShips(ctx.playerState[playerId]?.['ships_json']);
  const myIncomingShots = parseShots(ctx.playerState[playerId]?.['incoming_shots_json']);

  const opponentId = ctx.players.find(p => p.id !== playerId)?.id;
  const opponentShips = opponentId
    ? parseShips(ctx.playerState[opponentId]?.['ships_json'])
    : [];
  const opponentIncomingShots = opponentId
    ? parseShots(ctx.playerState[opponentId]?.['incoming_shots_json'])
    : [];

  // My shots on opponent board = opponent's incoming shots (all from me in 2-player)
  const myHits = opponentIncomingShots.filter(s => s.result === 'hit').map(s => s.cell);
  const myMisses = opponentIncomingShots.filter(s => s.result === 'miss').map(s => s.cell);
  const opponentSunkShips = opponentShips.filter(s => s.sunk);

  const activePlayerId = String(ctx.globals['active_player_id'] ?? '');

  // Setup phase extras
  const availableShips = phase === 'setup'
    ? BS_FLEET
        .filter(f => !myShips.some(s => s.shipId === f.id))
        .map(f => ({ id: f.id, name: f.name, size: f.size }))
    : undefined;

  const isReadyVal = ctx.playerState[playerId]?.['is_ready'];

  return {
    gameId: 'battleship',
    phase,
    isActivePlayer: activePlayerId === playerId,
    myBoard: {
      ships: myShips,
      incomingShots: myIncomingShots,
    },
    opponentBoard: {
      hits: myHits,
      misses: myMisses,
      sunkShips: opponentSunkShips,
    },
    availableShips,
    placedShips: phase === 'setup' ? myShips : undefined,
    isReady: phase === 'setup' ? Boolean(isReadyVal) : undefined,
    firedCells: phase === 'battle'
      ? opponentIncomingShots.map(s => s.cell)
      : undefined,
  };
}
