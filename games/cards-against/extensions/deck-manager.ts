/**
 * deck-manager.ts — Card deck management for CAH V2.
 *
 * Migrated from server/deck.ts. Now operates on serializable state
 * (DeckState JSON) instead of class instances, so the deck can be
 * stored in globals.deck_state_json and survive across phases.
 *
 * Key design decisions:
 * - DeckState is a plain JSON-serializable object (not a class)
 * - Callers store/restore DeckState via JSON in extension context
 * - Fisher-Yates shuffle is pure (no side effects outside the function)
 * - Card IDs come from content YAML (b0001, w0001 format)
 * - nanoid still used to generate unique submission IDs
 */

import { nanoid } from 'nanoid';

// ---------------------------------------------------------------------------
// Card types
// ---------------------------------------------------------------------------

export interface CAHWhiteCard {
  id: string;   // e.g. "w0001" from content YAML
  text: string;
}

export interface CAHBlackCard {
  id: string;   // e.g. "b0001" from content YAML
  text: string;
  pick: number; // 1 or 2
}

// ---------------------------------------------------------------------------
// Deck state (serializable to JSON)
// ---------------------------------------------------------------------------

export interface DeckState {
  whiteDeck: CAHWhiteCard[];
  blackDeck: CAHBlackCard[];
  whiteDiscard: CAHWhiteCard[];
}

// ---------------------------------------------------------------------------
// Content loaders — parse content YAML format into card arrays
// ---------------------------------------------------------------------------

export interface RawBlackCard {
  id: string;
  text: string;
  pick: number;
}

export interface RawWhiteCard {
  id: string;
  text: string;
}

/** Parse black cards from content YAML structure */
export function parseBlackCards(raw: unknown): CAHBlackCard[] {
  const obj = raw as { cards?: RawBlackCard[] };
  if (!Array.isArray(obj?.cards)) return [];
  return obj.cards.map(c => ({
    id: c.id ?? nanoid(),
    text: String(c.text ?? ''),
    pick: Number(c.pick ?? 1),
  }));
}

/** Parse white cards from content YAML structure */
export function parseWhiteCards(raw: unknown): CAHWhiteCard[] {
  const obj = raw as { cards?: RawWhiteCard[] };
  if (!Array.isArray(obj?.cards)) return [];
  return obj.cards.map(c => ({
    id: c.id ?? nanoid(),
    text: String(c.text ?? ''),
  }));
}

// ---------------------------------------------------------------------------
// Shuffle utility
// ---------------------------------------------------------------------------

/** Fisher-Yates in-place shuffle — returns the same array mutated */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// DeckState factory
// ---------------------------------------------------------------------------

/** Create a fresh DeckState from raw card arrays */
export function createDeckState(
  blackCards: CAHBlackCard[],
  whiteCards: CAHWhiteCard[],
): DeckState {
  return {
    blackDeck: shuffle([...blackCards]),
    whiteDeck: shuffle([...whiteCards]),
    whiteDiscard: [],
  };
}

// ---------------------------------------------------------------------------
// Deck operations (pure functions on DeckState)
// ---------------------------------------------------------------------------

/**
 * Draw N white cards from the deck. Reshuffles discard pile if needed.
 * Mutates state in-place (caller should store updated state back to globals).
 */
export function drawWhiteCards(state: DeckState, count: number): CAHWhiteCard[] {
  const drawn: CAHWhiteCard[] = [];
  for (let i = 0; i < count; i++) {
    if (state.whiteDeck.length === 0) {
      // Reshuffle discard back into deck
      state.whiteDeck = shuffle([...state.whiteDiscard]);
      state.whiteDiscard = [];
    }
    if (state.whiteDeck.length > 0) {
      drawn.push(state.whiteDeck.pop()!);
    }
  }
  return drawn;
}

/**
 * Draw the next black card.
 * Returns null if the black deck is exhausted.
 * Mutates state in-place.
 */
export function drawBlackCard(state: DeckState): CAHBlackCard | null {
  return state.blackDeck.pop() ?? null;
}

/**
 * Return white cards to the discard pile.
 * Mutates state in-place.
 */
export function discardWhiteCards(state: DeckState, cards: CAHWhiteCard[]): void {
  state.whiteDiscard.push(...cards);
}

// ---------------------------------------------------------------------------
// State serialization helpers
// ---------------------------------------------------------------------------

export function serializeDeckState(state: DeckState): string {
  return JSON.stringify(state);
}

export function deserializeDeckState(json: string | null | undefined): DeckState | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as DeckState;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Submission types
// ---------------------------------------------------------------------------

export interface CAHSubmission {
  submissionId: string;
  playerId: string;
  cards: CAHWhiteCard[];
}

export interface CAHAnonymousSubmission {
  submissionId: string;
  cards: { text: string }[];
}

export interface CAHWinner {
  submissionId: string;
  playerId: string;
  playerName: string;
  cards: { text: string }[];
}

/** Generate a new nanoid for submission IDs */
export function generateSubmissionId(): string {
  return nanoid();
}
