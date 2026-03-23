/**
 * extensions/index.ts — Blackjack V2 extension registration.
 *
 * Entry point for the blackjack-core extension package. Exports:
 *   - Extension metadata declaration
 *   - Four phase lifecycle action handlers
 *   - BlackjackActionContext interface
 *   - Action dispatcher
 *
 * Architecture:
 *   Blackjack's four lifecycle hooks handle complex state operations that
 *   exceed the declarative system's built-in actions:
 *
 *   bj_start_betting   — reset round state, initialize/reshuffle shoe
 *   bj_deal_cards      — deal 2 cards per player + 2 to dealer, detect naturals
 *   bj_dealer_play     — dealer reveals hole card, hits to 17+ (stands on soft 17)
 *   bj_resolve_results — compare hands vs dealer, award chips back
 *
 *   Player input (bet/hit/stand/double/split) is handled separately in
 *   game-module.ts via the BlackjackV2Module.handleInput override, which
 *   maintains its own card state and syncs to the declarative phase machine.
 *
 * Extension functions are pure TypeScript — no runtime subsystem imports.
 */

import {
  freshShoe,
  deal,
  handValue,
  isBlackjack,
  serializeShoe,
  deserializeShoe,
  serializeHands,
  deserializeHands,
  serializeCards,
  deserializeCards,
  type Card,
  type PlayerHand,
  type HandResult,
} from './deck.js';

// Re-export types for consumers
export type { Card, PlayerHand, HandResult };

// ---------------------------------------------------------------------------
// Extension declaration (mirrors game.yaml extensions section)
// ---------------------------------------------------------------------------

export const BLACKJACK_EXTENSION_DECLARATION = {
  id: 'blackjack-core',
  name: 'Blackjack Core Logic',
  version: '2.0.0',
  type: 'lifecycle' as const,
  description:
    'Implements dealer AI, card dealing, hand resolution, and betting management.',
  entryPoint: './extensions/index.ts',
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BJ_STARTING_CHIPS = 1000;
export const BJ_DEFAULT_BET = 20;
export const BJ_MIN_BET = 20;
export const BJ_MAX_BET = 500;
export const BJ_NUM_DECKS = 6;
export const BJ_RESHUFFLE_THRESHOLD = 52;

// ---------------------------------------------------------------------------
// Action handler context
// ---------------------------------------------------------------------------

/**
 * Context provided to Blackjack action handlers.
 * Mirrors the interpreter's ExtensionActionContext but scoped to Blackjack.
 */
export interface BlackjackActionContext {
  /** Current global state snapshot */
  globals: Record<string, unknown>;
  /** Per-player state snapshot: playerId → fieldMap */
  players: Record<string, Record<string, unknown>>;
  /** Player info (id + name) */
  playerInfo: Array<{ id: string; name: string }>;
  /** Get a player's current total score */
  getScore: (playerId: string) => number;
  /** Mutate a global state field */
  setGlobal: (field: string, value: unknown) => void;
  /** Mutate a per-player state field */
  setPlayer: (playerId: string, field: string, value: unknown) => void;
  /** Award points to a player */
  addPoints: (playerId: string, amount: number) => void;
  /** Log a message */
  log: (msg: string, data?: unknown) => void;
}

// ---------------------------------------------------------------------------
// State accessors
// ---------------------------------------------------------------------------

export function getShoe(globals: Record<string, unknown>): Card[] {
  return deserializeShoe(globals['shoe_json'] as string | null);
}

export function getDealerCards(globals: Record<string, unknown>): Card[] {
  return deserializeCards(globals['dealer_cards_json'] as string | null);
}

export function getPlayerHands(playerState: Record<string, unknown>): PlayerHand[] {
  return deserializeHands(playerState['hands_json'] as string | null);
}

export function getPlayerChips(playerState: Record<string, unknown>): number {
  return Number(playerState['chips'] ?? BJ_STARTING_CHIPS);
}

export function getPlayerBet(playerState: Record<string, unknown>): number {
  return Number(playerState['bet'] ?? BJ_DEFAULT_BET);
}

export function getPlayerActiveHandIndex(playerState: Record<string, unknown>): number {
  return Number(playerState['active_hand_index'] ?? 0);
}

// ---------------------------------------------------------------------------
// Utility: build seats_json for public state display
// ---------------------------------------------------------------------------

function buildSeatsJson(
  players: Record<string, Record<string, unknown>>,
  playerInfo: Array<{ id: string; name: string }>,
): string {
  const seats = playerInfo.map(info => {
    const ps = players[info.id] ?? {};
    const hands = getPlayerHands(ps);
    return {
      playerId: info.id,
      playerName: info.name,
      chips: getPlayerChips(ps),
      bet: getPlayerBet(ps),
      hands,
      activeHandIndex: getPlayerActiveHandIndex(ps),
      stood: hands.length > 0 && hands.every(h => h.stood || h.bust || h.blackjack),
      result: ps['result'] ?? null,
      resultAmount: Number(ps['result_amount'] ?? 0),
      betPlaced: Boolean(ps['bet_placed']),
    };
  });
  return JSON.stringify(seats);
}

// ---------------------------------------------------------------------------
// Action handler: bj_start_betting
// ---------------------------------------------------------------------------

/**
 * bj_start_betting — Called on_enter for the bj_betting phase.
 *
 * - Increments round_number
 * - Initializes or reshuffles the shoe if running low
 * - Resets per-player bet/hand/result state for the new round
 * - Clamps bets to valid range and chip count
 */
export function handleStartBetting(ctx: BlackjackActionContext): void {
  // Initialize or reshuffle shoe if needed
  let shoe = getShoe(ctx.globals);
  if (shoe.length < BJ_RESHUFFLE_THRESHOLD) {
    shoe = freshShoe(BJ_NUM_DECKS);
    ctx.log('[blackjack] Shoe reshuffled');
  }
  ctx.setGlobal('shoe_json', serializeShoe(shoe));

  // Increment round number
  const roundNumber = Number(ctx.globals['round_number'] ?? 0) + 1;
  ctx.setGlobal('round_number', roundNumber);

  const maxRounds = Number(ctx.globals['max_rounds'] ?? 20);
  ctx.setGlobal('is_final_round', roundNumber >= maxRounds);

  // Reset global state
  ctx.setGlobal('dealer_cards_json', null);
  ctx.setGlobal('dealer_hole_hidden', false);
  ctx.setGlobal('dealer_score', 0);
  ctx.setGlobal('last_action_json', null);
  ctx.setGlobal('all_bets_placed', false);
  ctx.setGlobal('all_hands_settled', false);

  // Reset per-player state
  for (const [playerId, playerState] of Object.entries(ctx.players)) {
    const chips = getPlayerChips(playerState);
    const prevBet = getPlayerBet(playerState);

    // Clamp bet to valid range and chip count
    const clampedBet = chips > 0
      ? Math.min(Math.max(prevBet, BJ_MIN_BET), Math.min(BJ_MAX_BET, chips))
      : BJ_MIN_BET;

    ctx.setPlayer(playerId, 'bet', clampedBet);
    ctx.setPlayer(playerId, 'bet_placed', false);
    ctx.setPlayer(playerId, 'hands_json', null);
    ctx.setPlayer(playerId, 'active_hand_index', 0);
    ctx.setPlayer(playerId, 'all_settled', false);
    ctx.setPlayer(playerId, 'result', null);
    ctx.setPlayer(playerId, 'result_amount', 0);
    ctx.setPlayer(playerId, 'can_double', false);
    ctx.setPlayer(playerId, 'can_split', false);
  }

  ctx.setGlobal('seats_json', buildSeatsJson(ctx.players, ctx.playerInfo));
  ctx.log('[blackjack] Betting started', { round: roundNumber });
}

// ---------------------------------------------------------------------------
// Action handler: bj_deal_cards
// ---------------------------------------------------------------------------

/**
 * bj_deal_cards — Called on_enter for the bj_dealing phase.
 *
 * - Deals 2 cards to each player (deducting bet from chips)
 * - Deals 2 cards to dealer
 * - Detects natural blackjack (auto-stands the hand)
 * - Players with no chips get an empty auto-stood spectator hand
 * - Sets dealer_hole_hidden = true for the playing phase display
 */
export function handleDealCards(ctx: BlackjackActionContext): void {
  const shoe = getShoe(ctx.globals);

  for (const [playerId, playerState] of Object.entries(ctx.players)) {
    const chips = getPlayerChips(playerState);

    if (chips <= 0) {
      // Spectator hand — no chips to bet
      const spectatorHand: PlayerHand = {
        cards: [],
        bet: 0,
        doubled: false,
        split: false,
        bust: false,
        stood: true,
        blackjack: false,
      };
      ctx.setPlayer(playerId, 'hands_json', serializeHands([spectatorHand]));
      ctx.setPlayer(playerId, 'active_hand_index', 0);
      ctx.setPlayer(playerId, 'all_settled', true);
      ctx.setPlayer(playerId, 'can_double', false);
      ctx.setPlayer(playerId, 'can_split', false);
      continue;
    }

    const bet = Math.min(getPlayerBet(playerState), chips);
    ctx.setPlayer(playerId, 'chips', chips - bet);

    const cards = deal(shoe, 2);
    const isNatural = isBlackjack(cards);

    const hand: PlayerHand = {
      cards,
      bet,
      doubled: false,
      split: false,
      bust: false,
      stood: isNatural,
      blackjack: isNatural,
    };

    ctx.setPlayer(playerId, 'hands_json', serializeHands([hand]));
    ctx.setPlayer(playerId, 'active_hand_index', 0);
    ctx.setPlayer(playerId, 'all_settled', isNatural);
    ctx.setPlayer(playerId, 'can_double', !isNatural && cards.length === 2 && chips - bet >= bet);
    ctx.setPlayer(playerId, 'can_split', false); // Can never split on initial deal without knowing ranks
  }

  // Deal dealer cards
  const dealerCards = deal(shoe, 2);
  const firstCardScore = dealerCards[0] ? handValue([dealerCards[0]]).score : 0;

  ctx.setGlobal('dealer_cards_json', serializeCards(dealerCards));
  ctx.setGlobal('dealer_hole_hidden', true);
  ctx.setGlobal('dealer_score', firstCardScore);
  ctx.setGlobal('shoe_json', serializeShoe(shoe));

  // Check if all players are already settled (all naturals)
  const allNaturals = Object.values(ctx.players).every(ps => {
    const hands = getPlayerHands(ps);
    return hands.length === 0 || hands.every(h => h.stood || h.bust || h.blackjack);
  });
  ctx.setGlobal('all_hands_settled', allNaturals);

  ctx.setGlobal('seats_json', buildSeatsJson(ctx.players, ctx.playerInfo));
  ctx.log('[blackjack] Cards dealt', { allNaturals });
}

// ---------------------------------------------------------------------------
// Action handler: bj_dealer_play
// ---------------------------------------------------------------------------

/**
 * bj_dealer_play — Called on_enter for the bj_dealer phase.
 *
 * - Auto-stands any player hands that weren't settled (timeout fallback)
 * - Reveals the dealer's hole card
 * - Dealer hits until score >= 17 (stands on soft 17 — S17 rule)
 */
export function handleDealerPlay(ctx: BlackjackActionContext): void {
  const shoe = getShoe(ctx.globals);
  const dealerCards = getDealerCards(ctx.globals);

  // Auto-stand any unsettled player hands (timer expired during playing phase)
  for (const [playerId, playerState] of Object.entries(ctx.players)) {
    const hands = getPlayerHands(playerState);
    let changed = false;
    for (const hand of hands) {
      if (!hand.stood && !hand.bust && !hand.blackjack) {
        hand.stood = true;
        changed = true;
      }
    }
    if (changed) {
      ctx.setPlayer(playerId, 'hands_json', serializeHands(hands));
      ctx.setPlayer(playerId, 'all_settled', true);
    }
  }

  // Dealer plays: hit until score >= 17, stand on soft 17 (S17 rule)
  let safety = 0;
  while (safety++ < 20) {
    const { score, soft } = handValue(dealerCards);
    if (score >= 17) break;
    if (soft && score === 17) break;
    const drawn = deal(shoe, 1);
    if (drawn[0]) dealerCards.push(drawn[0]);
  }

  const { score: finalScore } = handValue(dealerCards);

  ctx.setGlobal('dealer_cards_json', serializeCards(dealerCards));
  ctx.setGlobal('dealer_hole_hidden', false);
  ctx.setGlobal('dealer_score', finalScore);
  ctx.setGlobal('shoe_json', serializeShoe(shoe));
  ctx.setGlobal('seats_json', buildSeatsJson(ctx.players, ctx.playerInfo));

  ctx.log('[blackjack] Dealer played', {
    cards: dealerCards.map(c => `${c.rank}${c.suit[0]}`).join(' '),
    score: finalScore,
  });
}

// ---------------------------------------------------------------------------
// Action handler: bj_resolve_results
// ---------------------------------------------------------------------------

/**
 * bj_resolve_results — Called on_enter for the bj_results phase.
 *
 * Compares each player's hand(s) against the dealer and awards chips:
 *   - Natural blackjack (vs non-natural dealer): bet + floor(bet * 1.5) [3:2]
 *   - Natural vs natural: push — return bet
 *   - Win (player > dealer or dealer bust): bet * 2
 *   - Push (tie): return bet
 *   - Loss / Bust: 0 (bet already deducted on deal)
 *
 * Split hands: picks the "best" result for display; calculates each hand
 * independently for chip payout.
 */
export function handleResolveResults(ctx: BlackjackActionContext): void {
  const dealerCards = getDealerCards(ctx.globals);
  const { score: dealerScore } = handValue(dealerCards);
  const dealerBust = dealerScore > 21;
  const dealerNatural = isBlackjack(dealerCards);

  for (const [playerId, playerState] of Object.entries(ctx.players)) {
    const hands = getPlayerHands(playerState);
    if (hands.length === 0) continue;

    const handResults: HandResult[] = [];
    let chipsBack = 0;

    for (const hand of hands) {
      if (hand.bet === 0) continue; // Spectator

      const { score: playerScore } = handValue(hand.cards);
      let handResult: HandResult;
      let payout = 0;

      if (hand.blackjack && !dealerNatural) {
        // Natural BJ pays 3:2
        handResult = 'blackjack';
        payout = hand.bet + Math.floor(hand.bet * 1.5);
      } else if (hand.blackjack && dealerNatural) {
        // Both natural → push
        handResult = 'push';
        payout = hand.bet;
      } else if (hand.bust) {
        // Player bust
        handResult = 'bust';
        payout = 0;
      } else if (dealerBust) {
        // Dealer bust → player wins
        handResult = 'win';
        payout = hand.bet * 2;
      } else if (playerScore > dealerScore) {
        handResult = 'win';
        payout = hand.bet * 2;
      } else if (playerScore === dealerScore) {
        handResult = 'push';
        payout = hand.bet;
      } else {
        handResult = 'lose';
        payout = 0;
      }

      chipsBack += payout;
      handResults.push(handResult);
    }

    // Pick best result for display
    let overallResult: HandResult = 'lose';
    if (handResults.includes('blackjack')) overallResult = 'blackjack';
    else if (handResults.includes('win')) overallResult = 'win';
    else if (handResults.includes('push')) overallResult = 'push';
    else if (handResults.includes('bust')) overallResult = 'bust';
    else if (handResults.includes('lose')) overallResult = 'lose';

    // Net chips won/lost (chips were deducted on deal)
    const betTotal = hands.reduce((sum, h) => sum + h.bet, 0);
    const netDelta = chipsBack - betTotal;

    const currentChips = getPlayerChips(playerState);
    const finalChips = currentChips + chipsBack;

    ctx.setPlayer(playerId, 'chips', finalChips);
    ctx.setPlayer(playerId, 'result', overallResult);
    ctx.setPlayer(playerId, 'result_amount', netDelta);
    ctx.setPlayer(playerId, 'can_double', false);
    ctx.setPlayer(playerId, 'can_split', false);

    // Sync scores (chips are the score proxy — addPoints handles negative diffs)
    const currentScore = ctx.getScore(playerId);
    const scoreDiff = finalChips - currentScore;
    if (scoreDiff !== 0) {
      ctx.addPoints(playerId, scoreDiff);
    }
  }

  ctx.setGlobal('seats_json', buildSeatsJson(ctx.players, ctx.playerInfo));
  ctx.log('[blackjack] Results resolved', { dealerScore, dealerBust, dealerNatural });
}

// ---------------------------------------------------------------------------
// Custom action dispatcher
// ---------------------------------------------------------------------------

export type BlackjackActionName =
  | 'bj_start_betting'
  | 'bj_deal_cards'
  | 'bj_dealer_play'
  | 'bj_resolve_results';

export function isBlackjackAction(actionName: string): actionName is BlackjackActionName {
  return [
    'bj_start_betting',
    'bj_deal_cards',
    'bj_dealer_play',
    'bj_resolve_results',
  ].includes(actionName);
}

export function dispatchBlackjackAction(
  actionName: BlackjackActionName,
  ctx: BlackjackActionContext,
): void {
  switch (actionName) {
    case 'bj_start_betting':
      handleStartBetting(ctx);
      break;
    case 'bj_deal_cards':
      handleDealCards(ctx);
      break;
    case 'bj_dealer_play':
      handleDealerPlay(ctx);
      break;
    case 'bj_resolve_results':
      handleResolveResults(ctx);
      break;
    default:
      console.warn('[blackjack-extensions] Unknown action:', actionName);
  }
}
