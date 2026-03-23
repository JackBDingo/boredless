/**
 * extensions/index.ts — Texas Hold'em V2 extension registration and action handlers.
 *
 * This module is the entry point for the texas-holdem-core extension package.
 * It implements all complex game logic that exceeds the declarative system:
 *
 *   th_deal_hand         — shuffle deck, deal hole cards, post blinds
 *   th_deal_flop         — deal 3 community cards + reset betting
 *   th_deal_turn         — deal 1 community card + reset betting
 *   th_deal_river        — deal 1 community card + reset betting
 *   th_showdown_evaluate — evaluate hands, calculate side pots, award chips
 *
 * The conditional "th_is_game_over" is evaluated by the game-module factory
 * when the interpreter encounters it in on_exit conditions.
 *
 * Architecture Note:
 *   These extension functions are pure TypeScript — no runtime subsystem imports.
 *   They receive typed state copies via ExtensionActionContext and mutate state
 *   through the setGlobal/setPlayer/addPoints context methods.
 */

import { freshDeck, deal, serializeCards, deserializeCards } from './deck.js';
import type { Card } from './deck.js';
import { evaluateBestHand, compareHands, serializeHandResult } from './hand-evaluator.js';
import type { HandResult } from './hand-evaluator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TH_STARTING_CHIPS = 1000;
const TH_SMALL_BLIND = 10;
const TH_BIG_BLIND = 20;
const TH_BLIND_ESCALATION_HANDS = 10;

// ---------------------------------------------------------------------------
// Extension action context (mirrors interpreter's ExtensionActionContext)
// ---------------------------------------------------------------------------

export interface THActionContext {
  /** Room ID */
  roomId: string;
  /** Current global state snapshot */
  globals: Record<string, unknown>;
  /** Per-player state snapshot: playerId -> fieldMap */
  players: Record<string, Record<string, unknown>>;
  /** Player info (id + name) */
  playerInfo: Array<{ id: string; name: string }>;
  /** Set a global state field */
  setGlobal: (field: string, value: unknown) => void;
  /** Set a per-player state field */
  setPlayer: (playerId: string, field: string, value: unknown) => void;
  /** Get a player's current score */
  getScore: (playerId: string) => number;
  /** Award points to a player */
  addPoints: (playerId: string, amount: number) => void;
  /** Log a message */
  log: (msg: string, data?: unknown) => void;
}

// ---------------------------------------------------------------------------
// Side pot types
// ---------------------------------------------------------------------------

interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

interface WinnerInfo {
  playerId: string;
  playerName: string;
  amount: number;
  handLabel: string;
  cards: Card[];
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function getGlobalInt(globals: Record<string, unknown>, field: string, def = 0): number {
  const v = globals[field];
  return typeof v === 'number' ? v : def;
}

function getGlobalBool(globals: Record<string, unknown>, field: string): boolean {
  return globals[field] === true;
}

function getPlayerBool(player: Record<string, unknown>, field: string): boolean {
  return player[field] === true;
}

function getPlayerInt(player: Record<string, unknown>, field: string, def = 0): number {
  const v = player[field];
  return typeof v === 'number' ? v : def;
}

/** Get all player IDs in seat order */
function getPlayerIds(ctx: THActionContext): string[] {
  return ctx.playerInfo.map(p => p.id);
}

/** Get active (non-folded) player IDs */
function getActivePlayers(ctx: THActionContext): string[] {
  return getPlayerIds(ctx).filter(id => {
    const p = ctx.players[id] ?? {};
    return !getPlayerBool(p, 'folded');
  });
}

/** Get active non-all-in player IDs */
function getActiveNonAllIn(ctx: THActionContext): string[] {
  return getPlayerIds(ctx).filter(id => {
    const p = ctx.players[id] ?? {};
    return !getPlayerBool(p, 'folded') && !getPlayerBool(p, 'all_in') && getPlayerInt(p, 'chips') > 0;
  });
}

/** Get next active (non-folded, non-all-in, has chips) player index from fromIndex */
function getNextActiveIndex(ctx: THActionContext, fromIndex: number): number {
  const ids = getPlayerIds(ctx);
  const n = ids.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromIndex + i) % n;
    const p = ctx.players[ids[idx]!] ?? {};
    if (!getPlayerBool(p, 'folded') && !getPlayerBool(p, 'all_in') && getPlayerInt(p, 'chips') > 0) {
      return idx;
    }
  }
  return fromIndex;
}

/** Calculate side pots for all-in scenarios */
function calculateSidePots(ctx: THActionContext, totalPot: number): SidePot[] {
  const ids = getPlayerIds(ctx);
  const activePlayers = ids.filter(id => !getPlayerBool(ctx.players[id] ?? {}, 'folded'));

  // Get unique bet levels from all-in players
  const allInLevels = activePlayers
    .filter(id => getPlayerBool(ctx.players[id] ?? {}, 'all_in'))
    .map(id => getPlayerInt(ctx.players[id] ?? {}, 'total_bet_this_hand'))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => a - b);

  if (allInLevels.length === 0) {
    return [{ amount: totalPot, eligiblePlayerIds: activePlayers }];
  }

  const pots: SidePot[] = [];
  let previousLevel = 0;

  for (const level of allInLevels) {
    const eligible = activePlayers.filter(
      id => getPlayerInt(ctx.players[id] ?? {}, 'total_bet_this_hand') >= level
    );
    const contribution = (level - previousLevel) * ids.filter(
      id => getPlayerInt(ctx.players[id] ?? {}, 'total_bet_this_hand') >= level
    ).length;
    if (contribution > 0) {
      pots.push({ amount: contribution, eligiblePlayerIds: eligible });
    }
    previousLevel = level;
  }

  // Remaining pot for players above highest all-in
  const maxAllIn = allInLevels[allInLevels.length - 1]!;
  const remainingPlayers = activePlayers.filter(
    id => getPlayerInt(ctx.players[id] ?? {}, 'total_bet_this_hand') > maxAllIn
  );
  if (remainingPlayers.length > 0) {
    const remaining = totalPot - pots.reduce((s, p) => s + p.amount, 0);
    if (remaining > 0) {
      pots.push({ amount: remaining, eligiblePlayerIds: remainingPlayers });
    }
  }

  // Ensure we account for the full pot
  const totalPots = pots.reduce((s, p) => s + p.amount, 0);
  if (totalPots < totalPot && pots.length > 0) {
    pots[pots.length - 1]!.amount += (totalPot - totalPots);
  } else if (totalPots < totalPot) {
    pots.push({ amount: totalPot - totalPots, eligiblePlayerIds: activePlayers });
  }

  return pots;
}

/** Build available actions for a player */
function buildAvailableActions(
  ctx: THActionContext,
  playerId: string,
): Array<{ action: string; minAmount?: number; maxAmount?: number }> {
  const p = ctx.players[playerId] ?? {};
  const chips = getPlayerInt(p, 'chips');
  const currentBet = getPlayerInt(p, 'current_bet');
  const ids = getPlayerIds(ctx);
  const maxBet = Math.max(...ids.map(id => getPlayerInt(ctx.players[id] ?? {}, 'current_bet')));
  const toCall = maxBet - currentBet;
  const lastRaiseAmount = getGlobalInt(ctx.globals, 'last_raise_amount');

  const actions: Array<{ action: string; minAmount?: number; maxAmount?: number }> = [];

  // Fold always available
  actions.push({ action: 'fold' });

  if (toCall === 0) {
    actions.push({ action: 'check' });
  } else if (chips >= toCall) {
    actions.push({ action: 'call', minAmount: toCall, maxAmount: toCall });
  }

  // Raise
  const minRaiseTo = maxBet + lastRaiseAmount;
  const raiseAmount = minRaiseTo - currentBet;
  if (chips > toCall && raiseAmount <= chips) {
    actions.push({
      action: 'raise',
      minAmount: minRaiseTo,
      maxAmount: currentBet + chips,
    });
  }

  // All-in always available if player has chips
  if (chips > 0) {
    actions.push({
      action: 'all-in',
      minAmount: currentBet + chips,
      maxAmount: currentBet + chips,
    });
  }

  return actions;
}

/** Update available actions for all players */
function refreshAvailableActions(ctx: THActionContext): void {
  const activePlayerIndex = getGlobalInt(ctx.globals, 'active_player_index');
  const ids = getPlayerIds(ctx);
  const activePlayerId = ids[activePlayerIndex] ?? null;

  for (const id of ids) {
    const p = ctx.players[id] ?? {};
    if (!getPlayerBool(p, 'folded') && !getPlayerBool(p, 'all_in') && id === activePlayerId) {
      const actions = buildAvailableActions(ctx, id);
      ctx.setPlayer(id, 'available_actions_json', JSON.stringify(actions));
    } else {
      ctx.setPlayer(id, 'available_actions_json', null);
    }
  }
  ctx.setGlobal('active_player_id', activePlayerId);
}

/** Reset per-player betting round state */
function resetBettingRound(ctx: THActionContext): void {
  const ids = getPlayerIds(ctx);
  for (const id of ids) {
    ctx.setPlayer(id, 'current_bet', 0);
    ctx.setPlayer(id, 'has_acted', false);
  }
  ctx.setGlobal('last_raise_amount', getGlobalInt(ctx.globals, 'big_blind'));
}

// ---------------------------------------------------------------------------
// th_deal_hand
// ---------------------------------------------------------------------------

/**
 * Called on_enter of th_preflop.
 * - Increments hand_number
 * - Escalates blinds every TH_BLIND_ESCALATION_HANDS hands
 * - Advances dealer button
 * - Resets all player hand state
 * - Shuffles and deals 2 hole cards per active player
 * - Posts small blind and big blind
 * - Sets active_player_index to first actor (left of BB preflop)
 */
export function handleDealHand(ctx: THActionContext): void {
  const ids = getPlayerIds(ctx);
  const n = ids.length;
  if (n === 0) return;

  // Increment hand number
  const handNumber = getGlobalInt(ctx.globals, 'hand_number') + 1;
  ctx.setGlobal('hand_number', handNumber);

  // Escalate blinds every N hands (starting from hand 2)
  let smallBlind = getGlobalInt(ctx.globals, 'small_blind', TH_SMALL_BLIND);
  let bigBlind = getGlobalInt(ctx.globals, 'big_blind', TH_BIG_BLIND);
  if (handNumber > 1 && (handNumber - 1) % TH_BLIND_ESCALATION_HANDS === 0) {
    smallBlind *= 2;
    bigBlind *= 2;
    ctx.setGlobal('small_blind', smallBlind);
    ctx.setGlobal('big_blind', bigBlind);
    ctx.log('[th] Blinds escalated', { smallBlind, bigBlind });
  }

  // Advance dealer button (skip players with no chips)
  let dealerIndex = getGlobalInt(ctx.globals, 'dealer_index');
  if (handNumber > 1) {
    dealerIndex = (dealerIndex + 1) % n;
    while (getPlayerInt(ctx.players[ids[dealerIndex]!] ?? {}, 'chips') <= 0) {
      dealerIndex = (dealerIndex + 1) % n;
    }
    ctx.setGlobal('dealer_index', dealerIndex);
  }

  // Reset per-player state
  for (const id of ids) {
    const chips = getPlayerInt(ctx.players[id] ?? {}, 'chips');
    ctx.setPlayer(id, 'hole_cards_json', null);
    ctx.setPlayer(id, 'current_bet', 0);
    ctx.setPlayer(id, 'total_bet_this_hand', 0);
    ctx.setPlayer(id, 'folded', chips <= 0); // Eliminated players auto-fold
    ctx.setPlayer(id, 'all_in', false);
    ctx.setPlayer(id, 'has_acted', false);
    ctx.setPlayer(id, 'hand_result_json', null);
    ctx.setPlayer(id, 'available_actions_json', null);
  }

  // Reset table state
  ctx.setGlobal('community_cards_json', null);
  ctx.setGlobal('pot', 0);
  ctx.setGlobal('side_pots_json', null);
  ctx.setGlobal('winners_json', null);
  ctx.setGlobal('last_action_json', null);
  ctx.setGlobal('last_raise_amount', bigBlind);
  ctx.setGlobal('phase_advancing', false);

  // Create and shuffle deck
  const deck = freshDeck();
  ctx.setGlobal('deck_json', JSON.stringify(deck));

  // Deal 2 hole cards to each active player
  for (const id of ids) {
    if (!getPlayerBool(ctx.players[id] ?? {}, 'folded')) {
      const holeCards = deal(deck, 2);
      ctx.setPlayer(id, 'hole_cards_json', serializeCards(holeCards));
    }
  }
  // Update deck after dealing
  ctx.setGlobal('deck_json', JSON.stringify(deck));

  // Post blinds
  // Heads-up (2 players): dealer is SB, other is BB
  // 3+ players: left of dealer is SB, next is BB
  const sbIndex = n === 2 ? dealerIndex : (dealerIndex + 1) % n;
  const bbIndex = n === 2 ? (dealerIndex + 1) % n : (dealerIndex + 2) % n;

  const sbId = ids[sbIndex]!;
  const bbId = ids[bbIndex]!;

  let pot = 0;

  // Small blind
  const sbChips = getPlayerInt(ctx.players[sbId] ?? {}, 'chips');
  const sbAmount = Math.min(smallBlind, sbChips);
  const sbNewChips = sbChips - sbAmount;
  ctx.setPlayer(sbId, 'chips', sbNewChips);
  ctx.setPlayer(sbId, 'current_bet', sbAmount);
  ctx.setPlayer(sbId, 'total_bet_this_hand', sbAmount);
  if (sbNewChips === 0) ctx.setPlayer(sbId, 'all_in', true);
  pot += sbAmount;

  // Big blind
  const bbChips = getPlayerInt(ctx.players[bbId] ?? {}, 'chips');
  const bbAmount = Math.min(bigBlind, bbChips);
  const bbNewChips = bbChips - bbAmount;
  ctx.setPlayer(bbId, 'chips', bbNewChips);
  ctx.setPlayer(bbId, 'current_bet', bbAmount);
  ctx.setPlayer(bbId, 'total_bet_this_hand', bbAmount);
  if (bbNewChips === 0) ctx.setPlayer(bbId, 'all_in', true);
  pot += bbAmount;

  ctx.setGlobal('pot', pot);

  // Pre-flop: first to act is left of BB
  const firstActorIndex = getNextActiveIndex(ctx, bbIndex);
  ctx.setGlobal('active_player_index', firstActorIndex);

  refreshAvailableActions(ctx);

  ctx.log('[th] Hand dealt', {
    handNumber,
    dealerIndex,
    sbIndex,
    bbIndex,
    pot,
    smallBlind,
    bigBlind,
  });
}

// ---------------------------------------------------------------------------
// th_deal_flop / th_deal_turn / th_deal_river
// ---------------------------------------------------------------------------

/** Deal community cards and reset betting round. */
function dealCommunityCards(ctx: THActionContext, count: number, phase: string): void {
  const deckJson = ctx.globals['deck_json'];
  const deck = typeof deckJson === 'string' ? (JSON.parse(deckJson) as Card[]) : [];

  const existing = deserializeCards(
    typeof ctx.globals['community_cards_json'] === 'string'
      ? ctx.globals['community_cards_json']
      : null
  );
  const newCards = deal(deck, count);
  const community = [...existing, ...newCards];

  ctx.setGlobal('deck_json', JSON.stringify(deck));
  ctx.setGlobal('community_cards_json', serializeCards(community));

  // Reset betting round state
  resetBettingRound(ctx);

  // Post-flop: first to act is left of dealer
  const dealerIndex = getGlobalInt(ctx.globals, 'dealer_index');
  const firstActorIndex = getNextActiveIndex(ctx, dealerIndex);
  ctx.setGlobal('active_player_index', firstActorIndex);

  refreshAvailableActions(ctx);

  ctx.log(`[th] Dealt ${phase}`, { communityCount: community.length });
}

/** Called on_enter of th_flop — deal 3 community cards. */
export function handleDealFlop(ctx: THActionContext): void {
  dealCommunityCards(ctx, 3, 'flop');
}

/** Called on_enter of th_turn — deal 1 community card. */
export function handleDealTurn(ctx: THActionContext): void {
  dealCommunityCards(ctx, 1, 'turn');
}

/** Called on_enter of th_river — deal 1 community card. */
export function handleDealRiver(ctx: THActionContext): void {
  dealCommunityCards(ctx, 1, 'river');
}

// ---------------------------------------------------------------------------
// th_showdown_evaluate
// ---------------------------------------------------------------------------

/**
 * Called on_enter of th_showdown.
 * - Deals any remaining community cards (if all-in run-out)
 * - Evaluates all remaining hands
 * - Calculates side pots
 * - Awards chips to winners
 * - Stores WinnerInfo[] in globals.winners_json
 * - Updates hand_result_json for each non-folded player
 * - Updates scores (chips = score)
 */
export function handleShowdownEvaluate(ctx: THActionContext): void {
  const ids = getPlayerIds(ctx);

  // Deal remaining community cards if needed (run-out for all-in)
  const deckJson = ctx.globals['deck_json'];
  const deck = typeof deckJson === 'string' ? (JSON.parse(deckJson) as Card[]) : [];
  const community = deserializeCards(
    typeof ctx.globals['community_cards_json'] === 'string'
      ? ctx.globals['community_cards_json']
      : null
  );
  while (community.length < 5 && deck.length > 0) {
    community.push(...deal(deck, 1));
  }
  ctx.setGlobal('deck_json', JSON.stringify(deck));
  ctx.setGlobal('community_cards_json', serializeCards(community));

  const totalPot = getGlobalInt(ctx.globals, 'pot');
  const activePlayers = ids.filter(id => !getPlayerBool(ctx.players[id] ?? {}, 'folded'));

  // Evaluate hands for all active players
  const handResults: Array<{ playerId: string; result: HandResult }> = [];
  for (const id of activePlayers) {
    const holeCardsJson = ctx.players[id]?.['hole_cards_json'];
    const holeCards = deserializeCards(
      typeof holeCardsJson === 'string' ? holeCardsJson : null
    );
    const result = evaluateBestHand(holeCards, community);
    handResults.push({ playerId: id, result });
    ctx.setPlayer(id, 'hand_result_json', serializeHandResult(result));
  }

  // Calculate side pots
  const pots = calculateSidePots(ctx, totalPot);

  // Determine winners for each pot
  const winners: WinnerInfo[] = [];

  for (const pot of pots) {
    const eligible = handResults.filter(h => pot.eligiblePlayerIds.includes(h.playerId));
    if (eligible.length === 0) continue;

    eligible.sort((a, b) => compareHands(b.result, a.result));

    const bestHand = eligible[0]!;
    const tiedWinners = eligible.filter(h => compareHands(h.result, bestHand.result) === 0);

    const share = Math.floor(pot.amount / tiedWinners.length);

    for (const w of tiedWinners) {
      const playerName = ctx.playerInfo.find(p => p.id === w.playerId)?.name ?? w.playerId;
      const existing = winners.find(wi => wi.playerId === w.playerId);
      if (existing) {
        existing.amount += share;
      } else {
        winners.push({
          playerId: w.playerId,
          playerName,
          amount: share,
          handLabel: w.result.label,
          cards: w.result.bestCards,
        });
      }

      // Award chips
      const currentChips = getPlayerInt(ctx.players[w.playerId] ?? {}, 'chips');
      ctx.setPlayer(w.playerId, 'chips', currentChips + share);
    }
  }

  ctx.setGlobal('winners_json', JSON.stringify(winners));
  ctx.setGlobal('side_pots_json', JSON.stringify(pots));

  // Update scores: chips = score (sync score engine)
  for (const id of ids) {
    const chips = getPlayerInt(ctx.players[id] ?? {}, 'chips');
    const currentScore = ctx.getScore(id);
    const diff = chips - currentScore;
    if (diff > 0) {
      ctx.addPoints(id, diff);
    }
  }

  // Check if game is over (only 1 player has chips)
  const playersWithChips = ids.filter(id => getPlayerInt(ctx.players[id] ?? {}, 'chips') > 0);
  ctx.setGlobal('game_over_flag', playersWithChips.length <= 1);

  ctx.log('[th] Showdown evaluated', {
    winners: winners.map(w => ({ id: w.playerId, amount: w.amount, hand: w.handLabel })),
    gameOver: playersWithChips.length <= 1,
  });
}

// ---------------------------------------------------------------------------
// Betting action handler
// ---------------------------------------------------------------------------

/**
 * Handle a player betting action (fold/check/call/raise/all-in).
 * Called by the game-module when a 'bet' input is received from a player.
 *
 * Returns { accepted, reason, handOver } where handOver means only one player remains.
 */
export function handleBetAction(
  ctx: THActionContext,
  playerId: string,
  payload: Record<string, unknown>,
): { accepted: boolean; reason?: string; handOver?: boolean; bettingComplete?: boolean } {
  const ids = getPlayerIds(ctx);
  const activePlayerIndex = getGlobalInt(ctx.globals, 'active_player_index');
  const activePlayerId = ids[activePlayerIndex];

  if (activePlayerId !== playerId) {
    return { accepted: false, reason: 'Not your turn' };
  }

  const action = String(payload['action'] ?? '');
  const amount = Number(payload['amount'] ?? 0);
  const p = ctx.players[playerId] ?? {};

  const chips = getPlayerInt(p, 'chips');
  const currentBet = getPlayerInt(p, 'current_bet');
  const maxBet = Math.max(...ids.map(id => getPlayerInt(ctx.players[id] ?? {}, 'current_bet')));
  const toCall = maxBet - currentBet;
  const lastRaiseAmount = getGlobalInt(ctx.globals, 'last_raise_amount');
  let pot = getGlobalInt(ctx.globals, 'pot');

  switch (action) {
    case 'fold':
      ctx.setPlayer(playerId, 'folded', true);
      break;

    case 'check': {
      if (currentBet < maxBet) {
        return { accepted: false, reason: 'Cannot check — must call or fold' };
      }
      break;
    }

    case 'call': {
      const callAmount = Math.min(toCall, chips);
      const newChips = chips - callAmount;
      const newBet = currentBet + callAmount;
      const newTotal = getPlayerInt(p, 'total_bet_this_hand') + callAmount;
      ctx.setPlayer(playerId, 'chips', newChips);
      ctx.setPlayer(playerId, 'current_bet', newBet);
      ctx.setPlayer(playerId, 'total_bet_this_hand', newTotal);
      pot += callAmount;
      ctx.setGlobal('pot', pot);
      if (newChips === 0) ctx.setPlayer(playerId, 'all_in', true);
      break;
    }

    case 'raise': {
      if (amount < maxBet + lastRaiseAmount) {
        // Allow if it's an all-in for less
        if (amount !== currentBet + chips) {
          return { accepted: false, reason: 'Raise too small' };
        }
      }
      const raiseBy = amount - currentBet;
      if (raiseBy > chips) {
        return { accepted: false, reason: 'Not enough chips' };
      }
      const newLastRaise = Math.max(lastRaiseAmount, amount - maxBet);
      ctx.setGlobal('last_raise_amount', newLastRaise);
      const newChips = chips - raiseBy;
      ctx.setPlayer(playerId, 'chips', newChips);
      ctx.setPlayer(playerId, 'current_bet', amount);
      ctx.setPlayer(playerId, 'total_bet_this_hand', getPlayerInt(p, 'total_bet_this_hand') + raiseBy);
      pot += raiseBy;
      ctx.setGlobal('pot', pot);
      if (newChips === 0) ctx.setPlayer(playerId, 'all_in', true);
      // Reset hasActed for other active players (they need to respond)
      for (const id of ids) {
        if (id !== playerId && !getPlayerBool(ctx.players[id] ?? {}, 'folded') && !getPlayerBool(ctx.players[id] ?? {}, 'all_in')) {
          ctx.setPlayer(id, 'has_acted', false);
        }
      }
      break;
    }

    case 'all-in': {
      const allInAmount = chips;
      const newBet = currentBet + allInAmount;
      const newTotal = getPlayerInt(p, 'total_bet_this_hand') + allInAmount;
      if (newBet > maxBet) {
        const newLastRaise = Math.max(lastRaiseAmount, newBet - maxBet);
        ctx.setGlobal('last_raise_amount', newLastRaise);
        for (const id of ids) {
          if (id !== playerId && !getPlayerBool(ctx.players[id] ?? {}, 'folded') && !getPlayerBool(ctx.players[id] ?? {}, 'all_in')) {
            ctx.setPlayer(id, 'has_acted', false);
          }
        }
      }
      ctx.setPlayer(playerId, 'chips', 0);
      ctx.setPlayer(playerId, 'current_bet', newBet);
      ctx.setPlayer(playerId, 'total_bet_this_hand', newTotal);
      ctx.setPlayer(playerId, 'all_in', true);
      pot += allInAmount;
      ctx.setGlobal('pot', pot);
      break;
    }

    default:
      return { accepted: false, reason: 'Unknown action' };
  }

  ctx.setPlayer(playerId, 'has_acted', true);
  ctx.setGlobal('last_action_json', JSON.stringify({
    playerId,
    playerName: ctx.playerInfo.find(p => p.id === playerId)?.name ?? playerId,
    action,
    amount: getPlayerInt(ctx.players[playerId] ?? {}, 'current_bet'),
  }));

  // Check last-man-standing (win by fold)
  const remaining = ids.filter(id => !getPlayerBool(ctx.players[id] ?? {}, 'folded'));
  if (remaining.length === 1) {
    const winnerId = remaining[0]!;
    const winnerName = ctx.playerInfo.find(p => p.id === winnerId)?.name ?? winnerId;
    const winnerChips = getPlayerInt(ctx.players[winnerId] ?? {}, 'chips');
    ctx.setPlayer(winnerId, 'chips', winnerChips + pot);
    ctx.setGlobal('pot', 0);
    ctx.setGlobal('winners_json', JSON.stringify([{
      playerId: winnerId,
      playerName: winnerName,
      amount: pot,
      handLabel: 'Last player standing',
      cards: [],
    }]));
    // Update scores
    const newChips = winnerChips + pot;
    const currentScore = ctx.getScore(winnerId);
    if (newChips > currentScore) ctx.addPoints(winnerId, newChips - currentScore);
    // Check game over
    const playersWithChips = ids.filter(id => getPlayerInt(ctx.players[id] ?? {}, 'chips') > 0);
    ctx.setGlobal('game_over_flag', playersWithChips.length <= 1);
    ctx.log('[th] Hand won by last player standing', { winnerId, amount: pot });
    return { accepted: true, handOver: true };
  }

  // Check if betting round is complete
  const activeNonAllIn = getActiveNonAllIn(ctx);
  const currentMaxBet = Math.max(...ids.map(id => getPlayerInt(ctx.players[id] ?? {}, 'current_bet')));
  const allActed = activeNonAllIn.every(id => {
    const pp = ctx.players[id] ?? {};
    return getPlayerBool(pp, 'has_acted') && getPlayerInt(pp, 'current_bet') === currentMaxBet;
  });

  // Also check if only all-in players remain
  const canStillAct = activeNonAllIn.length;

  if (allActed || canStillAct <= 1) {
    if (canStillAct <= 1 && !allActed) {
      // One or zero non-all-in players — signal betting complete to deal remaining cards
      ctx.log('[th] All players all-in or folded — proceeding to showdown');
      return { accepted: true, bettingComplete: true };
    }
    return { accepted: true, bettingComplete: true };
  }

  // Move to next active player
  const nextIndex = getNextActiveIndex(ctx, activePlayerIndex);
  ctx.setGlobal('active_player_index', nextIndex);
  refreshAvailableActions(ctx);

  ctx.log('[th] Player acted', { playerId, action, nextIndex });
  return { accepted: true };
}

// ---------------------------------------------------------------------------
// Timeout handler
// ---------------------------------------------------------------------------

/**
 * Handle action timeout — auto-fold if cannot check, auto-check otherwise.
 */
export function handleTimeout(ctx: THActionContext): {
  handOver?: boolean;
  bettingComplete?: boolean;
} {
  const ids = getPlayerIds(ctx);
  const activePlayerIndex = getGlobalInt(ctx.globals, 'active_player_index');
  const activePlayerId = ids[activePlayerIndex];
  if (!activePlayerId) return {};

  const p = ctx.players[activePlayerId] ?? {};
  if (getPlayerBool(p, 'folded') || getPlayerBool(p, 'all_in')) return {};

  const maxBet = Math.max(...ids.map(id => getPlayerInt(ctx.players[id] ?? {}, 'current_bet')));
  const currentBet = getPlayerInt(p, 'current_bet');

  if (currentBet >= maxBet) {
    // Auto-check
    ctx.setPlayer(activePlayerId, 'has_acted', true);
    ctx.setGlobal('last_action_json', JSON.stringify({
      playerId: activePlayerId,
      playerName: ctx.playerInfo.find(p => p.id === activePlayerId)?.name ?? activePlayerId,
      action: 'check',
      amount: 0,
    }));
    ctx.log('[th] Player timed out — auto-check', { playerId: activePlayerId });
  } else {
    // Auto-fold
    ctx.setPlayer(activePlayerId, 'folded', true);
    ctx.setPlayer(activePlayerId, 'has_acted', true);
    ctx.setGlobal('last_action_json', JSON.stringify({
      playerId: activePlayerId,
      playerName: ctx.playerInfo.find(p => p.id === activePlayerId)?.name ?? activePlayerId,
      action: 'fold',
      amount: 0,
    }));
    ctx.log('[th] Player timed out — auto-fold', { playerId: activePlayerId });
  }

  // Re-use bet action logic to determine next step
  const remaining = ids.filter(id => !getPlayerBool(ctx.players[id] ?? {}, 'folded'));
  if (remaining.length === 1) {
    const winnerId = remaining[0]!;
    const winnerName = ctx.playerInfo.find(p => p.id === winnerId)?.name ?? winnerId;
    const pot = getGlobalInt(ctx.globals, 'pot');
    const winnerChips = getPlayerInt(ctx.players[winnerId] ?? {}, 'chips');
    ctx.setPlayer(winnerId, 'chips', winnerChips + pot);
    ctx.setGlobal('pot', 0);
    ctx.setGlobal('winners_json', JSON.stringify([{
      playerId: winnerId,
      playerName: winnerName,
      amount: pot,
      handLabel: 'Last player standing',
      cards: [],
    }]));
    const newChips = winnerChips + pot;
    const currentScore = ctx.getScore(winnerId);
    if (newChips > currentScore) ctx.addPoints(winnerId, newChips - currentScore);
    const playersWithChips = ids.filter(id => getPlayerInt(ctx.players[id] ?? {}, 'chips') > 0);
    ctx.setGlobal('game_over_flag', playersWithChips.length <= 1);
    return { handOver: true };
  }

  const activeNonAllIn = getActiveNonAllIn(ctx);
  const currentMaxBet = Math.max(...ids.map(id => getPlayerInt(ctx.players[id] ?? {}, 'current_bet')));
  const allActed = activeNonAllIn.every(id => {
    const pp = ctx.players[id] ?? {};
    return getPlayerBool(pp, 'has_acted') && getPlayerInt(pp, 'current_bet') === currentMaxBet;
  });

  if (allActed || activeNonAllIn.length <= 1) {
    return { bettingComplete: true };
  }

  const nextIndex = getNextActiveIndex(ctx, activePlayerIndex);
  ctx.setGlobal('active_player_index', nextIndex);
  refreshAvailableActions(ctx);

  return {};
}

// ---------------------------------------------------------------------------
// Game over check
// ---------------------------------------------------------------------------

/** Returns true if the game is over (only 0 or 1 player has chips). */
export function isGameOver(ctx: THActionContext): boolean {
  return getGlobalBool(ctx.globals, 'game_over_flag');
}

// ---------------------------------------------------------------------------
// Extension action names
// ---------------------------------------------------------------------------

export type THActionName =
  | 'th_deal_hand'
  | 'th_deal_flop'
  | 'th_deal_turn'
  | 'th_deal_river'
  | 'th_showdown_evaluate';

export function isTHAction(actionName: string): actionName is THActionName {
  return [
    'th_deal_hand',
    'th_deal_flop',
    'th_deal_turn',
    'th_deal_river',
    'th_showdown_evaluate',
  ].includes(actionName);
}

// ---------------------------------------------------------------------------
// Extension declaration
// ---------------------------------------------------------------------------

export const TH_EXTENSION_DECLARATION = {
  id: 'texas-holdem-core',
  name: "Texas Hold'em Core Logic",
  version: '2.0.0',
  type: 'lifecycle' as const,
  description: 'Implements deal, betting, hand evaluation, side pots, blind escalation, and showdown logic.',
  entryPoint: './extensions/index.ts',
};
