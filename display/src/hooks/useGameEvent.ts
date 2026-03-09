import { useEffect, useRef } from 'react';
import { useConnectionStore } from '../store/connection';
import { ServerMessageType } from '@boredless/shared';
import type { ServerMessage } from '@boredless/shared';

/**
 * useGameEvent — listen for a custom game event emitted by the server via ctx.emit() / ctx.emitToDisplay().
 *
 * Games define their own event vocabulary. The platform routes GAME_EVENT messages
 * without interpreting them — this hook filters by event name so each component
 * only reacts to the events it cares about.
 *
 * @param event  Custom event name, e.g. 'bluff:reveal'
 * @param handler  Callback called with the event payload whenever it arrives
 *
 * @example
 * useGameEvent('bluff:reveal', (data) => {
 *   const d = data as { playerId: string; wasBluffing: boolean };
 *   animateReveal(d);
 * });
 */
export function useGameEvent(
  event: string,
  handler: (data: unknown) => void,
): void {
  const on = useConnectionStore((s) => s.on);

  // Keep a stable ref to the handler so the effect doesn't re-subscribe on
  // every render if the caller passes an inline arrow function.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = on(ServerMessageType.GAME_EVENT, (msg: ServerMessage) => {
      const m = msg as Extract<ServerMessage, { type: 'game_event' }>;
      if (m.event === event) {
        handlerRef.current(m.data);
      }
    });
    return unsub;
  }, [on, event]);
}
