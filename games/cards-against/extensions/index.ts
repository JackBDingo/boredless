/**
 * extensions/index.ts — Cards Against Humanity V2 extension action handlers.
 *
 * Implements the five CAH extension actions declared in game.yaml:
 *
 *   cah_deal_cards         — Initialize deck from content YAML, deal starting hands
 *   cah_select_black_card  — Draw a black card for the current round
 *   cah_build_submissions  — Anonymize + shuffle player submissions for reading
 *   cah_czar_pick_winner   — Award points to the winning player
 *   cah_rotate_czar        — Rotate the Card Czar, replenish hands
 *
 * State Architecture:
 *   ExtensionActionContext only exposes setGlobal() for state mutations.
 *   To store per-player state (hands, selections), we use global JSON maps:
 *     globals.hands_map_json      → Record<playerId, CAHWhiteCard[]>
 *     globals.selections_map_json → Record<playerId, string[]>
 *     globals.submitted_map_json  → Record<playerId, boolean>
 *   These are declared private in game.yaml so they're omitted from public state.
 *   The extension reads the full snapshot on each action call.
 *
 * No runtime subsystem imports — only standard library + nanoid + yaml.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import {
  parseBlackCards,
  parseWhiteCards,
  createDeckState,
  drawWhiteCards,
  drawBlackCard,
  discardWhiteCards,
  serializeDeckState,
  deserializeDeckState,
  generateSubmissionId,
  type CAHWhiteCard,
  type CAHBlackCard,
  type CAHSubmission,
  type CAHAnonymousSubmission,
  type CAHWinner,
} from './deck-manager.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CAH_HAND_SIZE = 10;
export const CAH_POINTS_AWESOME = 1000;

// ---------------------------------------------------------------------------
// Extension declaration
// ---------------------------------------------------------------------------

export const CAH_EXTENSION_DECLARATION = {
  id: 'cah-core',
  name: 'Cards Against Humanity Core Logic',
  version: '2.0.0',
  type: 'lifecycle' as const,
  description:
    'Deck management, hand dealing, black card selection, submission building, winner selection, czar rotation.',
  entryPoint: './extensions/index.ts',
};

// ---------------------------------------------------------------------------
// Content loader
// ---------------------------------------------------------------------------

interface LoadedCards {
  blackCards: CAHBlackCard[];
  whiteCards: CAHWhiteCard[];
}

let _cachedCards: LoadedCards | null = null;

/** Load card content from YAML files. Cached after first load. */
export function loadCardContent(gameDir?: string): LoadedCards {
  if (_cachedCards) return _cachedCards;

  const base =
    gameDir ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const blackPath = join(base, 'content', 'black-cards.yaml');
  const whitePath = join(base, 'content', 'white-cards.yaml');

  try {
    const rawBlack = readFileSync(blackPath, 'utf-8');
    const rawWhite = readFileSync(whitePath, 'utf-8');

    const blackCards = parseBlackCards(parseYaml(rawBlack));
    const whiteCards = parseWhiteCards(parseYaml(rawWhite));

    _cachedCards = { blackCards, whiteCards };
    return _cachedCards;
  } catch (err) {
    console.error('[cah-extensions] Failed to load card content:', err);
    return { blackCards: [], whiteCards: [] };
  }
}

/** Reset cache (for testing) */
export function resetCardCache(): void {
  _cachedCards = null;
}

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

/**
 * Context provided to CAH action handlers.
 * Mirrors ExtensionActionContext from interpreter — no runtime imports needed.
 */
export interface CAHActionContext {
  globals: Record<string, unknown>;
  players: Record<string, Record<string, unknown>>;
  playerInfo: Array<{ id: string; name: string }>;
  getScore: (playerId: string) => number;
  setGlobal: (field: string, value: unknown) => void;
  addPoints: (playerId: string, amount: number) => void;
  log: (msg: string, data?: unknown) => void;
}

// ---------------------------------------------------------------------------
// State helpers — global maps for per-player data
// ---------------------------------------------------------------------------

/** Get player hands map from globals */
export function getHandsMap(
  globals: Record<string, unknown>,
): Record<string, CAHWhiteCard[]> {
  const json = globals['hands_map_json'];
  if (typeof json !== 'string' || !json) return {};
  try {
    return JSON.parse(json) as Record<string, CAHWhiteCard[]>;
  } catch {
    return {};
  }
}

/** Get a single player's hand */
export function getPlayerHand(
  globals: Record<string, unknown>,
  playerId: string,
): CAHWhiteCard[] {
  return getHandsMap(globals)[playerId] ?? [];
}

/** Get selections map from globals */
export function getSelectionsMap(
  globals: Record<string, unknown>,
): Record<string, string[]> {
  const json = globals['selections_map_json'];
  if (typeof json !== 'string' || !json) return {};
  try {
    return JSON.parse(json) as Record<string, string[]>;
  } catch {
    return {};
  }
}

/** Get player's selected card IDs */
export function getPlayerSelections(
  globals: Record<string, unknown>,
  playerId: string,
): string[] {
  return getSelectionsMap(globals)[playerId] ?? [];
}

/** Get submission map (submissionId → playerId) */
export function getSubmissionMap(
  globals: Record<string, unknown>,
): Record<string, string> {
  const json = globals['submission_map_json'];
  if (typeof json !== 'string' || !json) return {};
  try {
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Get anonymous submissions list */
export function getAnonymousSubmissions(
  globals: Record<string, unknown>,
): CAHAnonymousSubmission[] {
  const json = globals['submissions_json'];
  if (typeof json !== 'string' || !json) return [];
  try {
    return JSON.parse(json) as CAHAnonymousSubmission[];
  } catch {
    return [];
  }
}

/** Get the current black card */
export function getCurrentBlackCard(
  globals: Record<string, unknown>,
): CAHBlackCard | null {
  const json = globals['current_black_card'];
  if (typeof json !== 'string' || !json) return null;
  try {
    return JSON.parse(json) as CAHBlackCard;
  } catch {
    return null;
  }
}

/** Get czar player ID */
function getCzarPlayerId(globals: Record<string, unknown>): string | null {
  const v = globals['czar_player_id'];
  return typeof v === 'string' ? v : null;
}

// ---------------------------------------------------------------------------
// Action: cah_deal_cards
// ---------------------------------------------------------------------------

/**
 * Called on_enter for "deal" phase (first round only).
 * - Loads card content from YAML files
 * - Creates a fresh shuffled deck
 * - Deals CAH_HAND_SIZE white cards to each player
 * - Sets random starting czar
 * - Stores deck state and hands in globals
 */
export function handleDealCards(
  ctx: CAHActionContext,
  gameDir?: string,
): void {
  const { blackCards, whiteCards } = loadCardContent(gameDir);

  if (blackCards.length === 0 || whiteCards.length === 0) {
    ctx.log('[cah] No cards loaded — cannot deal');
    return;
  }

  const deckState = createDeckState(blackCards, whiteCards);
  const handsMap: Record<string, CAHWhiteCard[]> = {};

  for (const { id: playerId } of ctx.playerInfo) {
    handsMap[playerId] = drawWhiteCards(deckState, CAH_HAND_SIZE);
  }

  // Pick starting czar
  const czarIndex = Math.floor(Math.random() * ctx.playerInfo.length);
  const czar = ctx.playerInfo[czarIndex];

  ctx.setGlobal('czar_index', czarIndex);
  ctx.setGlobal('czar_player_id', czar?.id ?? null);
  ctx.setGlobal('total_non_czar', ctx.playerInfo.length - 1);
  ctx.setGlobal('deck_state_json', serializeDeckState(deckState));
  ctx.setGlobal('hands_map_json', JSON.stringify(handsMap));

  ctx.log('[cah] Dealt cards', {
    playerCount: ctx.playerInfo.length,
    czarId: czar?.id,
    czarIndex,
    whiteDeckRemaining: deckState.whiteDeck.length,
    blackDeckRemaining: deckState.blackDeck.length,
  });
}

// ---------------------------------------------------------------------------
// Action: cah_select_black_card
// ---------------------------------------------------------------------------

/**
 * Called on_enter for "prompt" phase.
 * Draws a black card from the deck and stores it in globals.current_black_card.
 * Updates total_non_czar count.
 */
export function handleSelectBlackCard(ctx: CAHActionContext): void {
  const deckState = deserializeDeckState(ctx.globals['deck_state_json'] as string);
  if (!deckState) {
    ctx.log('[cah] No deck state — cannot draw black card');
    return;
  }

  const blackCard = drawBlackCard(deckState);
  if (!blackCard) {
    ctx.log('[cah] Black deck exhausted');
    return;
  }

  ctx.setGlobal('current_black_card', JSON.stringify(blackCard));

  const czarId = getCzarPlayerId(ctx.globals);
  const nonCzarCount = ctx.playerInfo.filter(p => p.id !== czarId).length;
  ctx.setGlobal('total_non_czar', nonCzarCount);
  ctx.setGlobal('deck_state_json', serializeDeckState(deckState));

  ctx.log('[cah] Drew black card', {
    cardId: blackCard.id,
    pick: blackCard.pick,
  });
}

// ---------------------------------------------------------------------------
// Action: cah_build_submissions
// ---------------------------------------------------------------------------

/**
 * Called on_complete of "prompt" phase.
 * - Collects selected card IDs from globals.selections_map_json
 * - Maps card IDs to card objects from player hands
 * - Creates anonymized, shuffled submission list
 * - Discards played cards
 * - Stores submissions_json (public) and submission_map_json (private)
 */
export function handleBuildSubmissions(ctx: CAHActionContext): void {
  const czarId = getCzarPlayerId(ctx.globals);
  const selectionsMap = getSelectionsMap(ctx.globals);
  const handsMap = getHandsMap(ctx.globals);
  const deckState = deserializeDeckState(ctx.globals['deck_state_json'] as string);
  const submissions: CAHSubmission[] = [];
  const submissionMap: Record<string, string> = {};
  const updatedHandsMap = { ...handsMap };

  for (const { id: playerId } of ctx.playerInfo) {
    if (playerId === czarId) continue;

    const selectedIds = selectionsMap[playerId] ?? [];
    if (selectedIds.length === 0) continue;

    const hand = handsMap[playerId] ?? [];
    const selectedCards: CAHWhiteCard[] = [];

    for (const cardId of selectedIds) {
      const card = hand.find(c => c.id === cardId);
      if (card) selectedCards.push(card);
    }

    if (selectedCards.length === 0) continue;

    // Remove played cards from hand
    updatedHandsMap[playerId] = hand.filter(c => !selectedIds.includes(c.id));

    // Discard played cards
    if (deckState) {
      discardWhiteCards(deckState, selectedCards);
    }

    const sub: CAHSubmission = {
      submissionId: generateSubmissionId(),
      playerId,
      cards: selectedCards,
    };

    submissions.push(sub);
    submissionMap[sub.submissionId] = playerId;
  }

  // Shuffle for anonymity
  for (let i = submissions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [submissions[i], submissions[j]] = [submissions[j], submissions[i]];
  }

  const anonymous: CAHAnonymousSubmission[] = submissions.map(s => ({
    submissionId: s.submissionId,
    cards: s.cards.map(c => ({ text: c.text })),
  }));

  ctx.setGlobal('submissions_json', JSON.stringify(anonymous));
  ctx.setGlobal('submission_map_json', JSON.stringify(submissionMap));
  ctx.setGlobal('hands_map_json', JSON.stringify(updatedHandsMap));

  if (deckState) {
    ctx.setGlobal('deck_state_json', serializeDeckState(deckState));
  }

  ctx.log('[cah] Built submissions', { count: submissions.length });
}

// ---------------------------------------------------------------------------
// Action: cah_czar_pick_winner
// ---------------------------------------------------------------------------

/**
 * Called on_complete of "reading" phase.
 * - Reads the czar's pick from globals.winner_json (a submissionId string)
 * - Finds the player who owns that submission
 * - Awards CAH_POINTS_AWESOME to that player
 * - Updates winner_json to the full CAHWinner object for display
 */
export function handleCzarPickWinner(ctx: CAHActionContext): void {
  const rawWinner = ctx.globals['winner_json'];
  let submissionId: string | null = null;

  if (typeof rawWinner === 'string') {
    // Could be bare submissionId or JSON
    try {
      const parsed = JSON.parse(rawWinner) as { submissionId?: string };
      submissionId = parsed?.submissionId ?? null;
    } catch {
      submissionId = rawWinner;
    }
  }

  // Fallback: pick first submission
  if (!submissionId) {
    const subs = getAnonymousSubmissions(ctx.globals);
    submissionId = subs[0]?.submissionId ?? null;
    ctx.log('[cah] No czar pick — using first submission', { submissionId });
  }

  if (!submissionId) {
    ctx.log('[cah] No submissions to pick from');
    return;
  }

  const submissionMap = getSubmissionMap(ctx.globals);
  const winnerPlayerId = submissionMap[submissionId];

  if (!winnerPlayerId) {
    ctx.log('[cah] Could not find player for submissionId', { submissionId });
    return;
  }

  ctx.addPoints(winnerPlayerId, CAH_POINTS_AWESOME);

  const winnerInfo = ctx.playerInfo.find(p => p.id === winnerPlayerId);
  const anonymous = getAnonymousSubmissions(ctx.globals);
  const winningSub = anonymous.find(s => s.submissionId === submissionId);

  const winner: CAHWinner = {
    submissionId,
    playerId: winnerPlayerId,
    playerName: winnerInfo?.name ?? 'Unknown',
    cards: winningSub?.cards ?? [],
  };

  ctx.setGlobal('winner_json', JSON.stringify(winner));

  ctx.log('[cah] Czar picked winner', {
    submissionId,
    winnerPlayerId,
    winnerName: winner.playerName,
    pointsAwarded: CAH_POINTS_AWESOME,
  });
}

// ---------------------------------------------------------------------------
// Action: cah_rotate_czar
// ---------------------------------------------------------------------------

/**
 * Called on_enter for "deal_next" phase.
 * - Advances czar_index to next player
 * - Sets czar_player_id
 * - Replenishes all player hands back to CAH_HAND_SIZE
 */
export function handleRotateCzar(ctx: CAHActionContext): void {
  const currentIndex = Number(ctx.globals['czar_index'] ?? 0);
  const playerCount = ctx.playerInfo.length;
  const newIndex = (currentIndex + 1) % playerCount;
  const newCzar = ctx.playerInfo[newIndex];

  ctx.setGlobal('czar_index', newIndex);
  ctx.setGlobal('czar_player_id', newCzar?.id ?? null);

  const deckState = deserializeDeckState(ctx.globals['deck_state_json'] as string);
  const handsMap = getHandsMap(ctx.globals);

  if (deckState) {
    const updatedHandsMap = { ...handsMap };
    for (const { id: playerId } of ctx.playerInfo) {
      const hand = handsMap[playerId] ?? [];
      const needed = CAH_HAND_SIZE - hand.length;
      if (needed > 0) {
        const drawn = drawWhiteCards(deckState, needed);
        updatedHandsMap[playerId] = [...hand, ...drawn];
      }
    }
    ctx.setGlobal('hands_map_json', JSON.stringify(updatedHandsMap));
    ctx.setGlobal('deck_state_json', serializeDeckState(deckState));
  }

  ctx.log('[cah] Rotated czar', {
    newCzarIndex: newIndex,
    newCzarId: newCzar?.id,
  });
}

// ---------------------------------------------------------------------------
// Input handler — called when a player submits cards
// ---------------------------------------------------------------------------

/**
 * Handle a player's card submission.
 * Called externally (from game-module.ts) when the game receives input
 * of type 'vote' during the prompt phase.
 *
 * Validates:
 * - Player is not the czar
 * - Player hasn't already submitted
 * - Card IDs are in the player's hand
 * - Correct number of cards for this black card (pick count)
 *
 * On success: stores selection in globals.selections_map_json,
 * marks has_submitted in globals.submitted_map_json.
 *
 * Returns: { accepted: boolean; reason?: string }
 */
export function handleCardSubmission(
  ctx: CAHActionContext,
  playerId: string,
  cardIds: string[],
): { accepted: boolean; reason?: string } {
  const czarId = getCzarPlayerId(ctx.globals);
  if (czarId === playerId) {
    return { accepted: false, reason: 'Card Czar cannot submit cards' };
  }

  const submittedMap = getSubmittedMap(ctx.globals);
  if (submittedMap[playerId]) {
    return { accepted: false, reason: 'Already submitted' };
  }

  const blackCard = getCurrentBlackCard(ctx.globals);
  const pick = blackCard?.pick ?? 1;

  if (!Array.isArray(cardIds) || cardIds.length !== pick) {
    return { accepted: false, reason: `Must select exactly ${pick} card(s)` };
  }

  const hand = getPlayerHand(ctx.globals, playerId);
  for (const cardId of cardIds) {
    if (!hand.find(c => c.id === cardId)) {
      return { accepted: false, reason: `Card ${cardId} not in hand` };
    }
  }

  // Store selection
  const selectionsMap = getSelectionsMap(ctx.globals);
  selectionsMap[playerId] = cardIds;
  ctx.setGlobal('selections_map_json', JSON.stringify(selectionsMap));

  // Mark submitted
  submittedMap[playerId] = true;
  ctx.setGlobal('submitted_map_json', JSON.stringify(submittedMap));

  // Update submitted_count
  const submittedCount = Object.values(submittedMap).filter(Boolean).length;
  ctx.setGlobal('submitted_count', submittedCount);

  return { accepted: true };
}

/** Helper to read submitted map */
export function getSubmittedMap(
  globals: Record<string, unknown>,
): Record<string, boolean> {
  const json = globals['submitted_map_json'];
  if (typeof json !== 'string' || !json) return {};
  try {
    return JSON.parse(json) as Record<string, boolean>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Action type check
// ---------------------------------------------------------------------------

export type CAHActionName =
  | 'cah_deal_cards'
  | 'cah_select_black_card'
  | 'cah_build_submissions'
  | 'cah_czar_pick_winner'
  | 'cah_rotate_czar';

export function isCAHAction(actionName: string): actionName is CAHActionName {
  return [
    'cah_deal_cards',
    'cah_select_black_card',
    'cah_build_submissions',
    'cah_czar_pick_winner',
    'cah_rotate_czar',
  ].includes(actionName);
}

export function dispatchCAHAction(
  actionName: CAHActionName,
  ctx: CAHActionContext,
  gameDir?: string,
): void {
  switch (actionName) {
    case 'cah_deal_cards': handleDealCards(ctx, gameDir); break;
    case 'cah_select_black_card': handleSelectBlackCard(ctx); break;
    case 'cah_build_submissions': handleBuildSubmissions(ctx); break;
    case 'cah_czar_pick_winner': handleCzarPickWinner(ctx); break;
    case 'cah_rotate_czar': handleRotateCzar(ctx); break;
    default: console.warn('[cah-extensions] Unknown action:', actionName);
  }
}

// Re-export types from deck-manager for external use
export type { CAHWhiteCard, CAHBlackCard, CAHAnonymousSubmission, CAHWinner };
