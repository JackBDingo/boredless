import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import type { CAHWhiteCard, CAHBlackCard } from '../types.js';

// Raw card data shape from cards.json
interface RawCardData {
  black: { text: string; pick: number }[];
  white: { text: string }[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Lazy-loaded card data
let _cardData: RawCardData | null = null;

function loadCards(): RawCardData {
  if (_cardData) return _cardData;
  const raw = JSON.parse(
    readFileSync(join(__dirname, '../data/cards.json'), 'utf-8'),
  ) as RawCardData;
  _cardData = raw;
  return raw;
}

/** Fisher-Yates shuffle (in-place) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Create a fresh shuffled white card deck */
export function createWhiteDeck(): CAHWhiteCard[] {
  const data = loadCards();
  return shuffle(
    data.white.map(c => ({ id: nanoid(), text: c.text }))
  );
}

/** Create a fresh shuffled black card deck */
export function createBlackDeck(): CAHBlackCard[] {
  const data = loadCards();
  return shuffle(
    data.black.map(c => ({ id: nanoid(), text: c.text, pick: c.pick ?? 1 }))
  );
}

/** Manage the white card deck for a room */
export class DeckManager {
  private whiteDeck: CAHWhiteCard[];
  private blackDeck: CAHBlackCard[];
  private discard: CAHWhiteCard[] = [];

  constructor() {
    this.whiteDeck = createWhiteDeck();
    this.blackDeck = createBlackDeck();
  }

  /** Draw N white cards, reshuffling discard if needed */
  drawWhite(count: number): CAHWhiteCard[] {
    const drawn: CAHWhiteCard[] = [];
    for (let i = 0; i < count; i++) {
      if (this.whiteDeck.length === 0) {
        // Reshuffle discard pile back into deck
        this.whiteDeck = shuffle([...this.discard]);
        this.discard = [];
      }
      if (this.whiteDeck.length > 0) {
        drawn.push(this.whiteDeck.pop()!);
      }
    }
    return drawn;
  }

  /** Draw the next black card */
  drawBlack(): CAHBlackCard | null {
    return this.blackDeck.pop() ?? null;
  }

  /** Return played white cards to discard */
  discardWhite(cards: CAHWhiteCard[]): void {
    this.discard.push(...cards);
  }

  /** How many white cards remain in draw pile */
  get whiteRemaining(): number {
    return this.whiteDeck.length;
  }

  /** How many black cards remain */
  get blackRemaining(): number {
    return this.blackDeck.length;
  }
}
