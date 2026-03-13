/**
 * object-models.test.ts — Comprehensive tests for the Object Models subsystem.
 *
 * Tests cover:
 * - DeckManager: shuffle, draw, drawBottom, peek, add, discard, reshuffle
 * - HandManager: add, remove, play, maxSize, has, sort
 * - BoardManager: place, remove, move, bounds, getOccupiedCells, clear
 * - PoolManager: add, remove, drawRandom, find, filter
 * - ObjectRegistry: create, retrieve, transfer, snapshot, destroy
 * - Schema integration: valid/invalid declarations
 * - Integration: full card game setup (deck + hands + discard)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeckManager } from '../deck.js';
import { HandManager } from '../hand.js';
import { BoardManager } from '../board.js';
import { PoolManager } from '../pool.js';
import { ObjectRegistry } from '../object-registry.js';
import { parseGameObjects, safeParseGameObjects } from '../schema-integration.js';
import type { GameItem } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCard(id: string, suit = 'spades', rank = 'A'): GameItem {
  return { id, type: 'card', value: { suit, rank } };
}

function makeDeck52(): GameItem[] {
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const items: GameItem[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      items.push({ id: `${rank}_${suit}`, type: 'card', value: { suit, rank } });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// DeckManager
// ---------------------------------------------------------------------------

describe('DeckManager', () => {
  it('initializes with given items', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c1'), makeCard('c2')] });
    expect(deck.getSize()).toBe(2);
    expect(deck.isEmpty()).toBe(false);
    expect(deck.getDiscardSize()).toBe(0);
  });

  it('getState returns a snapshot with correct structure', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c1')] });
    const state = deck.getState();
    expect(state.type).toBe('deck');
    expect(state.id).toBe('deck1');
    expect(state.items).toHaveLength(1);
    expect(state.discardPile).toHaveLength(0);
  });

  it('getState is a deep copy (mutations do not affect internals)', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c1')] });
    const state = deck.getState();
    state.items[0]!.type = 'mutated';
    expect(deck.getState().items[0]!.type).toBe('card');
  });

  it('shuffle randomizes order (statistically)', () => {
    const items = makeDeck52();
    const deck = new DeckManager({ id: 'deck1', items });
    const originalOrder = deck.getState().items.map((i) => i.id);

    deck.shuffle();
    const shuffledIds = deck.getState().items.map((i) => i.id);

    // Same items (compare sorted copies)
    expect([...shuffledIds].sort()).toEqual([...originalOrder].sort());
    // Different order (astronomically unlikely to be the same for 52 cards)
    expect(shuffledIds).not.toEqual(originalOrder);
  });

  it('shuffle does not affect discard pile', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c1'), makeCard('c2')] });
    deck.discard([makeCard('d1')]);
    deck.shuffle();
    expect(deck.getDiscardSize()).toBe(1);
  });

  it('draw removes items from the top (default 1)', () => {
    const deck = new DeckManager({
      id: 'deck1',
      items: [makeCard('c1'), makeCard('c2'), makeCard('c3')],
    });
    const drawn = deck.draw();
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.id).toBe('c1');
    expect(deck.getSize()).toBe(2);
  });

  it('draw removes multiple items from the top', () => {
    const deck = new DeckManager({ id: 'deck1', items: makeDeck52() });
    const drawn = deck.draw(5);
    expect(drawn).toHaveLength(5);
    expect(deck.getSize()).toBe(47);
  });

  it('draw returns empty array when deck is empty', () => {
    const deck = new DeckManager({ id: 'deck1', items: [] });
    const drawn = deck.draw(3);
    expect(drawn).toHaveLength(0);
  });

  it('draw returns as many as available if count > deck size', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c1'), makeCard('c2')] });
    const drawn = deck.draw(10);
    expect(drawn).toHaveLength(2);
    expect(deck.isEmpty()).toBe(true);
  });

  it('drawBottom removes from the bottom', () => {
    const deck = new DeckManager({
      id: 'deck1',
      items: [makeCard('c1'), makeCard('c2'), makeCard('c3')],
    });
    const drawn = deck.drawBottom();
    expect(drawn[0]!.id).toBe('c3');
    expect(deck.getSize()).toBe(2);
  });

  it('drawBottom returns empty array when deck is empty', () => {
    const deck = new DeckManager({ id: 'deck1', items: [] });
    expect(deck.drawBottom()).toHaveLength(0);
  });

  it('peek shows top cards without removing', () => {
    const deck = new DeckManager({
      id: 'deck1',
      items: [makeCard('c1'), makeCard('c2'), makeCard('c3')],
    });
    const peeked = deck.peek(2);
    expect(peeked).toHaveLength(2);
    expect(peeked[0]!.id).toBe('c1');
    expect(peeked[1]!.id).toBe('c2');
    expect(deck.getSize()).toBe(3); // not removed
  });

  it('peek returns copies (mutations do not affect deck)', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c1')] });
    const peeked = deck.peek();
    peeked[0]!.type = 'mutated';
    expect(deck.getState().items[0]!.type).toBe('card');
  });

  it('addToTop prepends items', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c2')] });
    deck.addToTop([makeCard('c1')]);
    expect(deck.peek()[0]!.id).toBe('c1');
    expect(deck.getSize()).toBe(2);
  });

  it('addToBottom appends items', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c1')] });
    deck.addToBottom([makeCard('c2')]);
    expect(deck.getSize()).toBe(2);
    // Draw both and check order
    const all = deck.draw(2);
    expect(all[0]!.id).toBe('c1');
    expect(all[1]!.id).toBe('c2');
  });

  it('discard moves items to discard pile', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c1'), makeCard('c2')] });
    const drawn = deck.draw(2);
    deck.discard(drawn);
    expect(deck.getDiscardSize()).toBe(2);
    expect(deck.getSize()).toBe(0);
  });

  it('reshuffleDiscard moves discard back into deck and shuffles', () => {
    const items = [makeCard('c1'), makeCard('c2'), makeCard('c3')];
    const deck = new DeckManager({ id: 'deck1', items: [...items] });
    const drawn = deck.draw(3);
    deck.discard(drawn);

    expect(deck.isEmpty()).toBe(true);
    expect(deck.getDiscardSize()).toBe(3);

    deck.reshuffleDiscard();

    expect(deck.getSize()).toBe(3);
    expect(deck.getDiscardSize()).toBe(0);
  });

  it('isEmpty is accurate', () => {
    const deck = new DeckManager({ id: 'deck1', items: [makeCard('c1')] });
    expect(deck.isEmpty()).toBe(false);
    deck.draw();
    expect(deck.isEmpty()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// HandManager
// ---------------------------------------------------------------------------

describe('HandManager', () => {
  it('initializes empty', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    expect(hand.getSize()).toBe(0);
    expect(hand.getItems()).toHaveLength(0);
  });

  it('getState returns correct structure', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1', maxSize: 7 });
    const state = hand.getState();
    expect(state.type).toBe('hand');
    expect(state.id).toBe('h1');
    expect(state.playerId).toBe('p1');
    expect(state.maxSize).toBe(7);
  });

  it('add items to hand', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    hand.add([makeCard('c1'), makeCard('c2')]);
    expect(hand.getSize()).toBe(2);
    expect(hand.has('c1')).toBe(true);
    expect(hand.has('c2')).toBe(true);
  });

  it('add throws when exceeding maxSize', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1', maxSize: 3 });
    hand.add([makeCard('c1'), makeCard('c2'), makeCard('c3')]);
    expect(() => hand.add([makeCard('c4')])).toThrow(/maxSize/);
  });

  it('add with no maxSize never throws', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    const manyCards = Array.from({ length: 100 }, (_, i) => makeCard(`c${i}`));
    expect(() => hand.add(manyCards)).not.toThrow();
    expect(hand.getSize()).toBe(100);
  });

  it('remove specific items by ID', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    hand.add([makeCard('c1'), makeCard('c2'), makeCard('c3')]);
    const removed = hand.remove(['c2']);
    expect(removed).toHaveLength(1);
    expect(removed[0]!.id).toBe('c2');
    expect(hand.getSize()).toBe(2);
    expect(hand.has('c2')).toBe(false);
  });

  it('remove returns items in requested order', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    hand.add([makeCard('c1'), makeCard('c2'), makeCard('c3')]);
    const removed = hand.remove(['c3', 'c1']);
    expect(removed[0]!.id).toBe('c3');
    expect(removed[1]!.id).toBe('c1');
  });

  it('remove silently skips missing IDs', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    hand.add([makeCard('c1')]);
    const removed = hand.remove(['c1', 'nonexistent']);
    expect(removed).toHaveLength(1);
  });

  it('play removes and returns a specific item', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    hand.add([makeCard('c1'), makeCard('c2')]);
    const played = hand.play('c1');
    expect(played.id).toBe('c1');
    expect(hand.getSize()).toBe(1);
    expect(hand.has('c1')).toBe(false);
  });

  it('play throws if item not in hand', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    expect(() => hand.play('nonexistent')).toThrow(/not found/);
  });

  it('has returns correct boolean', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    hand.add([makeCard('c1')]);
    expect(hand.has('c1')).toBe(true);
    expect(hand.has('c2')).toBe(false);
  });

  it('isFull when at maxSize', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1', maxSize: 2 });
    hand.add([makeCard('c1')]);
    expect(hand.isFull()).toBe(false);
    hand.add([makeCard('c2')]);
    expect(hand.isFull()).toBe(true);
  });

  it('isFull is always false without maxSize', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    expect(hand.isFull()).toBe(false);
    const items = Array.from({ length: 1000 }, (_, i) => makeCard(`c${i}`));
    hand.add(items);
    expect(hand.isFull()).toBe(false);
  });

  it('getItems returns copies', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    hand.add([makeCard('c1')]);
    const items = hand.getItems();
    items[0]!.type = 'mutated';
    expect(hand.getState().items[0]!.type).toBe('card');
  });

  it('sort with default comparator sorts by id', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    hand.add([makeCard('c3'), makeCard('c1'), makeCard('c2')]);
    hand.sort();
    const ids = hand.getItems().map((i) => i.id);
    expect(ids).toEqual(['c1', 'c2', 'c3']);
  });

  it('sort with custom comparator', () => {
    const hand = new HandManager({ id: 'h1', playerId: 'p1' });
    hand.add([
      { id: 'c3', type: 'card', value: { rank: 3 } },
      { id: 'c1', type: 'card', value: { rank: 1 } },
      { id: 'c2', type: 'card', value: { rank: 2 } },
    ]);
    hand.sort((a, b) => (a.value as { rank: number }).rank - (b.value as { rank: number }).rank);
    const ids = hand.getItems().map((i) => i.id);
    expect(ids).toEqual(['c1', 'c2', 'c3']);
  });
});

// ---------------------------------------------------------------------------
// BoardManager
// ---------------------------------------------------------------------------

describe('BoardManager', () => {
  let board: BoardManager;

  beforeEach(() => {
    board = new BoardManager({ id: 'board1', width: 5, height: 5 });
  });

  it('initializes with all null cells', () => {
    const state = board.getState();
    expect(state.type).toBe('board');
    expect(state.width).toBe(5);
    expect(state.height).toBe(5);
    for (const row of state.cells) {
      for (const cell of row) {
        expect(cell).toBeNull();
      }
    }
  });

  it('isValidPosition returns correct results', () => {
    expect(board.isValidPosition(0, 0)).toBe(true);
    expect(board.isValidPosition(4, 4)).toBe(true);
    expect(board.isValidPosition(5, 0)).toBe(false);
    expect(board.isValidPosition(0, 5)).toBe(false);
    expect(board.isValidPosition(-1, 0)).toBe(false);
    expect(board.isValidPosition(0, -1)).toBe(false);
  });

  it('place item at position', () => {
    const tile = { id: 't1', type: 'tile', value: 'X' };
    board.place(2, 3, tile);
    expect(board.isOccupied(2, 3)).toBe(true);
    expect(board.isEmpty(2, 3)).toBe(false);
    expect(board.getCell(2, 3)!.id).toBe('t1');
  });

  it('place on occupied cell throws', () => {
    board.place(1, 1, { id: 't1', type: 'tile' });
    expect(() => board.place(1, 1, { id: 't2', type: 'tile' })).toThrow(/occupied/);
  });

  it('place out of bounds throws', () => {
    expect(() => board.place(10, 0, { id: 't1' })).toThrow(/out of bounds/);
  });

  it('getCell returns null for empty cell', () => {
    expect(board.getCell(0, 0)).toBeNull();
  });

  it('getCell out of bounds throws', () => {
    expect(() => board.getCell(-1, 0)).toThrow(/out of bounds/);
  });

  it('getCell returns a copy (mutations do not affect board)', () => {
    board.place(0, 0, { id: 't1', type: 'tile' });
    const cell = board.getCell(0, 0)!;
    cell.type = 'mutated';
    expect(board.getCell(0, 0)!.type).toBe('tile');
  });

  it('remove returns item and clears cell', () => {
    board.place(2, 2, { id: 't1', type: 'tile' });
    const removed = board.remove(2, 2);
    expect(removed!.id).toBe('t1');
    expect(board.isOccupied(2, 2)).toBe(false);
  });

  it('remove from empty cell returns null', () => {
    expect(board.remove(1, 1)).toBeNull();
  });

  it('remove out of bounds throws', () => {
    expect(() => board.remove(99, 99)).toThrow(/out of bounds/);
  });

  it('move item between cells', () => {
    board.place(0, 0, { id: 't1', type: 'tile' });
    board.move(0, 0, 3, 4);
    expect(board.isOccupied(0, 0)).toBe(false);
    expect(board.isOccupied(3, 4)).toBe(true);
    expect(board.getCell(3, 4)!.id).toBe('t1');
  });

  it('move from empty cell throws', () => {
    expect(() => board.move(0, 0, 1, 1)).toThrow(/empty/);
  });

  it('move to occupied cell throws', () => {
    board.place(0, 0, { id: 't1' });
    board.place(1, 1, { id: 't2' });
    expect(() => board.move(0, 0, 1, 1)).toThrow(/occupied/);
  });

  it('move out of bounds throws', () => {
    board.place(0, 0, { id: 't1' });
    expect(() => board.move(0, 0, 99, 0)).toThrow(/out of bounds/);
  });

  it('getOccupiedCells returns all items with positions', () => {
    board.place(0, 0, { id: 't1' });
    board.place(4, 4, { id: 't2' });
    const occupied = board.getOccupiedCells();
    expect(occupied).toHaveLength(2);
    const ids = occupied.map((c) => c.item.id).sort();
    expect(ids).toEqual(['t1', 't2']);
  });

  it('getOccupiedCells returns copies', () => {
    board.place(0, 0, { id: 't1', type: 'tile' });
    const occupied = board.getOccupiedCells();
    occupied[0]!.item.type = 'mutated';
    expect(board.getCell(0, 0)!.type).toBe('tile');
  });

  it('clear empties the board', () => {
    board.place(0, 0, { id: 't1' });
    board.place(1, 1, { id: 't2' });
    board.clear();
    expect(board.getOccupiedCells()).toHaveLength(0);
    expect(board.getCell(0, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PoolManager
// ---------------------------------------------------------------------------

describe('PoolManager', () => {
  it('initializes with optional items', () => {
    const pool = new PoolManager({ id: 'pool1', items: [makeCard('c1'), makeCard('c2')] });
    expect(pool.getSize()).toBe(2);
  });

  it('initializes empty by default', () => {
    const pool = new PoolManager({ id: 'pool1' });
    expect(pool.getSize()).toBe(0);
  });

  it('getState returns correct structure', () => {
    const pool = new PoolManager({ id: 'pool1', items: [makeCard('c1')] });
    const state = pool.getState();
    expect(state.type).toBe('pool');
    expect(state.id).toBe('pool1');
    expect(state.items).toHaveLength(1);
  });

  it('add items', () => {
    const pool = new PoolManager({ id: 'pool1' });
    pool.add([makeCard('c1'), makeCard('c2')]);
    expect(pool.getSize()).toBe(2);
    expect(pool.has('c1')).toBe(true);
  });

  it('remove specific items by ID', () => {
    const pool = new PoolManager({ id: 'pool1', items: [makeCard('c1'), makeCard('c2'), makeCard('c3')] });
    const removed = pool.remove(['c2']);
    expect(removed).toHaveLength(1);
    expect(removed[0]!.id).toBe('c2');
    expect(pool.getSize()).toBe(2);
    expect(pool.has('c2')).toBe(false);
  });

  it('remove silently skips missing IDs', () => {
    const pool = new PoolManager({ id: 'pool1', items: [makeCard('c1')] });
    const removed = pool.remove(['c1', 'nonexistent']);
    expect(removed).toHaveLength(1);
  });

  it('drawRandom removes items from pool', () => {
    const items = Array.from({ length: 10 }, (_, i) => makeCard(`c${i}`));
    const pool = new PoolManager({ id: 'pool1', items });
    const drawn = pool.drawRandom(3);
    expect(drawn).toHaveLength(3);
    expect(pool.getSize()).toBe(7);
  });

  it('drawRandom returns all when count > pool size', () => {
    const pool = new PoolManager({ id: 'pool1', items: [makeCard('c1'), makeCard('c2')] });
    const drawn = pool.drawRandom(10);
    expect(drawn).toHaveLength(2);
    expect(pool.getSize()).toBe(0);
  });

  it('drawRandom returns empty array from empty pool', () => {
    const pool = new PoolManager({ id: 'pool1' });
    expect(pool.drawRandom()).toHaveLength(0);
  });

  it('drawRandom is truly random (statistically)', () => {
    const items = Array.from({ length: 100 }, (_, i) => makeCard(`c${i}`));
    const pool1 = new PoolManager({ id: 'p1', items: [...items] });
    const pool2 = new PoolManager({ id: 'p2', items: [...items] });

    const drawn1 = pool1.drawRandom(10).map((i) => i.id);
    const drawn2 = pool2.drawRandom(10).map((i) => i.id);

    // Astronomically unlikely to be identical
    expect(drawn1).not.toEqual(drawn2);
  });

  it('has returns correct boolean', () => {
    const pool = new PoolManager({ id: 'pool1', items: [makeCard('c1')] });
    expect(pool.has('c1')).toBe(true);
    expect(pool.has('c2')).toBe(false);
  });

  it('getItems returns copies', () => {
    const pool = new PoolManager({ id: 'pool1', items: [makeCard('c1')] });
    const items = pool.getItems();
    items[0]!.type = 'mutated';
    expect(pool.getState().items[0]!.type).toBe('card');
  });

  it('find returns first matching item', () => {
    const pool = new PoolManager({
      id: 'pool1',
      items: [
        { id: 'c1', type: 'card', value: { suit: 'spades' } },
        { id: 'c2', type: 'card', value: { suit: 'hearts' } },
        { id: 'c3', type: 'card', value: { suit: 'spades' } },
      ],
    });
    const found = pool.find((item) => (item.value as { suit: string }).suit === 'hearts');
    expect(found!.id).toBe('c2');
  });

  it('find returns undefined when not found', () => {
    const pool = new PoolManager({ id: 'pool1', items: [makeCard('c1')] });
    expect(pool.find((i) => i.id === 'nonexistent')).toBeUndefined();
  });

  it('filter returns all matching items', () => {
    const pool = new PoolManager({
      id: 'pool1',
      items: [
        { id: 'c1', type: 'card', value: { suit: 'spades' } },
        { id: 'c2', type: 'tile', value: { suit: 'hearts' } },
        { id: 'c3', type: 'card', value: { suit: 'spades' } },
      ],
    });
    const cards = pool.filter((item) => item.type === 'card');
    expect(cards).toHaveLength(2);
    expect(cards.every((i) => i.type === 'card')).toBe(true);
  });

  it('filter returns copies (mutations do not affect pool)', () => {
    const pool = new PoolManager({ id: 'pool1', items: [{ id: 'c1', type: 'card' }] });
    const filtered = pool.filter(() => true);
    filtered[0]!.type = 'mutated';
    expect(pool.getState().items[0]!.type).toBe('card');
  });
});

// ---------------------------------------------------------------------------
// ObjectRegistry
// ---------------------------------------------------------------------------

describe('ObjectRegistry', () => {
  let registry: ObjectRegistry;

  beforeEach(() => {
    registry = new ObjectRegistry();
  });

  it('create and retrieve a deck by id', () => {
    const deck = registry.createDeck({ id: 'deck1', items: [makeCard('c1')] });
    expect(deck).toBeDefined();
    expect(registry.get('deck1')).toBe(deck);
    expect(registry.getDeck('deck1')).toBe(deck);
  });

  it('create and retrieve a hand by id', () => {
    const hand = registry.createHand({ id: 'hand1', playerId: 'p1' });
    expect(registry.getHand('hand1')).toBe(hand);
  });

  it('create and retrieve a board by id', () => {
    const board = registry.createBoard({ id: 'board1', width: 8, height: 8 });
    expect(registry.getBoard('board1')).toBe(board);
  });

  it('create and retrieve a pool by id', () => {
    const pool = registry.createPool({ id: 'pool1' });
    expect(registry.getPool('pool1')).toBe(pool);
  });

  it('get returns null for unknown id', () => {
    expect(registry.get('nonexistent')).toBeNull();
  });

  it('getDeck throws for unknown id', () => {
    expect(() => registry.getDeck('unknown')).toThrow(/not found/);
  });

  it('getDeck throws when wrong type', () => {
    registry.createPool({ id: 'pool1' });
    expect(() => registry.getDeck('pool1')).toThrow(/not a deck/);
  });

  it('getHand throws when wrong type', () => {
    registry.createDeck({ id: 'deck1', items: [] });
    expect(() => registry.getHand('deck1')).toThrow(/not a hand/);
  });

  it('getBoard throws when wrong type', () => {
    registry.createPool({ id: 'pool1' });
    expect(() => registry.getBoard('pool1')).toThrow(/not a board/);
  });

  it('getPool throws when wrong type', () => {
    registry.createDeck({ id: 'deck1', items: [] });
    expect(() => registry.getPool('deck1')).toThrow(/not a pool/);
  });

  it('createDeck throws on duplicate id', () => {
    registry.createDeck({ id: 'deck1', items: [] });
    expect(() => registry.createDeck({ id: 'deck1', items: [] })).toThrow(/already exists/);
  });

  it('transfer items from deck to hand', () => {
    registry.createDeck({
      id: 'deck1',
      items: [makeCard('c1'), makeCard('c2'), makeCard('c3')],
    });
    registry.createHand({ id: 'hand1', playerId: 'p1' });

    registry.transfer('deck1', 'hand1', ['c1', 'c3']);

    expect(registry.getDeck('deck1').getSize()).toBe(1);
    expect(registry.getHand('hand1').getSize()).toBe(2);
    expect(registry.getHand('hand1').has('c1')).toBe(true);
    expect(registry.getHand('hand1').has('c3')).toBe(true);
  });

  it('transfer items from hand to pool', () => {
    registry.createHand({ id: 'hand1', playerId: 'p1' });
    registry.createPool({ id: 'discard' });

    registry.getHand('hand1').add([makeCard('c1'), makeCard('c2')]);
    registry.transfer('hand1', 'discard', ['c1']);

    expect(registry.getHand('hand1').getSize()).toBe(1);
    expect(registry.getPool('discard').getSize()).toBe(1);
    expect(registry.getPool('discard').has('c1')).toBe(true);
  });

  it('transfer items from pool to deck', () => {
    registry.createPool({ id: 'pool1', items: [makeCard('c1'), makeCard('c2')] });
    registry.createDeck({ id: 'deck1', items: [] });

    registry.transfer('pool1', 'deck1', ['c1']);

    expect(registry.getPool('pool1').getSize()).toBe(1);
    expect(registry.getDeck('deck1').getSize()).toBe(1);
  });

  it('transfer from board throws', () => {
    registry.createBoard({ id: 'board1', width: 3, height: 3 });
    registry.createHand({ id: 'hand1', playerId: 'p1' });
    expect(() => registry.transfer('board1', 'hand1', ['t1'])).toThrow(/board/);
  });

  it('transfer to board throws', () => {
    registry.createHand({ id: 'hand1', playerId: 'p1' });
    registry.createBoard({ id: 'board1', width: 3, height: 3 });
    expect(() => registry.transfer('hand1', 'board1', ['c1'])).toThrow(/board/);
  });

  it('transfer from unknown object throws', () => {
    registry.createHand({ id: 'hand1', playerId: 'p1' });
    expect(() => registry.transfer('unknown', 'hand1', ['c1'])).toThrow(/not found/);
  });

  it('getSnapshot includes all objects', () => {
    registry.createDeck({ id: 'deck1', items: [makeCard('c1')] });
    registry.createHand({ id: 'hand1', playerId: 'p1' });
    registry.createBoard({ id: 'board1', width: 3, height: 3 });
    registry.createPool({ id: 'pool1' });

    const snapshot = registry.getSnapshot();

    expect(Object.keys(snapshot)).toHaveLength(4);
    expect(snapshot['deck1']!.type).toBe('deck');
    expect(snapshot['hand1']!.type).toBe('hand');
    expect(snapshot['board1']!.type).toBe('board');
    expect(snapshot['pool1']!.type).toBe('pool');
  });

  it('destroy clears all objects', () => {
    registry.createDeck({ id: 'deck1', items: [] });
    registry.createPool({ id: 'pool1' });

    registry.destroy();

    expect(registry.get('deck1')).toBeNull();
    expect(registry.get('pool1')).toBeNull();
    expect(Object.keys(registry.getSnapshot())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Schema integration
// ---------------------------------------------------------------------------

describe('Schema integration', () => {
  it('valid deck declaration parses', () => {
    const raw = [
      {
        id: 'main_deck',
        type: 'deck',
        items: [
          { id: 'ace_spades', type: 'card', value: { suit: 'spades', rank: 'A' } },
        ],
      },
    ];
    const parsed = parseGameObjects(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.type).toBe('deck');
    expect(parsed[0]!.id).toBe('main_deck');
  });

  it('valid board declaration parses', () => {
    const raw = [{ id: 'game_board', type: 'board', width: 8, height: 8 }];
    const parsed = parseGameObjects(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.type).toBe('board');
  });

  it('valid pool declaration parses (no items required)', () => {
    const raw = [{ id: 'discard', type: 'pool' }];
    const parsed = parseGameObjects(raw);
    expect(parsed[0]!.type).toBe('pool');
  });

  it('valid hand declaration parses', () => {
    const raw = [{ id: 'player1_hand', type: 'hand', playerId: 'p1', maxSize: 7 }];
    const parsed = parseGameObjects(raw);
    expect(parsed[0]!.type).toBe('hand');
  });

  it('invalid type is rejected', () => {
    const raw = [{ id: 'obj1', type: 'invalid_type' }];
    expect(() => parseGameObjects(raw)).toThrow();
  });

  it('missing required fields for board are rejected', () => {
    const raw = [{ id: 'board1', type: 'board', width: 8 }]; // missing height
    expect(() => parseGameObjects(raw)).toThrow();
  });

  it('missing id is rejected', () => {
    const raw = [{ type: 'pool' }];
    expect(() => parseGameObjects(raw)).toThrow();
  });

  it('empty id string is rejected', () => {
    const raw = [{ id: '', type: 'pool' }];
    expect(() => parseGameObjects(raw)).toThrow();
  });

  it('safeParseGameObjects returns success for valid input', () => {
    const result = safeParseGameObjects([{ id: 'deck1', type: 'deck', items: [] }]);
    expect(result.success).toBe(true);
  });

  it('safeParseGameObjects returns error for invalid input', () => {
    const result = safeParseGameObjects([{ type: 'deck' }]); // missing id
    expect(result.success).toBe(false);
  });

  it('safeParseGameObjects handles non-array input gracefully', () => {
    const result = safeParseGameObjects('not an array');
    expect(result.success).toBe(false);
  });

  it('multiple object types in one array all parse', () => {
    const raw = [
      { id: 'deck1', type: 'deck', items: [] },
      { id: 'discard', type: 'pool' },
      { id: 'board1', type: 'board', width: 15, height: 15 },
      { id: 'hand1', type: 'hand' },
    ];
    const parsed = parseGameObjects(raw);
    expect(parsed).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Integration test — full card game scenario
// ---------------------------------------------------------------------------

describe('Integration: card game with deck, hands, and discard', () => {
  it('shuffle and deal 5 cards to 4 players, then play one card to discard', () => {
    const registry = new ObjectRegistry();

    // Setup: 52-card deck + 4 player hands + discard pool
    const deck = registry.createDeck({ id: 'deck', items: makeDeck52() });
    const hands = ['p1', 'p2', 'p3', 'p4'].map((playerId) =>
      registry.createHand({ id: `hand_${playerId}`, playerId, maxSize: 13 }),
    );
    const discard = registry.createPool({ id: 'discard' });

    // Shuffle the deck
    deck.shuffle();
    expect(deck.getSize()).toBe(52);

    // Deal 5 cards to each of 4 players (5 × 4 = 20 cards)
    for (const hand of hands) {
      const cards = deck.draw(5);
      hand.add(cards);
    }

    // Verify deck decreased
    expect(deck.getSize()).toBe(32); // 52 - 20 = 32

    // Verify each hand has 5 cards
    for (const hand of hands) {
      expect(hand.getSize()).toBe(5);
    }

    // Player 1 plays a card to discard
    const p1Hand = registry.getHand('hand_p1');
    const p1Cards = p1Hand.getItems();
    const cardToPlay = p1Cards[0]!;

    registry.transfer('hand_p1', 'discard', [cardToPlay.id]);

    // Verify state after play
    expect(p1Hand.getSize()).toBe(4);
    expect(discard.getSize()).toBe(1);
    expect(discard.has(cardToPlay.id)).toBe(true);

    // All cards accounted for: 32 in deck + (4 + 5 + 5 + 5) in hands + 1 in discard = 52
    const totalCards =
      deck.getSize() +
      hands.reduce((sum, h) => sum + h.getSize(), 0) +
      discard.getSize();
    expect(totalCards).toBe(52);

    // Snapshot includes all objects
    const snapshot = registry.getSnapshot();
    expect(Object.keys(snapshot)).toHaveLength(6); // deck + 4 hands + discard

    // Cleanup
    registry.destroy();
    expect(registry.get('deck')).toBeNull();
  });

  it('Battleship-style: place items on a board', () => {
    const registry = new ObjectRegistry();
    const board = registry.createBoard({ id: 'ocean', width: 10, height: 10 });

    // Place ship segments
    board.place(0, 0, { id: 'ship_a_1', type: 'ship', value: { player: 'p1' } });
    board.place(1, 0, { id: 'ship_a_2', type: 'ship', value: { player: 'p1' } });
    board.place(2, 0, { id: 'ship_a_3', type: 'ship', value: { player: 'p1' } });

    expect(board.getOccupiedCells()).toHaveLength(3);

    // Hit removes a ship segment
    const hit = board.remove(1, 0);
    expect(hit!.id).toBe('ship_a_2');
    expect(board.getOccupiedCells()).toHaveLength(2);

    registry.destroy();
  });

  it('Tile-bag style: draw random tiles from pool', () => {
    const registry = new ObjectRegistry();

    // Create a pool of letter tiles (like Scrabble)
    const tiles = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      .split('')
      .flatMap((letter) =>
        Array.from({ length: 4 }, (_, i) => ({
          id: `${letter}_${i}`,
          type: 'tile',
          value: { letter },
        })),
      );

    const bag = registry.createPool({ id: 'tile_bag', items: tiles });
    const rack = registry.createHand({ id: 'rack', playerId: 'p1', maxSize: 7 });

    expect(bag.getSize()).toBe(104); // 26 × 4

    // Draw 7 tiles to fill rack
    const drawn = bag.drawRandom(7);
    rack.add(drawn);

    expect(rack.getSize()).toBe(7);
    expect(bag.getSize()).toBe(97);

    registry.destroy();
  });
});
