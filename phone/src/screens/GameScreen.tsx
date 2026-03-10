import { useCallback } from 'react';
import { XCircle } from 'lucide-react';
import { usePlatform } from '../platform/BoredlessClient';
import { ClientMessageType } from '@boredless/shared';
import type { PlayerInfo } from '@boredless/shared';
import { useGameEvent } from '../hooks/useGameEvent';
import { getPhoneComponent } from '../games/registry';

/**
 * GameScreen — renders the active game's phone component.
 *
 * ALL state (phase, privateState, scores, timer) comes from the platform SDK.
 * NO raw WebSocket listeners here. The platform handles everything.
 */
export function GameScreen() {
  const send = usePlatform((s) => s.send);
  const phase = usePlatform((s) => s.phase);
  const publicState = usePlatform((s) => s.publicState);
  const privateState = usePlatform((s) => s.privateState);
  const scores = usePlatform((s) => s.scores);
  const timerMs = usePlatform((s) => s.timerMs);
  const playerId = usePlatform((s) => s.playerId);
  const room = usePlatform((s) => s.room);
  const isHost = !!(room && playerId === room.hostPlayerId);
  const myPlayer: PlayerInfo = (() => {
    const p = room?.players.find((pl) => pl.id === playerId);
    return {
      playerId: playerId ?? '',
      playerName: p?.name ?? '',
      playerColor: p?.color ?? '#6366f1',
      isAlive: p?.status === 'connected' || p?.status === 'disconnected',
    };
  })();

  const submitInput = useCallback(
    (inputType: string, data: unknown) => {
      send({
        type: ClientMessageType.SUBMIT_INPUT,
        inputType,
        payload: data as Record<string, unknown>,
      });
    },
    [send],
  );

  if (!phase || !privateState) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-950">
        <div className="text-white text-xl animate-pulse">Loading...</div>
      </div>
    );
  }

  const gameId = (privateState as Record<string, unknown>).gameId as string;
  const PhoneComponent = gameId ? getPhoneComponent(gameId) : undefined;

  return (
    <div className="relative min-h-dvh">
      {PhoneComponent ? (
        <PhoneComponent
          phase={phase}
          publicState={publicState}
          privateState={privateState}
          myPlayer={myPlayer}
          scores={scores}
          timerMs={timerMs}
          submitInput={submitInput}
          useGameEvent={useGameEvent}
        />
      ) : (
        <div className="flex items-center justify-center min-h-dvh bg-gray-950">
          <div className="text-white text-xl">
            {gameId ? `Unknown game: ${gameId}` : 'No game loaded'}
          </div>
        </div>
      )}
      {isHost && (
        <button
          onClick={() => {
            if (confirm('End this game and return everyone to the lobby?')) {
              send({ type: 'return_to_lobby' });
            }
          }}
          className="fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-medium backdrop-blur-sm active:bg-red-500/25 transition-colors"
        >
          <XCircle size={14} />
          End Game
        </button>
      )}
    </div>
  );
}
