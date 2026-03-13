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

import { WCPhase } from '../phases.js';
import { isValidWord } from './dictionary.js';
import {
  WC_BOARD_SIZE,
  WC_RACK_SIZE,
  WC_ALL_TILES_BONUS,
  WC_STARTING_TIME_SECONDS,
  WC_PLAYING_TIME_SECONDS,
  WC_WORD_REVEAL_TIME_SECONDS,
  WC_SCORES_TIME_SECONDS,
  TILE_DISTRIBUTION,
  getPremium,
} from '../constants.js';
import type {
  Tile,
  BoardCell,
  PlacedTile,
  WCPublicState,
  WCPrivateState,
  WCPlayerInfo,
  LastWordResult,
} from '../types.js';

// ============================================================
// Tile bag helpers
// ============================================================

let tileCounter = 0;

function createTileBag(): Tile[] {
  tileCounter = 0;
  const bag: Tile[] = [];
  for (const entry of TILE_DISTRIBUTION) {
    for (let i = 0; i < entry.count; i++) {
      bag.push({
        id: `tile-${tileCounter++}`,
        letter: entry.letter,
        points: entry.points,
        isBlank: entry.letter === '',
      });
    }
  }
  return shuffleBag(bag);
}

function shuffleBag(bag: Tile[]): Tile[] {
  const arr = [...bag];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

function drawTiles(bag: Tile[], count: number): Tile[] {
  return bag.splice(0, Math.min(count, bag.length));
}

// ============================================================
// Board initialisation
// ============================================================

function createBoard(): BoardCell[][] {
  const board: BoardCell[][] = [];
  for (let r = 0; r < WC_BOARD_SIZE; r++) {
    const row: BoardCell[] = [];
    for (let c = 0; c < WC_BOARD_SIZE; c++) {
      row.push({
        tile: null,
        premium: getPremium(r, c),
        premiumUsed: false,
      });
    }
    board.push(row);
  }
  return board;
}

// ============================================================
// Internal types
// ============================================================

interface InternalPlayer {
  playerId: string;
  playerName: string;
  score: number;
  rack: Tile[];
  connected: boolean;
}

interface WCGameState {
  roomId: string;
  ctx: GameContext;

  players: InternalPlayer[];
  turnOrder: string[];
  currentPlayerIndex: number;
  currentPhase: string;
  roundNumber: number;
  consecutivePasses: number;

  board: BoardCell[][];
  bag: Tile[];

  lastWord: LastWordResult | null;

  phaseAdvancing: boolean;
}

// ============================================================
// Validation helpers
// ============================================================

interface WordCell {
  row: number;
  col: number;
  letter: string;
  points: number;
  isNewTile: boolean;
}

interface PlacementValidation {
  valid: boolean;
  reason?: string;
  mainWord?: WordCell[];
  crossWords?: WordCell[][];
}

function tilesOwnedByPlayer(rack: Tile[], placed: PlacedTile[]): boolean {
  const rackCopy = [...rack];
  for (const pt of placed) {
    const idx = rackCopy.findIndex(t => t.id === pt.tileId);
    if (idx === -1) return false;
    rackCopy.splice(idx, 1);
  }
  return true;
}

function boardIsEmpty(board: BoardCell[][]): boolean {
  for (let r = 0; r < WC_BOARD_SIZE; r++) {
    for (let c = 0; c < WC_BOARD_SIZE; c++) {
      if (board[r]![c]!.tile !== null) return false;
    }
  }
  return true;
}

function validatePlacement(
  board: BoardCell[][],
  placed: PlacedTile[],
  rack: Tile[],
): PlacementValidation {
  if (placed.length === 0) {
    return { valid: false, reason: 'No tiles placed' };
  }

  if (!tilesOwnedByPlayer(rack, placed)) {
    return { valid: false, reason: 'Placed tiles not in your rack' };
  }

  for (const pt of placed) {
    if (pt.row < 0 || pt.row >= WC_BOARD_SIZE || pt.col < 0 || pt.col >= WC_BOARD_SIZE) {
      return { valid: false, reason: 'Tile placed out of bounds' };
    }
    if (board[pt.row]![pt.col]!.tile !== null) {
      return { valid: false, reason: `Cell (${pt.row},${pt.col}) is already occupied` };
    }
  }

  const posSet = new Set(placed.map(p => `${p.row},${p.col}`));
  if (posSet.size !== placed.length) {
    return { valid: false, reason: 'Duplicate tile positions' };
  }

  const rows = [...new Set(placed.map(p => p.row))];
  const cols = [...new Set(placed.map(p => p.col))];
  const isHorizontal = rows.length === 1;
  const isVertical = cols.length === 1;

  if (!isHorizontal && !isVertical) {
    return { valid: false, reason: 'Tiles must be placed in a straight line' };
  }

  // Helper: resolve a cell's letter from placed tiles (if new) or existing board tile
  function getCellForWord(r: number, c: number, placedTile: PlacedTile | undefined): WordCell | null {
    if (placedTile) {
      const tileInRack = rack.find(t => t.id === placedTile.tileId)!;
      return { row: r, col: c, letter: placedTile.letter, points: tileInRack.points, isNewTile: true };
    }
    const existing = board[r]![c]!;
    if (existing.tile !== null) {
      return { row: r, col: c, letter: existing.tile.letter, points: existing.tile.points, isNewTile: false };
    }
    return null;
  }

  const mainWord: WordCell[] = [];

  if (isHorizontal) {
    const row = rows[0]!;
    let minCol = Math.min(...placed.map(p => p.col));
    let maxCol = Math.max(...placed.map(p => p.col));

    // Extend left to include contiguous existing tiles
    while (minCol > 0 && board[row]![minCol - 1]!.tile !== null) {
      minCol--;
    }
    // Extend right to include contiguous existing tiles
    while (maxCol < WC_BOARD_SIZE - 1 && board[row]![maxCol + 1]!.tile !== null) {
      maxCol++;
    }

    for (let c = minCol; c <= maxCol; c++) {
      const newTile = placed.find(p => p.col === c && p.row === row);
      const cell = getCellForWord(row, c, newTile);
      if (cell) {
        mainWord.push(cell);
      } else {
        return { valid: false, reason: `Gap at (${row},${c}) not filled by existing tile` };
      }
    }
  } else {
    const col = cols[0]!;
    let minRow = Math.min(...placed.map(p => p.row));
    let maxRow = Math.max(...placed.map(p => p.row));

    // Extend upward to include contiguous existing tiles
    while (minRow > 0 && board[minRow - 1]![col]!.tile !== null) {
      minRow--;
    }
    // Extend downward to include contiguous existing tiles
    while (maxRow < WC_BOARD_SIZE - 1 && board[maxRow + 1]![col]!.tile !== null) {
      maxRow++;
    }

    for (let r = minRow; r <= maxRow; r++) {
      const newTile = placed.find(p => p.row === r && p.col === col);
      const cell = getCellForWord(r, col, newTile);
      if (cell) {
        mainWord.push(cell);
      } else {
        return { valid: false, reason: `Gap at (${r},${col}) not filled by existing tile` };
      }
    }
  }

  if (mainWord.length < 2) {
    return { valid: false, reason: 'Word must be at least 2 letters' };
  }

  // Collect cross-words: for each newly placed tile, check if it forms a perpendicular word
  const crossWords: WordCell[][] = [];

  for (const pt of placed) {
    const crossWord: WordCell[] = [];

    if (isHorizontal) {
      // Check for vertical cross-word at this column
      let minRow = pt.row;
      let maxRow = pt.row;
      while (minRow > 0 && board[minRow - 1]![pt.col]!.tile !== null) minRow--;
      while (maxRow < WC_BOARD_SIZE - 1 && board[maxRow + 1]![pt.col]!.tile !== null) maxRow++;

      if (minRow < maxRow) {
        // There is a vertical word here
        for (let r = minRow; r <= maxRow; r++) {
          if (r === pt.row) {
            const tileInRack = rack.find(t => t.id === pt.tileId)!;
            crossWord.push({ row: r, col: pt.col, letter: pt.letter, points: tileInRack.points, isNewTile: true });
          } else {
            const existing = board[r]![pt.col]!;
            if (existing.tile !== null) {
              crossWord.push({ row: r, col: pt.col, letter: existing.tile.letter, points: existing.tile.points, isNewTile: false });
            }
          }
        }
        if (crossWord.length >= 2) {
          crossWords.push(crossWord);
        }
      }
    } else {
      // isVertical — check for horizontal cross-word at this row
      let minCol = pt.col;
      let maxCol = pt.col;
      while (minCol > 0 && board[pt.row]![minCol - 1]!.tile !== null) minCol--;
      while (maxCol < WC_BOARD_SIZE - 1 && board[pt.row]![maxCol + 1]!.tile !== null) maxCol++;

      if (minCol < maxCol) {
        // There is a horizontal word here
        for (let c = minCol; c <= maxCol; c++) {
          if (c === pt.col) {
            const tileInRack = rack.find(t => t.id === pt.tileId)!;
            crossWord.push({ row: pt.row, col: c, letter: pt.letter, points: tileInRack.points, isNewTile: true });
          } else {
            const existing = board[pt.row]![c]!;
            if (existing.tile !== null) {
              crossWord.push({ row: pt.row, col: c, letter: existing.tile.letter, points: existing.tile.points, isNewTile: false });
            }
          }
        }
        if (crossWord.length >= 2) {
          crossWords.push(crossWord);
        }
      }
    }
  }

  const empty = boardIsEmpty(board);

  if (empty) {
    const crossesCenter = mainWord.some(c => c.row === 7 && c.col === 7);
    if (!crossesCenter) {
      return { valid: false, reason: 'First word must cross the center square (7,7)' };
    }
  } else {
    // Must connect: at least one cell in mainWord is an existing tile (not new),
    // or a newly placed tile is adjacent to an existing tile
    const connectsToExisting =
      mainWord.some(c => !c.isNewTile) ||
      crossWords.length > 0 ||
      placed.some(pt => {
        const neighbors = [
          board[pt.row - 1]?.[pt.col],
          board[pt.row + 1]?.[pt.col],
          board[pt.row]?.[pt.col - 1],
          board[pt.row]?.[pt.col + 1],
        ];
        return neighbors.some(cell => cell !== undefined && cell.tile !== null);
      });

    if (!connectsToExisting) {
      return { valid: false, reason: 'Word must connect to an existing tile on the board' };
    }
  }

  return { valid: true, mainWord, crossWords };
}

// ============================================================
// Scoring
// ============================================================

function scoreWord(board: BoardCell[][], wordCells: WordCell[]): number {
  let wordScore = 0;
  let wordMultiplier = 1;

  for (const cell of wordCells) {
    const boardCell = board[cell.row]![cell.col]!;
    let letterScore = cell.points;

    if (cell.isNewTile && !boardCell.premiumUsed) {
      const premium = boardCell.premium;
      if (premium === 'DL') {
        letterScore *= 2;
      } else if (premium === 'TL') {
        letterScore *= 3;
      } else if (premium === 'DW') {
        wordMultiplier *= 2;
      } else if (premium === 'TW') {
        wordMultiplier *= 3;
      }
    }

    wordScore += letterScore;
  }

  return wordScore * wordMultiplier;
}

// ============================================================
// Apply placement to board (mutates)
// ============================================================

function applyPlacement(board: BoardCell[][], placed: PlacedTile[], rack: Tile[]): void {
  for (const pt of placed) {
    const tileInRack = rack.find(t => t.id === pt.tileId)!;
    const cell = board[pt.row]![pt.col]!;

    cell.tile = {
      id: tileInRack.id,
      letter: pt.letter,
      points: tileInRack.points,
      isBlank: tileInRack.isBlank,
    };

    if (cell.premium !== null && !cell.premiumUsed) {
      cell.premiumUsed = true;
    }
  }
}

// ============================================================
// Game over check
// ============================================================

function isGameOver(state: WCGameState): boolean {
  if (state.consecutivePasses >= state.players.length * 2) {
    return true;
  }
  if (state.bag.length === 0 && state.players.some(p => p.rack.length === 0)) {
    return true;
  }
  return false;
}

function applyEndGamePenalties(state: WCGameState): void {
  for (const player of state.players) {
    const penalty = player.rack.reduce((sum, t) => sum + t.points, 0);
    player.score = Math.max(0, player.score - penalty);
  }
}

// ============================================================
// Main module class
// ============================================================

class WordCraftModule implements GameModule {
  readonly definition: GameDefinition;
  private states = new Map<string, WCGameState>();

  constructor(definition: GameDefinition) {
    this.definition = definition;
  }

  // ===== GameModule interface =====

  setup(players: Player[], ctx: GameContext): void {
    const roomId = ctx.roomId;
    tileCounter = 0;

    const bag = createTileBag();

    const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
    const turnOrder = shuffledPlayers.map(p => p.id);

    const internalPlayers: InternalPlayer[] = shuffledPlayers.map(p => ({
      playerId: p.id,
      playerName: p.name,
      score: 0,
      rack: drawTiles(bag, WC_RACK_SIZE),
      connected: true,
    }));

    const state: WCGameState = {
      roomId,
      ctx,
      players: internalPlayers,
      turnOrder,
      currentPlayerIndex: 0,
      currentPhase: WCPhase.STARTING,
      roundNumber: 1,
      consecutivePasses: 0,
      board: createBoard(),
      bag,
      lastWord: null,
      phaseAdvancing: false,
    };

    this.states.set(roomId, state);
    ctx.initScores(players.map(p => p.id));
    ctx.setRoomStatus(RoomStatus.IN_GAME);

    ctx.sendToAll({
      type: ServerMessageType.GAME_STARTED,
      gameId: 'wordcraft',
      phase: this.getPhaseState(roomId),
      gamePublicState: this.getPublicState(roomId),
    });
    ctx.broadcastPrivateState(pid => this.getPrivateState(roomId, pid));

    this.startStarting(state);
  }

  getPhaseState(roomId: string): PhaseState {
    const state = this.states.get(roomId);
    if (!state) {
      return {
        phaseType: PhaseType.LOBBY,
        roundNumber: 0,
        totalRounds: 0,
        timerRemainingMs: null,
        timerTotalMs: null,
      };
    }

    const remaining = state.ctx.getTimerRemaining();
    let timerTotalMs: number | null = null;
    switch (state.currentPhase) {
      case WCPhase.STARTING:    timerTotalMs = WC_STARTING_TIME_SECONDS * 1000; break;
      case WCPhase.PLAYING:     timerTotalMs = WC_PLAYING_TIME_SECONDS * 1000; break;
      case WCPhase.WORD_REVEAL: timerTotalMs = WC_WORD_REVEAL_TIME_SECONDS * 1000; break;
      case WCPhase.SCORES:      timerTotalMs = WC_SCORES_TIME_SECONDS * 1000; break;
    }

    return {
      phaseType: state.currentPhase,
      roundNumber: state.roundNumber,
      totalRounds: 0,
      timerRemainingMs: remaining,
      timerTotalMs,
    };
  }

  getPublicState(roomId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const playerInfos: WCPlayerInfo[] = state.players.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      score: p.score,
      tilesInRack: p.rack.length,
      connected: p.connected,
    }));

    const pub: WCPublicState = {
      gameId: 'wordcraft',
      board: state.board,
      players: playerInfos,
      currentPlayerId: state.turnOrder[state.currentPlayerIndex] ?? null,
      turnOrder: state.turnOrder,
      tilesInBag: state.bag.length,
      lastWord: state.lastWord,
      roundNumber: state.roundNumber,
      consecutivePasses: state.consecutivePasses,
    };

    return pub as unknown as Record<string, unknown>;
  }

  getPrivateState(roomId: string, playerId: string): Record<string, unknown> {
    const state = this.states.get(roomId);
    if (!state) return {};

    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return {};

    const isMyTurn =
      state.currentPhase === WCPhase.PLAYING &&
      state.turnOrder[state.currentPlayerIndex] === playerId;

    const priv: WCPrivateState = {
      gameId: 'wordcraft',
      rack: player.rack,
      isMyTurn,
      canSwap: state.bag.length >= WC_RACK_SIZE,
      canPass: true,
      tilesInBag: state.bag.length,
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

    if (inputType !== InputType.VOTE) {
      return { accepted: false, reason: 'Invalid input type' };
    }

    if (state.currentPhase !== WCPhase.PLAYING) {
      return { accepted: false, reason: 'Not in playing phase' };
    }

    const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
    if (playerId !== currentPlayerId) {
      return { accepted: false, reason: 'Not your turn' };
    }

    const action = String(payload.action ?? '');

    switch (action) {
      case 'place': return this.handlePlace(state, playerId, payload);
      case 'swap':  return this.handleSwap(state, playerId, payload);
      case 'pass':  return this.handlePass(state, playerId);
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

  // ===== Phase management =====

  private startStarting(state: WCGameState): void {
    state.currentPhase = WCPhase.STARTING;
    this.broadcastAll(state);

    state.ctx.startTimer(
      WCPhase.STARTING,
      WC_STARTING_TIME_SECONDS * 1000,
      () => this.startPlaying(state),
    );
  }

  private startPlaying(state: WCGameState): void {
    if (state.phaseAdvancing) return;
    state.phaseAdvancing = true;
    state.ctx.stopTimer();
    state.currentPhase = WCPhase.PLAYING;
    state.phaseAdvancing = false;

    this.broadcastAll(state);

    state.ctx.startTimer(
      WCPhase.PLAYING,
      WC_PLAYING_TIME_SECONDS * 1000,
      () => {
        // Time expired: auto-pass
        state.consecutivePasses++;
        state.lastWord = null;
        this.startWordReveal(state);
      },
    );
  }

  private startWordReveal(state: WCGameState): void {
    if (state.phaseAdvancing) return;
    state.phaseAdvancing = true;
    state.ctx.stopTimer();
    state.currentPhase = WCPhase.WORD_REVEAL;
    state.phaseAdvancing = false;

    this.broadcastAll(state);

    state.ctx.startTimer(
      WCPhase.WORD_REVEAL,
      WC_WORD_REVEAL_TIME_SECONDS * 1000,
      () => this.startScores(state),
    );
  }

  private startScores(state: WCGameState): void {
    if (state.phaseAdvancing) return;
    state.phaseAdvancing = true;
    state.ctx.stopTimer();
    state.currentPhase = WCPhase.SCORES;
    state.phaseAdvancing = false;

    // Sync scores to the platform
    for (const player of state.players) {
      const current = state.ctx.getScore(player.playerId);
      const diff = player.score - current;
      if (diff > 0) state.ctx.addPoints(player.playerId, diff);
    }

    state.ctx.broadcastScores();
    this.broadcastAll(state);

    state.ctx.startTimer(
      WCPhase.SCORES,
      WC_SCORES_TIME_SECONDS * 1000,
      () => {
        if (isGameOver(state)) {
          this.endGame(state);
        } else {
          // Advance to next player's turn
          state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.turnOrder.length;
          state.roundNumber++;
          this.startPlaying(state);
        }
      },
    );
  }

  private endGame(state: WCGameState): void {
    state.ctx.stopTimer();
    state.currentPhase = PhaseType.GAME_OVER;

    applyEndGamePenalties(state);

    // Final score sync after penalties
    for (const player of state.players) {
      const current = state.ctx.getScore(player.playerId);
      const diff = player.score - current;
      if (diff !== 0) {
        if (diff > 0) {
          state.ctx.addPoints(player.playerId, diff);
        }
        // Note: if diff < 0 (penalty reduced below current), platform score stays — acceptable per spec
      }
    }

    const scores = state.ctx.getScores();
    const winner = scores[0];

    state.ctx.broadcastGameOver({
      winnerId: winner?.playerId ?? null,
      winnerName: winner?.playerName ?? null,
      winnerTeam: null,
      finalScores: scores,
      gameId: 'wordcraft',
    });

    state.ctx.setRoomStatus(RoomStatus.GAME_ENDED);
    state.ctx.log.info('WordCraft game ended', { winnerId: winner?.playerId });
  }

  // ===== Input handlers =====

  private handlePlace(
    state: WCGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return { accepted: false, reason: 'Player not found' };

    const rawTiles = payload.tiles;
    if (!Array.isArray(rawTiles) || rawTiles.length === 0) {
      return { accepted: false, reason: 'Missing or empty tiles array' };
    }

    const placed: PlacedTile[] = [];
    for (const t of rawTiles) {
      if (
        typeof t !== 'object' || t === null ||
        typeof (t as Record<string, unknown>).row !== 'number' ||
        typeof (t as Record<string, unknown>).col !== 'number' ||
        typeof (t as Record<string, unknown>).letter !== 'string' ||
        typeof (t as Record<string, unknown>).tileId !== 'string'
      ) {
        return { accepted: false, reason: 'Invalid tile object in placement array' };
      }
      placed.push({
        row: (t as Record<string, unknown>).row as number,
        col: (t as Record<string, unknown>).col as number,
        letter: ((t as Record<string, unknown>).letter as string).toUpperCase(),
        tileId: (t as Record<string, unknown>).tileId as string,
      });
    }

    const validation = validatePlacement(state.board, placed, player.rack);
    if (!validation.valid || !validation.mainWord) {
      return { accepted: false, reason: validation.reason ?? 'Invalid placement' };
    }

    const mainWord = validation.mainWord;
    const crossWords = validation.crossWords ?? [];

    // Validate all formed words against the dictionary
    const mainWordStr = mainWord.map(c => c.letter).join('');
    if (!isValidWord(mainWordStr)) {
      return { accepted: false, reason: `Invalid word: ${mainWordStr}` };
    }
    for (const cw of crossWords) {
      const cwStr = cw.map(c => c.letter).join('');
      if (!isValidWord(cwStr)) {
        return { accepted: false, reason: `Invalid word: ${cwStr}` };
      }
    }

    // Score the main word and all cross-words
    const mainWordScore = scoreWord(state.board, mainWord);
    const crossWordScore = crossWords.reduce((sum, cw) => sum + scoreWord(state.board, cw), 0);

    // 50-point bonus for using all 7 tiles
    const usedAllTiles = placed.length === WC_RACK_SIZE && player.rack.length === WC_RACK_SIZE;
    const bonus = usedAllTiles ? WC_ALL_TILES_BONUS : 0;
    const totalScore = mainWordScore + crossWordScore + bonus;

    // Apply tiles to board (also marks premium squares as consumed)
    applyPlacement(state.board, placed, player.rack);

    // Remove placed tiles from rack
    const placedIds = new Set(placed.map(p => p.tileId));
    player.rack = player.rack.filter(t => !placedIds.has(t.id));

    // Credit score
    player.score += totalScore;

    // Record last word result (show main word + any cross-words in score)
    state.lastWord = {
      playerId: player.playerId,
      playerName: player.playerName,
      word: mainWordStr,
      score: totalScore,
      placedTiles: placed.map(p => ({ row: p.row, col: p.col })),
    };

    // Reset consecutive pass counter
    state.consecutivePasses = 0;

    // Draw replacement tiles from bag
    const needed = WC_RACK_SIZE - player.rack.length;
    if (needed > 0 && state.bag.length > 0) {
      player.rack.push(...drawTiles(state.bag, needed));
    }

    const allWordsStr = [mainWordStr, ...crossWords.map(cw => cw.map(c => c.letter).join(''))].join(', ');
    state.ctx.log.info('WordCraft word placed', { playerId, word: allWordsStr, score: totalScore, bonus });

    this.startWordReveal(state);
    return { accepted: true };
  }

  private handleSwap(
    state: WCGameState,
    playerId: string,
    payload: Record<string, unknown>,
  ): { accepted: boolean; reason?: string } {
    const player = state.players.find(p => p.playerId === playerId);
    if (!player) return { accepted: false, reason: 'Player not found' };

    if (state.bag.length < WC_RACK_SIZE) {
      return { accepted: false, reason: 'Not enough tiles in bag to swap (need at least 7)' };
    }

    const rawIds = payload.tileIds;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return { accepted: false, reason: 'Missing or empty tileIds array' };
    }

    const tileIds: string[] = rawIds.map(String);

    for (const id of tileIds) {
      if (!player.rack.some(t => t.id === id)) {
        return { accepted: false, reason: `Tile ${id} not in your rack` };
      }
    }

    // Remove tiles from rack
    const swappedTiles: Tile[] = [];
    for (const id of tileIds) {
      const idx = player.rack.findIndex(t => t.id === id);
      if (idx !== -1) {
        swappedTiles.push(player.rack.splice(idx, 1)[0]!);
      }
    }

    // Draw replacements
    player.rack.push(...drawTiles(state.bag, swappedTiles.length));

    // Return swapped tiles to bag and reshuffle
    state.bag.push(...swappedTiles);
    state.bag = shuffleBag(state.bag);

    // Swap counts as a pass
    state.consecutivePasses++;
    state.lastWord = null;

    state.ctx.log.info('WordCraft tiles swapped', { playerId, count: swappedTiles.length });

    this.startWordReveal(state);
    return { accepted: true };
  }

  private handlePass(
    state: WCGameState,
    playerId: string,
  ): { accepted: boolean; reason?: string } {
    state.consecutivePasses++;
    state.lastWord = null;

    state.ctx.log.info('WordCraft turn passed', {
      playerId,
      consecutivePasses: state.consecutivePasses,
    });

    this.startWordReveal(state);
    return { accepted: true };
  }

  // ===== Utilities =====

  private broadcastAll(state: WCGameState): void {
    state.ctx.broadcastPhase(this.getPhaseState(state.roomId), this.getPublicState(state.roomId));
    state.ctx.broadcastPrivateState(pid => this.getPrivateState(state.roomId, pid));
  }
}

export function createModule(definition: GameDefinition): GameModule {
  return new WordCraftModule(definition);
}
