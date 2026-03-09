import { TIMER_TICK_INTERVAL_MS, ServerMessageType } from '@boredless/shared';
import { sendToSessions } from '../ws/send.js';

export interface ActiveTimer {
  roomId: string;
  phaseType: string;
  durationMs: number;
  startedAt: number;
  interval: NodeJS.Timeout;
  onExpire: () => void;
}

class TimerEngine {
  /** roomId → ActiveTimer */
  private timers = new Map<string, ActiveTimer>();

  /** Start a timer for a room's current phase */
  start(
    roomId: string,
    phaseType: string,
    durationMs: number,
    sessionIds: string[],
    onExpire: () => void,
  ): void {
    // Clear any existing timer for this room
    this.stop(roomId);

    const startedAt = Date.now();
    const endAt = startedAt + durationMs;

    const interval = setInterval(() => {
      const remaining = Math.max(0, endAt - Date.now());

      // Send tick to all sessions
      sendToSessions(sessionIds, {
        type: ServerMessageType.TIMER_TICK,
        remainingMs: remaining,
      });

      // Check expiration
      if (remaining <= 0) {
        this.stop(roomId);
        sendToSessions(sessionIds, {
          type: ServerMessageType.TIMER_EXPIRED,
          phaseType,
        });
        onExpire();
      }
    }, TIMER_TICK_INTERVAL_MS);

    this.timers.set(roomId, {
      roomId,
      phaseType,
      durationMs,
      startedAt,
      interval,
      onExpire,
    });
  }

  /** Stop and clear timer for a room */
  stop(roomId: string): void {
    const timer = this.timers.get(roomId);
    if (timer) {
      clearInterval(timer.interval);
      this.timers.delete(roomId);
    }
  }

  /** Get remaining time for a room */
  getRemaining(roomId: string): number | null {
    const timer = this.timers.get(roomId);
    if (!timer) return null;
    return Math.max(0, timer.durationMs - (Date.now() - timer.startedAt));
  }

  /** Stop all timers (for shutdown) */
  stopAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer.interval);
    }
    this.timers.clear();
  }
}

export const timerEngine = new TimerEngine();
