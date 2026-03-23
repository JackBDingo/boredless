/**
 * extensions/index.ts — Cribbage V2 extension action handlers.
 *
 * Implements all Cribbage game logic as pure TypeScript extension functions
 * operating on the V2 state model (JSON-serialized state in globals/per_player).
 *
 * Extension actions declared in game.yaml:
 *   cribbage_deal_round        — shuffle deck, deal hands, init round state
 *   cribbage_reset_discard_state — clear per-player discard tracking
 *   cribbage_finalize_discards — collect crib cards after all players discarded
 *   cribbage_cut_starter       — cut deck for starter, check his heels
 *   cribbage_start_pegging     — initialize pegging state
 *   cribbage_score_hands       — score all player hands against starter
 *   cribbage_score_crib        — score dealer's crib
 *   cribbage_rotate_dealer     — advance dealer index for next round
 *
 * Input handler (invoked from CribbageGameModule):
 *   handleCribbageInput        — route discard / play_card / go inputs
 */

import type { ExtensionActionContext } from '../../../server/src/runtime/interpreter/index.js';
import { freshDeck, dealCards } from '../server/deck.js';
import { scoreHand, scorePegging } from '../server/scoring.js';
import {
  CR_WIN_SCORE,
  CR_PEGGING_TARGET,
  CR_HAND_SIZE,
  CR_DISCARD_COUNT,
  RANK_VALUES,
} from '../constants.js';
import type { Card, PlayedCard, HandScore } from '../types.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function cardValue(card: Card): number {
  return RANK_VALUES[card.rank] ?? 0;
}

function parseJson<T>(json: unknown, fallback: T): T {
  if (typeof json !== 'string' || !json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Internal player representation stored in _hands_json
// ---------------------------------------------------------------------------

interface InternalPlayer {
  playerId: string;
  playerName: string;
  dealtHand: Card[];
  hand: Card[];           // Cards still to play in pegging
  cribCards: Card[];
  scoringHand: Card[];    // 4-card hand after discarding (used in show scoring)
  hasSaidGo: boolean;
  selectedForDiscard: string[];
}

function getInternalPlayers(ctx: ExtensionActionContext): InternalPlayer[] {
  return parseJson<InternalPlayer[]>(ctx.globals['_hands_json'], []);
}

function setInternalPlayers(ctx: ExtensionActionContext, players: InternalPlayer[]): void {
  ctx.setGlobal('_hands_json', JSON.stringify(players));
}

function getPlayerOrder(ctx: ExtensionActionContext): string[] {
  return parseJson<string[]>(ctx.globals['player_order_json'], []);
}

// ---------------------------------------------------------------------------
// cribbage_deal_round
// ---------------------------------------------------------------------------

/**
 * Shuffle a fresh deck, deal hands, and initialize round state.
 * Called on_enter of the "dealing" phase.
 */
export function handleDealRound(ctx: ExtensionActionContext): void {
  const round = (ctx.globals['round'] as number ?? 0) + 1;
  ctx.setGlobal('round', round);

  const playerIds = ctx.playerInfo.map(p => p.id);
  const n = playerIds.length;
  const handSize = CR_HAND_SIZE[n] ?? 5;

  const deck = freshDeck();
  const players: InternalPlayer[] = playerIds.map(pid => {
    const info = ctx.playerInfo.find(p => p.id === pid)!;
    const dealt = dealCards(deck, handSize);
    return {
      playerId: pid,
      playerName: info.name,
      dealtHand: [...dealt],
      hand: [...dealt],
      cribCards: [],
      scoringHand: [],
      hasSaidGo: false,
      selectedForDiscard: [],
    };
  });

  // Private state
  ctx.setGlobal('_deck_json', JSON.stringify(deck));
  ctx.setGlobal('_crib_json', JSON.stringify([]));
  setInternalPlayers(ctx, players);

  // Public reset
  ctx.setGlobal('starter_card_json', null);
  ctx.setGlobal('peg_count', 0);
  ctx.setGlobal('played_sequence_json', JSON.stringify([]));
  ctx.setGlobal('all_played_cards_json', JSON.stringify([]));
  ctx.setGlobal('go_players_json', JSON.stringify([]));
  ctx.setGlobal('last_peg_points_json', null);
  ctx.setGlobal('hand_scores_json', JSON.stringify([]));
  ctx.setGlobal('crib_score_json', null);
  ctx.setGlobal('winner_json', null);
  ctx.setGlobal('player_order_json', JSON.stringify(playerIds));
  ctx.setGlobal(
    'player_names_json',
    JSON.stringify(Object.fromEntries(ctx.playerInfo.map(p => [p.id, p.name]))),
  );
  ctx.setGlobal(
    'discards_done_json',
    JSON.stringify(Object.fromEntries(playerIds.map(id => [id, false]))),
  );

  // Per-player state
  for (const p of players) {
    ctx.setPlayer(p.playerId, 'hand_size', p.hand.length);
    ctx.setPlayer(p.playerId, 'has_discarded', false);
    ctx.setPlayer(p.playerId, 'hand_json', JSON.stringify(p.hand));
    ctx.setPlayer(p.playerId, 'crib_cards_json', JSON.stringify([]));
    ctx.setPlayer(p.playerId, 'selected_discard_ids_json', JSON.stringify([]));
    ctx.setPlayer(p.playerId, 'is_my_turn', false);
    ctx.setPlayer(p.playerId, 'can_play', false);
    ctx.setPlayer(p.playerId, 'playable_card_ids_json', JSON.stringify([]));
    ctx.setPlayer(p.playerId, 'hand_score_json', null);
  }

  ctx.log('[cribbage] Round dealt', { round, players: n, handSize });
}

// ---------------------------------------------------------------------------
// cribbage_reset_discard_state
// ---------------------------------------------------------------------------

/**
 * Reset discard tracking at the start of the discard phase.
 */
export function handleResetDiscardState(ctx: ExtensionActionContext): void {
  const players = getInternalPlayers(ctx);
  const discardsDone: Record<string, boolean> = {};
  for (const p of players) {
    discardsDone[p.playerId] = p.cribCards.length >= (CR_DISCARD_COUNT[players.length] ?? 1);
  }
  ctx.setGlobal('discards_done_json', JSON.stringify(discardsDone));
}

// ---------------------------------------------------------------------------
// cribbage_finalize_discards
// ---------------------------------------------------------------------------

/**
 * Finalize crib after all players have discarded.
 * Auto-discards for any player who did not complete selection.
 */
export function handleFinalizeDiscards(ctx: ExtensionActionContext): void {
  const players = getInternalPlayers(ctx);
  const n = players.length;
  const discardCount = CR_DISCARD_COUNT[n] ?? 1;

  for (const p of players) {
    if (p.cribCards.length < discardCount) {
      const needed = discardCount - p.cribCards.length;
      const toDiscard = p.hand.slice(0, needed);
      for (const c of toDiscard) {
        p.cribCards.push(c);
        p.hand = p.hand.filter(h => h.id !== c.id);
      }
    }
    p.scoringHand = [...p.hand];
    ctx.setPlayer(p.playerId, 'hand_json', JSON.stringify(p.hand));
    ctx.setPlayer(p.playerId, 'crib_cards_json', JSON.stringify(p.cribCards));
    ctx.setPlayer(p.playerId, 'hand_size', p.hand.length);
  }

  const crib = players.flatMap(p => p.cribCards);
  ctx.setGlobal('_crib_json', JSON.stringify(crib));
  setInternalPlayers(ctx, players);
  ctx.log('[cribbage] Discards finalized', { cribSize: crib.length });
}

// ---------------------------------------------------------------------------
// cribbage_cut_starter
// ---------------------------------------------------------------------------

/**
 * Cut the deck for the starter card. Check for His Heels.
 */
export function handleCutStarter(ctx: ExtensionActionContext): void {
  const deck = parseJson<Card[]>(ctx.globals['_deck_json'], []);
  if (deck.length === 0) {
    ctx.log('[cribbage] No deck to cut from!');
    return;
  }

  const cutIndex = Math.floor(Math.random() * (deck.length - 1)) + 1;
  const starterCard = deck.splice(cutIndex, 1)[0] ?? deck[0]!;
  ctx.setGlobal('_deck_json', JSON.stringify(deck));
  ctx.setGlobal('starter_card_json', JSON.stringify(starterCard));

  if (starterCard.rank === 'J') {
    const dealerIndex = ctx.globals['dealer_index'] as number ?? 0;
    const playerOrder = getPlayerOrder(ctx);
    const dealerId = playerOrder[dealerIndex];
    if (dealerId) {
      const dealerInfo = ctx.playerInfo.find(p => p.id === dealerId);
      ctx.addPoints(dealerId, 2);
      ctx.setGlobal(
        'last_peg_points_json',
        JSON.stringify({
          playerId: dealerId,
          playerName: dealerInfo?.name ?? dealerId,
          points: 2,
          reason: 'His Heels! (Jack cut as starter)',
        }),
      );
      ctx.log('[cribbage] His Heels!', { dealerId });
      checkWin(ctx, dealerId);
    }
  }
}

// ---------------------------------------------------------------------------
// cribbage_start_pegging
// ---------------------------------------------------------------------------

/**
 * Initialize pegging: set active player to left of dealer, reset counters.
 */
export function handleStartPegging(ctx: ExtensionActionContext): void {
  const players = getInternalPlayers(ctx);
  const dealerIndex = ctx.globals['dealer_index'] as number ?? 0;
  const n = players.length;

  ctx.setGlobal('peg_count', 0);
  ctx.setGlobal('played_sequence_json', JSON.stringify([]));
  ctx.setGlobal('go_players_json', JSON.stringify([]));
  ctx.setGlobal('last_peg_points_json', null);

  for (const p of players) {
    p.hasSaidGo = false;
  }
  setInternalPlayers(ctx, players);

  const firstIndex = (dealerIndex + 1) % n;
  const firstPlayer = players[firstIndex];
  if (firstPlayer) {
    ctx.setGlobal('active_player_id', firstPlayer.playerId);
  }

  updatePeggingTurnState(ctx, players);
  ctx.log('[cribbage] Pegging started', { firstPlayerId: firstPlayer?.playerId });
}

// ---------------------------------------------------------------------------
// cribbage_score_hands
// ---------------------------------------------------------------------------

/**
 * Score each player's 4-card hand against the starter.
 * Order: left of dealer first, dealer last.
 */
export function handleScoreHands(ctx: ExtensionActionContext): void {
  const players = getInternalPlayers(ctx);
  const starterCard = parseJson<Card | null>(ctx.globals['starter_card_json'], null);
  if (!starterCard) {
    ctx.log('[cribbage] No starter card for hand scoring');
    return;
  }

  const dealerIndex = ctx.globals['dealer_index'] as number ?? 0;
  const n = players.length;
  const handScores: HandScore[] = [];

  for (let i = 1; i <= n; i++) {
    const idx = (dealerIndex + i) % n;
    const p = players[idx]!;
    const hs = scoreHand(p.scoringHand, starterCard, p.playerId, p.playerName, false);
    handScores.push(hs);

    if (hs.total > 0) {
      ctx.addPoints(p.playerId, hs.total);
      if (checkWin(ctx, p.playerId)) return;
    }

    ctx.setPlayer(p.playerId, 'hand_score_json', JSON.stringify(hs));
  }

  ctx.setGlobal('hand_scores_json', JSON.stringify(handScores));
  ctx.log('[cribbage] Hands scored', {
    scores: handScores.map(h => ({ id: h.playerId, total: h.total })),
  });
}

// ---------------------------------------------------------------------------
// cribbage_score_crib
// ---------------------------------------------------------------------------

/**
 * Score the dealer's crib (4 discarded cards + starter).
 */
export function handleScoreCrib(ctx: ExtensionActionContext): void {
  const players = getInternalPlayers(ctx);
  const starterCard = parseJson<Card | null>(ctx.globals['starter_card_json'], null);
  const crib = parseJson<Card[]>(ctx.globals['_crib_json'], []);

  if (!starterCard || crib.length === 0) {
    ctx.log('[cribbage] Skipping crib score (no starter or empty crib)');
    return;
  }

  const dealerIndex = ctx.globals['dealer_index'] as number ?? 0;
  const dealer = players[dealerIndex];
  if (!dealer) return;

  const cribScore = scoreHand(crib, starterCard, dealer.playerId, dealer.playerName, true);
  ctx.setGlobal('crib_score_json', JSON.stringify(cribScore));

  if (cribScore.total > 0) {
    ctx.addPoints(dealer.playerId, cribScore.total);
    checkWin(ctx, dealer.playerId);
  }

  ctx.log('[cribbage] Crib scored', { dealerId: dealer.playerId, total: cribScore.total });
}

// ---------------------------------------------------------------------------
// cribbage_rotate_dealer
// ---------------------------------------------------------------------------

/**
 * Advance dealer index for the next round.
 */
export function handleRotateDealer(ctx: ExtensionActionContext): void {
  const players = getInternalPlayers(ctx);
  const n = players.length;
  const oldIndex = ctx.globals['dealer_index'] as number ?? 0;
  const newIndex = (oldIndex + 1) % n;
  ctx.setGlobal('dealer_index', newIndex);
  ctx.log('[cribbage] Dealer rotated', { from: oldIndex, to: newIndex });
}

// ---------------------------------------------------------------------------
// handleCribbageInput — Player input routing
// ---------------------------------------------------------------------------

export interface CribbageInputResult {
  accepted: boolean;
  reason?: string;
  /** When true, the CribbageGameModule should signal the phase machine to advance. */
  phaseComplete?: boolean;
}

/**
 * Route player input for cribbage.
 * Called from CribbageGameModule (not via action handler hook).
 *
 * @param ctx          - Extension action context
 * @param playerId     - Player submitting input
 * @param payload      - Input payload from client
 * @param currentPhase - Current phase identifier (from CribbageGameModule)
 */
export function handleCribbageInput(
  ctx: ExtensionActionContext,
  playerId: string,
  payload: Record<string, unknown>,
  currentPhase: string,
): CribbageInputResult {
  const action = String(payload['action'] ?? '');

  switch (action) {
    case 'discard':
      return handleDiscard(ctx, playerId, payload, currentPhase);
    case 'play_card':
      return handlePlayCard(ctx, playerId, payload, currentPhase);
    case 'go':
      return handleGo(ctx, playerId, currentPhase);
    default:
      return { accepted: false, reason: `Unknown action: ${action}` };
  }
}

// ---------------------------------------------------------------------------
// Discard handler
// ---------------------------------------------------------------------------

function handleDiscard(
  ctx: ExtensionActionContext,
  playerId: string,
  payload: Record<string, unknown>,
  currentPhase: string,
): CribbageInputResult {
  if (currentPhase !== 'discard') {
    return { accepted: false, reason: 'Not in discard phase' };
  }

  const players = getInternalPlayers(ctx);
  const n = players.length;
  const discardCount = CR_DISCARD_COUNT[n] ?? 1;
  const player = players.find(p => p.playerId === playerId);
  if (!player) return { accepted: false, reason: 'Player not found' };

  if (player.cribCards.length >= discardCount) {
    return { accepted: false, reason: 'Already discarded' };
  }

  const rawIds = payload['cardIds'];
  if (!Array.isArray(rawIds)) {
    return { accepted: false, reason: 'cardIds must be an array' };
  }
  const cardIds = rawIds.map(String);
  if (cardIds.length !== discardCount) {
    return { accepted: false, reason: `Must discard exactly ${discardCount} card(s)` };
  }

  const toDiscard: Card[] = [];
  for (const id of cardIds) {
    const card = player.hand.find(c => c.id === id);
    if (!card) return { accepted: false, reason: `Card ${id} not in hand` };
    toDiscard.push(card);
  }

  for (const card of toDiscard) {
    player.hand = player.hand.filter(c => c.id !== card.id);
    player.cribCards.push(card);
  }
  player.selectedForDiscard = [];
  player.scoringHand = [...player.hand];

  ctx.setPlayer(playerId, 'has_discarded', true);
  ctx.setPlayer(playerId, 'hand_json', JSON.stringify(player.hand));
  ctx.setPlayer(playerId, 'crib_cards_json', JSON.stringify(player.cribCards));
  ctx.setPlayer(playerId, 'hand_size', player.hand.length);

  const discardsDone = parseJson<Record<string, boolean>>(
    ctx.globals['discards_done_json'],
    {},
  );
  discardsDone[playerId] = true;
  ctx.setGlobal('discards_done_json', JSON.stringify(discardsDone));

  setInternalPlayers(ctx, players);

  const allDiscarded = players.every(p => p.cribCards.length >= discardCount);
  ctx.log('[cribbage] Player discarded', { playerId, count: discardCount, allDiscarded });

  return { accepted: true, phaseComplete: allDiscarded };
}

// ---------------------------------------------------------------------------
// Play card handler
// ---------------------------------------------------------------------------

function handlePlayCard(
  ctx: ExtensionActionContext,
  playerId: string,
  payload: Record<string, unknown>,
  currentPhase: string,
): CribbageInputResult {
  if (currentPhase !== 'pegging') {
    return { accepted: false, reason: 'Not in pegging phase' };
  }

  const activePlayerId = ctx.globals['active_player_id'] as string | null;
  if (activePlayerId !== playerId) {
    return { accepted: false, reason: 'Not your turn' };
  }

  const players = getInternalPlayers(ctx);
  const player = players.find(p => p.playerId === playerId);
  if (!player) return { accepted: false, reason: 'Player not found' };

  const cardId = String(payload['cardId'] ?? '');
  const card = player.hand.find(c => c.id === cardId);
  if (!card) return { accepted: false, reason: 'Card not in hand' };

  const pegCount = ctx.globals['peg_count'] as number ?? 0;
  if (cardValue(card) + pegCount > CR_PEGGING_TARGET) {
    return { accepted: false, reason: 'Card would exceed 31' };
  }

  return executePlayCard(ctx, players, player, card);
}

function executePlayCard(
  ctx: ExtensionActionContext,
  players: InternalPlayer[],
  player: InternalPlayer,
  card: Card,
): CribbageInputResult {
  player.hand = player.hand.filter(c => c.id !== card.id);
  player.hasSaidGo = false;

  const playedSequence = parseJson<PlayedCard[]>(ctx.globals['played_sequence_json'], []);
  const allPlayedCards = parseJson<PlayedCard[]>(ctx.globals['all_played_cards_json'], []);

  const playedEntry: PlayedCard = {
    card,
    playerId: player.playerId,
    playerName: player.playerName,
  };
  playedSequence.push(playedEntry);
  allPlayedCards.push(playedEntry);

  let pegCount = ctx.globals['peg_count'] as number ?? 0;
  pegCount += cardValue(card);

  const pegItems = scorePegging(playedSequence.map(p => p.card), pegCount);
  const points = pegItems.reduce((s, i) => s + i.points, 0);

  if (points > 0) {
    ctx.addPoints(player.playerId, points);
    const reason = pegItems.map(i => i.label).join(', ');
    ctx.setGlobal(
      'last_peg_points_json',
      JSON.stringify({
        playerId: player.playerId,
        playerName: player.playerName,
        points,
        reason,
      }),
    );
  } else {
    ctx.setGlobal('last_peg_points_json', null);
  }

  ctx.setGlobal('peg_count', pegCount);
  ctx.setGlobal('played_sequence_json', JSON.stringify(playedSequence));
  ctx.setGlobal('all_played_cards_json', JSON.stringify(allPlayedCards));
  ctx.setPlayer(player.playerId, 'hand_json', JSON.stringify(player.hand));
  ctx.setPlayer(player.playerId, 'hand_size', player.hand.length);
  setInternalPlayers(ctx, players);

  // Check win after scoring
  if (points > 0 && checkWin(ctx, player.playerId)) {
    updatePeggingTurnState(ctx, players);
    return { accepted: true, phaseComplete: true };
  }

  // Exactly 31 — reset the series
  if (pegCount === CR_PEGGING_TARGET) {
    return resetPeggingSeries(ctx, players);
  }

  return advancePegging(ctx, players);
}

// ---------------------------------------------------------------------------
// Go handler
// ---------------------------------------------------------------------------

function handleGo(
  ctx: ExtensionActionContext,
  playerId: string,
  currentPhase: string,
): CribbageInputResult {
  if (currentPhase !== 'pegging') {
    return { accepted: false, reason: 'Not in pegging phase' };
  }

  const activePlayerId = ctx.globals['active_player_id'] as string | null;
  if (activePlayerId !== playerId) {
    return { accepted: false, reason: 'Not your turn' };
  }

  const players = getInternalPlayers(ctx);
  const player = players.find(p => p.playerId === playerId);
  if (!player) return { accepted: false, reason: 'Player not found' };

  const pegCount = ctx.globals['peg_count'] as number ?? 0;
  const playable = player.hand.filter(c => cardValue(c) + pegCount <= CR_PEGGING_TARGET);
  if (playable.length > 0) {
    return { accepted: false, reason: 'You have playable cards' };
  }

  const goPlayers = parseJson<string[]>(ctx.globals['go_players_json'], []);
  if (!goPlayers.includes(player.playerId)) {
    goPlayers.push(player.playerId);
  }
  player.hasSaidGo = true;
  ctx.setGlobal('go_players_json', JSON.stringify(goPlayers));
  setInternalPlayers(ctx, players);

  ctx.log('[cribbage] Go!', { playerId: player.playerId });
  return advancePegging(ctx, players);
}

// ---------------------------------------------------------------------------
// Pegging advancement helpers
// ---------------------------------------------------------------------------

function advancePegging(
  ctx: ExtensionActionContext,
  players: InternalPlayer[],
): CribbageInputResult {
  const n = players.length;
  const pegCount = ctx.globals['peg_count'] as number ?? 0;
  const playedSequence = parseJson<PlayedCard[]>(ctx.globals['played_sequence_json'], []);

  // No cards left anywhere — end pegging
  const anyCardsLeft = players.some(p => p.hand.length > 0);
  if (!anyCardsLeft) {
    const lastPlayed = playedSequence[playedSequence.length - 1];
    if (lastPlayed && pegCount < CR_PEGGING_TARGET) {
      ctx.addPoints(lastPlayed.playerId, 1);
      ctx.setGlobal(
        'last_peg_points_json',
        JSON.stringify({
          playerId: lastPlayed.playerId,
          playerName: lastPlayed.playerName,
          points: 1,
          reason: 'Last card!',
        }),
      );
      if (checkWin(ctx, lastPlayed.playerId)) {
        updatePeggingTurnState(ctx, players);
        return { accepted: true, phaseComplete: true };
      }
    }
    updatePeggingTurnState(ctx, players);
    return { accepted: true, phaseComplete: true };
  }

  // Check if all players with cards have said go or can't play
  const playersWithCards = players.filter(p => p.hand.length > 0);
  const allGoOrCantPlay = playersWithCards.every(p => {
    const canPlay = p.hand.some(c => cardValue(c) + pegCount <= CR_PEGGING_TARGET);
    return !canPlay || p.hasSaidGo;
  });

  if (allGoOrCantPlay) {
    const lastPlayed = playedSequence[playedSequence.length - 1];
    if (lastPlayed) {
      ctx.addPoints(lastPlayed.playerId, 1);
      ctx.setGlobal(
        'last_peg_points_json',
        JSON.stringify({
          playerId: lastPlayed.playerId,
          playerName: lastPlayed.playerName,
          points: 1,
          reason: 'Go!',
        }),
      );
      if (checkWin(ctx, lastPlayed.playerId)) {
        updatePeggingTurnState(ctx, players);
        return { accepted: true, phaseComplete: true };
      }
    }
    return resetPeggingSeries(ctx, players);
  }

  // Advance to next player who can play and hasn't said go
  const currentActiveId = ctx.globals['active_player_id'] as string;
  let currentIndex = players.findIndex(p => p.playerId === currentActiveId);
  if (currentIndex === -1) currentIndex = 0;

  let nextIndex = (currentIndex + 1) % n;
  for (let i = 0; i < n; i++) {
    const p = players[nextIndex]!;
    const canPlay =
      p.hand.length > 0 &&
      !p.hasSaidGo &&
      p.hand.some(c => cardValue(c) + pegCount <= CR_PEGGING_TARGET);
    if (canPlay) {
      ctx.setGlobal('active_player_id', p.playerId);
      break;
    }
    nextIndex = (nextIndex + 1) % n;
  }

  updatePeggingTurnState(ctx, players);
  return { accepted: true, phaseComplete: false };
}

function resetPeggingSeries(
  ctx: ExtensionActionContext,
  players: InternalPlayer[],
): CribbageInputResult {
  ctx.setGlobal('peg_count', 0);
  ctx.setGlobal('played_sequence_json', JSON.stringify([]));
  ctx.setGlobal('go_players_json', JSON.stringify([]));

  for (const p of players) {
    p.hasSaidGo = false;
  }
  setInternalPlayers(ctx, players);

  // If all hands are empty after reset, pegging is done
  const anyCardsLeft = players.some(p => p.hand.length > 0);
  if (!anyCardsLeft) {
    updatePeggingTurnState(ctx, players);
    return { accepted: true, phaseComplete: true };
  }

  // Start next series from left of dealer (first player with cards)
  const dealerIndex = ctx.globals['dealer_index'] as number ?? 0;
  const n = players.length;
  let startIndex = (dealerIndex + 1) % n;
  for (let i = 0; i < n; i++) {
    const p = players[startIndex]!;
    if (p.hand.length > 0) break;
    startIndex = (startIndex + 1) % n;
  }

  const nextPlayer = players[startIndex];
  if (nextPlayer) {
    ctx.setGlobal('active_player_id', nextPlayer.playerId);
  }

  updatePeggingTurnState(ctx, players);
  return { accepted: true, phaseComplete: false };
}

// ---------------------------------------------------------------------------
// Per-player pegging turn state
// ---------------------------------------------------------------------------

function updatePeggingTurnState(
  ctx: ExtensionActionContext,
  players: InternalPlayer[],
): void {
  const activePlayerId = ctx.globals['active_player_id'] as string | null;
  const pegCount = ctx.globals['peg_count'] as number ?? 0;

  for (const p of players) {
    const isMyTurn = p.playerId === activePlayerId;
    const playableCardIds = p.hand
      .filter(c => cardValue(c) + pegCount <= CR_PEGGING_TARGET)
      .map(c => c.id);
    const canPlay = playableCardIds.length > 0;

    ctx.setPlayer(p.playerId, 'is_my_turn', isMyTurn);
    ctx.setPlayer(p.playerId, 'can_play', canPlay);
    ctx.setPlayer(p.playerId, 'playable_card_ids_json', JSON.stringify(playableCardIds));
  }
}

// ---------------------------------------------------------------------------
// Win check
// ---------------------------------------------------------------------------

function checkWin(ctx: ExtensionActionContext, playerId: string): boolean {
  const score = ctx.getScore(playerId);
  if (score >= CR_WIN_SCORE) {
    const info = ctx.playerInfo.find(p => p.id === playerId);
    ctx.setGlobal(
      'winner_json',
      JSON.stringify({ playerId, playerName: info?.name ?? playerId }),
    );
    ctx.log('[cribbage] Winner!', { playerId, score });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Extension action name registry
// ---------------------------------------------------------------------------

export const CRIBBAGE_ACTIONS = [
  'cribbage_deal_round',
  'cribbage_reset_discard_state',
  'cribbage_finalize_discards',
  'cribbage_cut_starter',
  'cribbage_start_pegging',
  'cribbage_score_hands',
  'cribbage_score_crib',
  'cribbage_rotate_dealer',
] as const;

export type CribbageActionName = (typeof CRIBBAGE_ACTIONS)[number];

export function isCribbageAction(name: string): name is CribbageActionName {
  return (CRIBBAGE_ACTIONS as readonly string[]).includes(name);
}

export function dispatchCribbageAction(
  actionName: CribbageActionName,
  ctx: ExtensionActionContext,
): void {
  switch (actionName) {
    case 'cribbage_deal_round':
      handleDealRound(ctx);
      break;
    case 'cribbage_reset_discard_state':
      handleResetDiscardState(ctx);
      break;
    case 'cribbage_finalize_discards':
      handleFinalizeDiscards(ctx);
      break;
    case 'cribbage_cut_starter':
      handleCutStarter(ctx);
      break;
    case 'cribbage_start_pegging':
      handleStartPegging(ctx);
      break;
    case 'cribbage_score_hands':
      handleScoreHands(ctx);
      break;
    case 'cribbage_score_crib':
      handleScoreCrib(ctx);
      break;
    case 'cribbage_rotate_dealer':
      handleRotateDealer(ctx);
      break;
    default: {
      const _exhaustive: never = actionName;
      void _exhaustive;
    }
  }
}
