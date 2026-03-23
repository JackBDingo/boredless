/**
 * extensions/index.ts — WordCraft V2 extension registration.
 *
 * This module is the entry point for the wordcraft-core extension package.
 * It provides:
 *   1. Extension metadata matching game.yaml extensions section
 *   2. Action handler context type (WCActionContext)
 *   3. All action handler implementations (pure TypeScript)
 *   4. Dispatcher used by game-module.ts
 *
 * Architecture Note:
 *   WordCraft is a stateful tile game. The extension stores board, bag, and
 *   rack state as JSON-encoded strings in the StateManager globals/per-player
 *   fields (declared in game.yaml state_model). This keeps the StateManager
 *   as the authoritative store while allowing the extension to manage
 *   complex nested structures.
 *
 *   The DeclarativeGameModule routes custom action names (e.g. wc_init_game)
 *   declared in game.yaml phase on_enter/on_exit blocks to the registered
 *   ExtensionActionHandler. The handler reads/writes state via the context
 *   API (setGlobal, setPlayer, addPoints, etc.) and returns true if handled.
 *
 * Custom actions:
 *   wc_init_game        — initialise bag, board, deal racks, randomise turn order
 *   wc_on_playing_enter — prepare for the current player's turn
 *   wc_sync_scores      — sync per_player.score → platform ScoreEngine
 *
 * Input processing (called from handleInput in game-module.ts):
 *   handlePlace  — validate & execute a tile placement
 *   handleSwap   — exchange tiles with the bag
 *   handlePass   — record a pass
 */

import type { BoardCell, PlacedTile, Tile } from '../types.js';
import {
  WC_BOARD_SIZE,
  WC_RACK_SIZE,
} from '../constants.js';
import {
  createTileBag,
  createBoard,
  shuffleBag,
  drawTiles,
  validatePlacement,
  calculatePlacementScore,
  applyPlacement,
  isGameOver,
  applyEndGamePenalties,
  type WordCell,
} from './board.js';
import { isValidWord } from './dictionary.js';

// ---------------------------------------------------------------------------
// Extension declaration (mirrors game.yaml extensions section)
// ---------------------------------------------------------------------------

export const WC_EXTENSION_DECLARATION = {
  id: 'wordcraft-core',
  name: 'WordCraft Core Logic',
  version: '2.0.0',
  type: 'lifecycle' as const,
  description:
    'Implements board initialisation, tile placement validation, word scoring with premium squares, tile rack management, and game-over detection.',
  entryPoint: './extensions/index.ts',
};

// ---------------------------------------------------------------------------
// Action handler context
// ---------------------------------------------------------------------------

/**
 * Context provided to WordCraft extension action handlers.
 * Mirrors ExtensionActionContext from the runtime interpreter.
 */
export interface WCActionContext {
  /** Room ID */
  roomId: string;
  /** Current global state snapshot */
  globals: Record<string, unknown>;
  /** Per-player state snapshot: playerId → fieldMap */
  players: Record<string, Record<string, unknown>>;
  /** Player info (id + name) for result messages */
  playerInfo: Array<{ id: string; name: string }>;
  /** Set a global state field */
  setGlobal: (field: string, value: unknown) => void;
  /** Set a per-player state field */
  setPlayer: (playerId: string, field: string, value: unknown) => void;
  /** Get a player's current total score */
  getScore: (playerId: string) => number;
  /** Award points to a player */
  addPoints: (playerId: string, amount: number) => void;
  /** Signal that the current input_gate phase is complete */
  completePhase: () => void;
  /** Log a message */
  log: (msg: string, data?: unknown) => void;
}

// ---------------------------------------------------------------------------
// JSON serialisation helpers
// ---------------------------------------------------------------------------

function getBoard(globals: Record<string, unknown>): BoardCell[][] {
  const json = globals['board_json'];
  if (typeof json !== 'string' || !json) return [];
  try { return JSON.parse(json) as BoardCell[][]; } catch { return []; }
}

function getBag(globals: Record<string, unknown>): Tile[] {
  const json = globals['bag_json'];
  if (typeof json !== 'string' || !json) return [];
  try { return JSON.parse(json) as Tile[]; } catch { return []; }
}

function getRack(playerState: Record<string, unknown>): Tile[] {
  const json = playerState['rack_json'];
  if (typeof json !== 'string' || !json) return [];
  try { return JSON.parse(json) as Tile[]; } catch { return []; }
}

function getTurnOrder(globals: Record<string, unknown>): string[] {
  const raw = globals['turn_order'];
  if (Array.isArray(raw)) return raw as string[];
  return [];
}

function getCurrentPlayerIndex(globals: Record<string, unknown>): number {
  const idx = globals['current_player_index'];
  return typeof idx === 'number' ? idx : 0;
}

// ---------------------------------------------------------------------------
// Action: wc_init_game
// ---------------------------------------------------------------------------

/**
 * Initialise the game: create bag, board, deal racks, randomise turn order.
 * Called on_enter of the starting phase.
 */
export function handleInitGame(ctx: WCActionContext): void {
  const bag = createTileBag();
  const board = createBoard();

  // Randomise turn order
  const playerIds = ctx.playerInfo.map(p => p.id);
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);

  // Deal racks
  for (const playerId of shuffled) {
    const rack = drawTiles(bag, WC_RACK_SIZE);
    ctx.setPlayer(playerId, 'rack_json', JSON.stringify(rack));
    ctx.setPlayer(playerId, 'tiles_in_rack', rack.length);
    ctx.setPlayer(playerId, 'score', 0);
  }

  ctx.setGlobal('board_json', JSON.stringify(board));
  ctx.setGlobal('bag_json', JSON.stringify(bag));
  ctx.setGlobal('turn_order', shuffled);
  ctx.setGlobal('current_player_index', 0);
  ctx.setGlobal('round_number', 1);
  ctx.setGlobal('consecutive_passes', 0);
  ctx.setGlobal('last_word_json', null);
  ctx.setGlobal('tiles_in_bag', bag.length);
  ctx.setGlobal('game_over_flag', false);

  ctx.log('[wordcraft] Game initialised', {
    players: shuffled.length,
    tilesInBag: bag.length,
  });
}

// ---------------------------------------------------------------------------
// Action: wc_on_playing_enter
// ---------------------------------------------------------------------------

/**
 * Prepare for the current player's turn.
 * Clears last_word_json so the display shows a fresh state.
 * The active player ID is derivable from turn_order[current_player_index].
 */
export function handleOnPlayingEnter(ctx: WCActionContext): void {
  // Clear the last word for a fresh turn display
  ctx.setGlobal('last_word_json', null);

  const turnOrder = getTurnOrder(ctx.globals);
  const idx = getCurrentPlayerIndex(ctx.globals);
  const currentPlayerId = turnOrder[idx] ?? null;

  ctx.log('[wordcraft] Playing phase entered', {
    currentPlayerId,
    roundNumber: ctx.globals['round_number'],
  });
}

// ---------------------------------------------------------------------------
// Action: wc_sync_scores
// ---------------------------------------------------------------------------

/**
 * Push per_player.score values to the platform ScoreEngine.
 * Called on_enter of the scores phase.
 * Also checks game-over conditions and sets game_over_flag.
 */
export function handleSyncScores(ctx: WCActionContext): void {
  const bag = getBag(ctx.globals);
  const bagEmpty = bag.length === 0;

  const turnOrder = getTurnOrder(ctx.globals);
  const consecutivePasses = Number(ctx.globals['consecutive_passes'] ?? 0);

  const racks: Tile[][] = turnOrder.map(pid => {
    const ps = ctx.players[pid];
    return ps ? getRack(ps) : [];
  });

  const playerCount = turnOrder.length;

  // Check game over
  const gameOver = isGameOver(consecutivePasses, playerCount, bagEmpty, racks);

  if (gameOver) {
    // Apply end-game penalties
    const scores = turnOrder.map(pid => {
      const ps = ctx.players[pid];
      return ps ? Number(ps['score'] ?? 0) : 0;
    });
    const penalised = applyEndGamePenalties(scores, racks);

    for (let i = 0; i < turnOrder.length; i++) {
      const playerId = turnOrder[i]!;
      const newScore = penalised[i] ?? 0;
      ctx.setPlayer(playerId, 'score', newScore);

      // Sync to platform ScoreEngine
      const platformScore = ctx.getScore(playerId);
      const diff = newScore - platformScore;
      if (diff > 0) ctx.addPoints(playerId, diff);
    }

    ctx.setGlobal('game_over_flag', true);
    ctx.log('[wordcraft] Game over — penalties applied');
  } else {
    // Normal sync: push any accumulated score difference
    for (const playerId of turnOrder) {
      const ps = ctx.players[playerId];
      const internalScore = ps ? Number(ps['score'] ?? 0) : 0;
      const platformScore = ctx.getScore(playerId);
      const diff = internalScore - platformScore;
      if (diff > 0) ctx.addPoints(playerId, diff);
    }

    // Advance to next player's turn
    const idx = getCurrentPlayerIndex(ctx.globals);
    const nextIdx = (idx + 1) % playerCount;
    ctx.setGlobal('current_player_index', nextIdx);
    ctx.setGlobal('round_number', Number(ctx.globals['round_number'] ?? 1) + 1);

    ctx.log('[wordcraft] Scores synced, advancing turn', {
      nextPlayerIndex: nextIdx,
      roundNumber: ctx.globals['round_number'],
    });
  }
}

// ---------------------------------------------------------------------------
// Input handlers (called from game-module.ts handleInput)
// ---------------------------------------------------------------------------

/**
 * Handle a tile placement action.
 * Returns { accepted, reason? } matching the GameModule.handleInput return type.
 */
export function handlePlace(
  ctx: WCActionContext,
  playerId: string,
  payload: Record<string, unknown>,
): { accepted: boolean; reason?: string } {
  // Verify it's this player's turn
  const turnOrder = getTurnOrder(ctx.globals);
  const idx = getCurrentPlayerIndex(ctx.globals);
  const currentPlayerId = turnOrder[idx];
  if (playerId !== currentPlayerId) {
    return { accepted: false, reason: 'Not your turn' };
  }

  const ps = ctx.players[playerId];
  if (!ps) return { accepted: false, reason: 'Player not found' };

  const rack = getRack(ps);
  const board = getBoard(ctx.globals);

  // Parse placed tiles from payload
  const rawTiles = payload['tiles'];
  if (!Array.isArray(rawTiles) || rawTiles.length === 0) {
    return { accepted: false, reason: 'Missing or empty tiles array' };
  }

  const placed: PlacedTile[] = [];
  for (const t of rawTiles) {
    if (
      typeof t !== 'object' || t === null ||
      typeof (t as Record<string, unknown>)['row'] !== 'number' ||
      typeof (t as Record<string, unknown>)['col'] !== 'number' ||
      typeof (t as Record<string, unknown>)['letter'] !== 'string' ||
      typeof (t as Record<string, unknown>)['tileId'] !== 'string'
    ) {
      return { accepted: false, reason: 'Invalid tile object in placement array' };
    }
    placed.push({
      row: (t as Record<string, unknown>)['row'] as number,
      col: (t as Record<string, unknown>)['col'] as number,
      letter: ((t as Record<string, unknown>)['letter'] as string).toUpperCase(),
      tileId: (t as Record<string, unknown>)['tileId'] as string,
    });
  }

  // Validate placement geometry
  const validation = validatePlacement(board, placed, rack);
  if (!validation.valid || !validation.mainWord) {
    return { accepted: false, reason: validation.reason ?? 'Invalid placement' };
  }

  const mainWord = validation.mainWord;
  const crossWords = validation.crossWords ?? [];

  // Validate words against dictionary
  const mainWordStr = mainWord.map((c: WordCell) => c.letter).join('');
  if (!isValidWord(mainWordStr)) {
    return { accepted: false, reason: `Invalid word: ${mainWordStr}` };
  }
  for (const cw of crossWords) {
    const cwStr = cw.map((c: WordCell) => c.letter).join('');
    if (!isValidWord(cwStr)) {
      return { accepted: false, reason: `Invalid word: ${cwStr}` };
    }
  }

  // Score
  const totalScore = calculatePlacementScore(board, mainWord, crossWords, placed.length, rack.length);

  // Apply placement to board (marks premiums as used)
  applyPlacement(board, placed, rack);

  // Remove placed tiles from rack
  const placedIds = new Set(placed.map(p => p.tileId));
  const newRack = rack.filter(t => !placedIds.has(t.id));

  // Draw replacement tiles
  const bag = getBag(ctx.globals);
  const needed = WC_RACK_SIZE - newRack.length;
  if (needed > 0 && bag.length > 0) {
    newRack.push(...drawTiles(bag, needed));
  }

  // Update score
  const newScore = Number(ps['score'] ?? 0) + totalScore;
  ctx.setPlayer(playerId, 'score', newScore);
  ctx.setPlayer(playerId, 'rack_json', JSON.stringify(newRack));
  ctx.setPlayer(playerId, 'tiles_in_rack', newRack.length);

  // Update global state
  ctx.setGlobal('board_json', JSON.stringify(board));
  ctx.setGlobal('bag_json', JSON.stringify(bag));
  ctx.setGlobal('tiles_in_bag', bag.length);
  ctx.setGlobal('consecutive_passes', 0);

  // Record last word result
  const playerName = ctx.playerInfo.find(p => p.id === playerId)?.name ?? playerId;
  const lastWord = {
    playerId,
    playerName,
    word: mainWordStr,
    score: totalScore,
    placedTiles: placed.map(p => ({ row: p.row, col: p.col })),
  };
  ctx.setGlobal('last_word_json', JSON.stringify(lastWord));

  const allWordsStr = [mainWordStr, ...crossWords.map((cw: WordCell[]) => cw.map((c: WordCell) => c.letter).join(''))].join(', ');
  ctx.log('[wordcraft] Word placed', { playerId, words: allWordsStr, score: totalScore });

  // Signal that input is complete (advance phase to word_reveal)
  ctx.completePhase();
  return { accepted: true };
}

/**
 * Handle a tile swap action.
 */
export function handleSwap(
  ctx: WCActionContext,
  playerId: string,
  payload: Record<string, unknown>,
): { accepted: boolean; reason?: string } {
  const turnOrder = getTurnOrder(ctx.globals);
  const idx = getCurrentPlayerIndex(ctx.globals);
  const currentPlayerId = turnOrder[idx];
  if (playerId !== currentPlayerId) {
    return { accepted: false, reason: 'Not your turn' };
  }

  const ps = ctx.players[playerId];
  if (!ps) return { accepted: false, reason: 'Player not found' };

  const bag = getBag(ctx.globals);

  if (bag.length < WC_RACK_SIZE) {
    return { accepted: false, reason: 'Not enough tiles in bag to swap (need at least 7)' };
  }

  const rawIds = payload['tileIds'];
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { accepted: false, reason: 'Missing or empty tileIds array' };
  }

  const tileIds: string[] = rawIds.map(String);
  const rack = getRack(ps);

  for (const id of tileIds) {
    if (!rack.some(t => t.id === id)) {
      return { accepted: false, reason: `Tile ${id} not in your rack` };
    }
  }

  // Remove tiles from rack
  const swappedTiles: Tile[] = [];
  const newRack = [...rack];
  for (const id of tileIds) {
    const idx2 = newRack.findIndex(t => t.id === id);
    if (idx2 !== -1) {
      swappedTiles.push(newRack.splice(idx2, 1)[0]!);
    }
  }

  // Draw replacements
  newRack.push(...drawTiles(bag, swappedTiles.length));

  // Return swapped tiles to bag and reshuffle
  bag.push(...swappedTiles);
  const newBag = shuffleBag(bag);

  ctx.setPlayer(playerId, 'rack_json', JSON.stringify(newRack));
  ctx.setPlayer(playerId, 'tiles_in_rack', newRack.length);
  ctx.setGlobal('bag_json', JSON.stringify(newBag));
  ctx.setGlobal('tiles_in_bag', newBag.length);
  ctx.setGlobal('consecutive_passes', Number(ctx.globals['consecutive_passes'] ?? 0) + 1);
  ctx.setGlobal('last_word_json', null);

  ctx.log('[wordcraft] Tiles swapped', { playerId, count: swappedTiles.length });

  ctx.completePhase();
  return { accepted: true };
}

/**
 * Handle a pass action.
 */
export function handlePass(
  ctx: WCActionContext,
  playerId: string,
): { accepted: boolean; reason?: string } {
  const turnOrder = getTurnOrder(ctx.globals);
  const idx = getCurrentPlayerIndex(ctx.globals);
  const currentPlayerId = turnOrder[idx];
  if (playerId !== currentPlayerId) {
    return { accepted: false, reason: 'Not your turn' };
  }

  ctx.setGlobal('consecutive_passes', Number(ctx.globals['consecutive_passes'] ?? 0) + 1);
  ctx.setGlobal('last_word_json', null);

  ctx.log('[wordcraft] Turn passed', { playerId });

  ctx.completePhase();
  return { accepted: true };
}

// ---------------------------------------------------------------------------
// Custom action names
// ---------------------------------------------------------------------------

export type WCActionName =
  | 'wc_init_game'
  | 'wc_on_playing_enter'
  | 'wc_sync_scores';

export function isWCAction(actionName: string): actionName is WCActionName {
  return ['wc_init_game', 'wc_on_playing_enter', 'wc_sync_scores'].includes(actionName);
}
