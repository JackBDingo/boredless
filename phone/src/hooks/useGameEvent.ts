import { useEffect, useRef } from 'react';
import { usePlatform } from '../platform/BoredlessClient';
import { ServerMessageType } from '@boredless/shared';
import type { ServerMessage } from '@boredless/shared';

/**
 * useGameEvent — listen for custom game events (Tier 2 event bus).
 *
 * Games define their own event vocabulary. The platform routes GAME_EVENT
 * messages without interpreting them. This hook filters by event name.
 */
export function useGameEvent(event: string, handler: (data: unknown) => void): void {
  const on = usePlatform((s) => s.on);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsub = on(ServerMessageType.GAME_EVENT, (msg: ServerMessage) => {
      const m = msg as Extract<ServerMessage, { type: ServerMessageType.GAME_EVENT }>;
      if (m.event === event) handlerRef.current(m.data);
    });
    return unsub;
  }, [on, event]);
}
