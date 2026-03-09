import { useEffect } from 'react';
import { useConnectionStore } from '../store/connection';
import { useGameStore } from '../store/game';
import { ServerMessageType } from '@boredless/shared';
import type { PhaseState } from '@boredless/shared';

interface Props {
  onGameStarted: () => void;
}

export function LobbyScreen({ onGameStarted }: Props) {
  const on = useConnectionStore((s) => s.on);
  const setPhase = useGameStore((s) => s.setPhase);
  const setPrivateState = useGameStore((s) => s.setPrivateState);

  useEffect(() => {
    const unsub1 = on(ServerMessageType.GAME_STARTED, (msg) => {
      const m = msg as { type: string; phase: PhaseState; gamePublicState: Record<string, unknown> };
      setPhase(m.phase);
      onGameStarted();
    });

    const unsub2 = on(ServerMessageType.PRIVATE_STATE, (msg) => {
      const m = msg as { type: string; state: Record<string, unknown> };
      setPrivateState(m.state);
    });

    const unsub3 = on(ServerMessageType.PHASE_CHANGED, (msg) => {
      const m = msg as { type: string; phase: PhaseState };
      setPhase(m.phase);
      onGameStarted();
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [on, setPhase, setPrivateState, onGameStarted]);

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-gray-950">
      <div className="text-6xl mb-6">🎮</div>
      <h1 className="text-4xl font-bold text-emerald-400 mb-3">You're In!</h1>
      <p className="text-gray-400 text-lg text-center mb-8">
        Waiting for the host to start a game...
      </p>
      <div className="flex items-center gap-2 text-2xl">
        <span>📺</span>
        <span className="text-gray-500 text-base">Look at the big screen</span>
      </div>

      {/* Pulsing indicator */}
      <div className="mt-10 flex gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}
