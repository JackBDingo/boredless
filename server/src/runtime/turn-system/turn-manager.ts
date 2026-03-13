/**
 * turn-manager.ts — TurnManager class for Boredless V2.
 *
 * The TurnManager tracks player ordering, active player(s), and turn progression
 * for a single game session. It is purely in-memory and stateless with respect
 * to timers — callers are responsible for starting/stopping turn timers using
 * the timeoutMs config from the TurnModel.
 *
 * DESIGN CONTRACT:
 * - No game-specific logic. TurnManager doesn't know what games mean.
 * - Five declarative turn models: simultaneous, round_robin, free_form,
 *   priority_queue, elimination.
 * - Events notify callers via onTurnEvent callback (synchronous, no WS coupling).
 * - Caller manages timer state; TurnManager tracks timeoutMs config only.
 * - getState() returns immutable snapshots (Sets are copied; caller cannot mutate).
 *
 * Priority Queue notes:
 * - The queue is the _turnOrder array; _currentIndex tracks the current "position".
 * - advanceTurn moves _currentIndex forward to the next non-eliminated player.
 * - When the end of the array is reached, round_complete fires and we wrap back.
 */

import type { TurnModel, TurnState, TurnEvent, TurnManagerOptions } from './types.js';

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle (in-place)
// ---------------------------------------------------------------------------

function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------------------------------------------------------------------------
// TurnManager
// ---------------------------------------------------------------------------

export class TurnManager {
  private readonly model: TurnModel;

  // Internal mutable state
  private _turnOrder: string[];
  private _currentIndex: number = 0;
  private _round: number = 1;
  private _direction: 1 | -1 = 1;
  private readonly _eliminated: Set<string> = new Set();
  private readonly _skipped: Set<string> = new Set();

  // Callback
  private readonly onTurnEvent: (event: TurnEvent) => void;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /**
   * @param model     - The turn model declaration (type + config).
   * @param playerIds - Ordered list of player IDs. Order is the initial turn order.
   * @param options   - Optional event callback and shuffle flag.
   */
  constructor(model: TurnModel, playerIds: string[], options: TurnManagerOptions = {}) {
    this.model = model;
    this.onTurnEvent = options.onTurnEvent ?? (() => undefined);

    // Build initial turn order (optionally shuffled)
    this._turnOrder = [...playerIds];
    if (options.shuffle) {
      shuffleArray(this._turnOrder);
    }

    // Set initial currentIndex to first non-eliminated player (0 at construction)
    this._currentIndex = 0;
  }

  // ---------------------------------------------------------------------------
  // Public: state snapshot
  // ---------------------------------------------------------------------------

  /**
   * Returns an immutable snapshot of the current turn state.
   * The Sets are copied; mutations to the result won't affect internal state.
   */
  getState(): TurnState {
    return {
      model: this.model.type,
      activePlayerIds: this.getActivePlayerIds(),
      turnOrder: [...this._turnOrder],
      currentIndex: this._currentIndex,
      round: this._round,
      direction: this._direction,
      eliminated: new Set(this._eliminated),
      skipped: new Set(this._skipped),
    };
  }

  // ---------------------------------------------------------------------------
  // Public: active players
  // ---------------------------------------------------------------------------

  /**
   * Returns the list of player IDs who can currently act.
   *
   * - simultaneous: all non-eliminated players
   * - round_robin: single player at currentIndex (skipping eliminated)
   * - free_form: all non-eliminated players
   * - priority_queue: player at currentIndex (first non-eliminated in queue order)
   * - elimination: all non-eliminated players
   */
  getActivePlayerIds(): string[] {
    const remaining = this.getRemainingPlayers();

    switch (this.model.type) {
      case 'simultaneous':
        return remaining;

      case 'round_robin': {
        const active = this._getActivePlayerAt(this._currentIndex);
        return active ? [active] : [];
      }

      case 'free_form':
        return remaining;

      case 'priority_queue': {
        // The current active player is at _currentIndex, or the next non-eliminated from there.
        // This handles the case where the player at _currentIndex was eliminated.
        const active = this._getFirstNonEliminatedFrom(this._currentIndex);
        return active ? [active] : [];
      }

      case 'elimination':
        return remaining;

      default:
        return remaining;
    }
  }

  /**
   * Returns true if the given player can currently act.
   */
  isPlayerActive(playerId: string): boolean {
    return this.getActivePlayerIds().includes(playerId);
  }

  /**
   * Returns all non-eliminated players in turn order.
   */
  getRemainingPlayers(): string[] {
    return this._turnOrder.filter((id) => !this._eliminated.has(id));
  }

  // ---------------------------------------------------------------------------
  // Public: turn advancement
  // ---------------------------------------------------------------------------

  /**
   * Advances to the next turn.
   *
   * - round_robin: moves currentIndex to next non-eliminated player. If we wrap
   *   around, increments round and fires round_complete. Fires turn_start for
   *   the new active player.
   * - simultaneous: increments round counter and fires round_complete.
   * - free_form: no-op (turns don't advance in free_form).
   * - priority_queue: advances currentIndex to next non-eliminated player in
   *   queue order. If we reach the end, fires round_complete and wraps to start.
   * - elimination: no-op (players eliminate themselves; use eliminatePlayer).
   */
  advanceTurn(): void {
    switch (this.model.type) {
      case 'round_robin':
        this._advanceRoundRobin();
        break;

      case 'simultaneous':
        this._advanceSimultaneous();
        break;

      case 'free_form':
        // No-op
        break;

      case 'priority_queue':
        this._advancePriorityQueue();
        break;

      case 'elimination':
        // No-op (eliminations drive the game, not turn advances)
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Public: skip a player's turn
  // ---------------------------------------------------------------------------

  /**
   * Skips a player's turn for the current round.
   *
   * - Adds the player to the skipped set.
   * - If it was their turn (round_robin), advances to the next player.
   * - Fires turn_skip event.
   * - If the player is not the active player in round_robin, this is a no-op
   *   for advancement (but still marks them as skipped).
   */
  skipPlayer(playerId: string): void {
    // Don't skip eliminated players
    if (this._eliminated.has(playerId)) return;
    // Don't double-skip
    if (this._skipped.has(playerId)) return;

    this._skipped.add(playerId);
    this._emit({ type: 'turn_skip', playerId, round: this._round });

    // In round_robin, if this is the active player, advance
    if (this.model.type === 'round_robin') {
      const active = this._getActivePlayerAt(this._currentIndex);
      if (active === playerId) {
        this._advanceRoundRobin();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Public: eliminate a player
  // ---------------------------------------------------------------------------

  /**
   * Permanently removes a player from the turn order.
   *
   * - Adds them to the eliminated set (they no longer appear in remaining players).
   * - If it was their turn (round_robin), advances to the next player.
   * - Fires player_eliminated event.
   */
  eliminatePlayer(playerId: string): void {
    if (this._eliminated.has(playerId)) return; // Already eliminated

    // Capture whether it was this player's turn BEFORE eliminating
    const wasTheirTurn =
      this.model.type === 'round_robin' &&
      this._getActivePlayerAt(this._currentIndex) === playerId;

    this._eliminated.add(playerId);
    this._emit({ type: 'player_eliminated', playerId, round: this._round });

    // If it was their turn, advance to the next player
    if (wasTheirTurn) {
      this._advanceRoundRobin();
    }
  }

  // ---------------------------------------------------------------------------
  // Public: reverse turn direction (UNO-style)
  // ---------------------------------------------------------------------------

  /**
   * Reverses the turn direction.
   *
   * - Only works if model.reverseAllowed is true.
   * - Throws if reversal is not allowed (guards against accidental calls).
   * - Flips direction between 1 and -1.
   * - Fires direction_reverse event.
   */
  reverseDirection(): void {
    if (!this.model.reverseAllowed) {
      throw new Error(
        '[turn-system] reverseDirection() called but model.reverseAllowed is false. ' +
          'Set reverseAllowed: true in the TurnModel to enable direction reversal.',
      );
    }

    this._direction = this._direction === 1 ? -1 : 1;
    this._emit({ type: 'direction_reverse', round: this._round });
  }

  // ---------------------------------------------------------------------------
  // Public: reset round
  // ---------------------------------------------------------------------------

  /**
   * Starts a new round.
   *
   * - Clears the skipped set.
   * - Resets currentIndex to the beginning (or end if direction is reversed).
   * - Increments the round counter.
   * - Fires round_complete event.
   */
  resetRound(): void {
    this._skipped.clear();
    this._currentIndex = this._direction === 1 ? 0 : Math.max(0, this._turnOrder.length - 1);
    this._round++;
    this._emit({ type: 'round_complete', round: this._round });
  }

  // ---------------------------------------------------------------------------
  // Public: cleanup
  // ---------------------------------------------------------------------------

  /**
   * Cleanup. Currently a no-op (no timers owned here), but provided for
   * consistency with other subsystems.
   */
  destroy(): void {
    // No timers to clean up — caller owns timers.
  }

  // ---------------------------------------------------------------------------
  // Internal: active player lookup
  // ---------------------------------------------------------------------------

  /**
   * Returns the player at the given index if they are not eliminated.
   * Returns null if the index is out of bounds or the player is eliminated.
   */
  private _getActivePlayerAt(index: number): string | null {
    const id = this._turnOrder[index];
    if (!id || this._eliminated.has(id)) return null;
    return id;
  }

  /**
   * Returns the first non-eliminated player from startIndex onwards (inclusive).
   * Does NOT wrap around — used for priority_queue where ordering is strict.
   * Returns null if no non-eliminated player found from startIndex to end.
   */
  private _getFirstNonEliminatedFrom(startIndex: number): string | null {
    for (let i = startIndex; i < this._turnOrder.length; i++) {
      const id = this._turnOrder[i];
      if (id && !this._eliminated.has(id)) return id;
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Internal: round-robin advancement
  // ---------------------------------------------------------------------------

  /**
   * Advances round_robin to the next player.
   * Fires turn_start for the new active player.
   * Fires round_complete when we wrap around to the beginning.
   */
  private _advanceRoundRobin(): void {
    const remaining = this.getRemainingPlayers();
    if (remaining.length === 0) return;

    const prevIndex = this._currentIndex;
    let nextIndex = this._wrapIndex(this._currentIndex + this._direction);

    // Skip eliminated players (walk at most length steps)
    let steps = 0;
    while (this._eliminated.has(this._turnOrder[nextIndex]!) && steps < this._turnOrder.length) {
      nextIndex = this._wrapIndex(nextIndex + this._direction);
      steps++;
    }

    // Detect wrap-around: did we pass the "start" of the order?
    // A wrap occurs when the new index is "behind" the prev in the direction of travel.
    let wrapped = false;
    if (this._direction === 1 && nextIndex <= prevIndex) {
      wrapped = true;
    } else if (this._direction === -1 && nextIndex >= prevIndex) {
      wrapped = true;
    }

    this._currentIndex = nextIndex;

    if (wrapped) {
      this._round++;
      this._skipped.clear();
      this._emit({ type: 'round_complete', round: this._round });
    }

    const newActive = this._turnOrder[this._currentIndex];
    if (newActive && !this._eliminated.has(newActive)) {
      this._emit({ type: 'turn_start', playerId: newActive, round: this._round });
    }
  }

  /**
   * Advances simultaneous: increments round and fires round_complete.
   */
  private _advanceSimultaneous(): void {
    this._round++;
    this._skipped.clear();
    this._emit({ type: 'round_complete', round: this._round });
  }

  /**
   * Advances priority_queue: moves currentIndex to the next non-eliminated player.
   * 
   * Priority queue works like a one-pass queue through the turn order:
   * - _currentIndex points to who is currently active
   * - advanceTurn moves forward to the next non-eliminated player
   * - When we reach the end of the array (no more non-eliminated players ahead),
   *   wrap around to the beginning and fire round_complete
   */
  private _advancePriorityQueue(): void {
    const len = this._turnOrder.length;
    if (len === 0) return;

    // Find the next non-eliminated player strictly after currentIndex
    let nextIndex = -1;
    for (let i = this._currentIndex + 1; i < len; i++) {
      if (!this._eliminated.has(this._turnOrder[i]!)) {
        nextIndex = i;
        break;
      }
    }

    if (nextIndex === -1) {
      // No more players ahead — queue exhausted, wrap around
      this._round++;
      this._skipped.clear();
      this._emit({ type: 'round_complete', round: this._round });

      // Reset to first non-eliminated player
      const firstIdx = this._turnOrder.findIndex((id) => !this._eliminated.has(id));
      if (firstIdx !== -1) {
        this._currentIndex = firstIdx;
        this._emit({
          type: 'turn_start',
          playerId: this._turnOrder[firstIdx]!,
          round: this._round,
        });
      }
    } else {
      this._currentIndex = nextIndex;
      this._emit({
        type: 'turn_start',
        playerId: this._turnOrder[nextIndex]!,
        round: this._round,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: helpers
  // ---------------------------------------------------------------------------

  /**
   * Wraps an index to stay within [0, turnOrder.length - 1].
   */
  private _wrapIndex(idx: number): number {
    const len = this._turnOrder.length;
    if (len === 0) return 0;
    return ((idx % len) + len) % len;
  }

  /**
   * Emit a turn event to the registered callback.
   */
  private _emit(event: TurnEvent): void {
    this.onTurnEvent(event);
  }
}
