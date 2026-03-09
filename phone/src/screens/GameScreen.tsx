import { useEffect } from 'react';
import { useConnectionStore } from '../store/connection';
import { useGameStore } from '../store/game';
import { ServerMessageType } from '@boredless/shared';
import type { PhaseState } from '@boredless/shared';
import { BBPhone } from '../games/bluff-battle/BBPhone';
import { VillagePhone } from '../games/village/VillagePhone';

export function GameScreen() {
  const on = useConnectionStore((s) => s.on);
  const phase = useGameStore((s) => s.phase);
  const privateState = useGameStore((s) => s.privateState);
  const setPhase = useGameStore((s) => s.setPhase);
  const setPrivateState = useGameStore((s) => s.setPrivateState);
  const setTimer = useGameStore((s) => s.setTimer);

  useEffect(() => {
    const unsubs = [
      on(ServerMessageType.PHASE_CHANGED, (msg) => {
        const m = msg as { type: string; phase: PhaseState };
        setPhase(m.phase);
      }),
      on(ServerMessageType.PRIVATE_STATE, (msg) => {
        const m = msg as { type: string; state: Record<string, unknown> };
        setPrivateState(m.state);
      }),
      on(ServerMessageType.TIMER_TICK, (msg) => {
        const m = msg as { type: string; remainingMs: number };
        setTimer(m.remainingMs);
      }),
      on(ServerMessageType.INPUT_ACCEPTED, () => {
        // Could show a toast notification in future
      }),
      on(ServerMessageType.INPUT_REJECTED, (msg) => {
        const m = msg as { type: string; reason: string };
        console.warn('Input rejected:', m.reason);
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [on, setPhase, setPrivateState, setTimer]);

  if (!phase || !privateState) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-950">
        <div className="text-white text-xl animate-pulse">Loading...</div>
      </div>
    );
  }

  const gameId = (privateState as Record<string, unknown>).gameId as string;

  switch (gameId) {
    case 'bluff_battle':
      return <BBPhone phase={phase} privateState={privateState} />;
    case 'village_of_shadows':
      return <VillagePhone phase={phase} privateState={privateState} />;
    default:
      return (
        <div className="flex items-center justify-center min-h-dvh bg-gray-950">
          <div className="text-white text-xl">Unknown game: {gameId}</div>
        </div>
      );
  }
}
