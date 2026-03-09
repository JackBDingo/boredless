import { useCallback, useEffect } from 'react';
import { XCircle } from 'lucide-react';
import { useConnectionStore } from '../store/connection';
import { useGameStore } from '../store/game';
import { useRoomStore } from '../store/room';
import { ServerMessageType, PhaseType, ClientMessageType, InputType } from '@boredless/shared';
import type { PhaseState, ScoreEntry, PlayerInfo } from '@boredless/shared';
import type { PublicPlayerState } from '@boredless/shared';
import { useGameEvent } from '../hooks/useGameEvent';
import { getPhoneComponent } from '../games/registry';

export function GameScreen() {
  const on = useConnectionStore((s) => s.on);
  const send = useConnectionStore((s) => s.send);
  const playerId = useConnectionStore((s) => s.playerId);
  const room = useRoomStore((s) => s.room);
  const isHost = room && playerId === room.hostPlayerId;
  const phase = useGameStore((s) => s.phase);
  const privateState = useGameStore((s) => s.privateState);
  const publicState = useGameStore((s) => s.publicState);
  const scores = useGameStore((s) => s.scores);
  const timerMs = useGameStore((s) => s.timerRemainingMs);
  const setPhase = useGameStore((s) => s.setPhase);
  const setPrivateState = useGameStore((s) => s.setPrivateState);
  const setPublicState = useGameStore((s) => s.setPublicState);
  const setTimer = useGameStore((s) => s.setTimer);
  const setScores = useGameStore((s) => s.setScores);

  useEffect(() => {
    const unsubs = [
      on(ServerMessageType.PHASE_CHANGED, (msg) => {
        const m = msg as { type: string; phase: PhaseState; gamePublicState: Record<string, unknown> };
        setPhase(m.phase);
        setPublicState(m.gamePublicState);
      }),
      on(ServerMessageType.PRIVATE_STATE, (msg) => {
        const m = msg as { type: string; state: Record<string, unknown> };
        setPrivateState(m.state);
      }),
      on(ServerMessageType.TIMER_TICK, (msg) => {
        const m = msg as { type: string; remainingMs: number };
        setTimer(m.remainingMs);
      }),
      on(ServerMessageType.SCORE_UPDATE, (msg) => {
        const m = msg as { type: string; scores: ScoreEntry[] };
        setScores(m.scores);
      }),
      on(ServerMessageType.INPUT_ACCEPTED, () => {
        // Could show a toast notification in future
      }),
      on(ServerMessageType.INPUT_REJECTED, (msg) => {
        const m = msg as { type: string; reason: string };
        console.warn('Input rejected:', m.reason);
      }),
      on(ServerMessageType.GAME_OVER, () => {
        // Update phase to GAME_OVER so game components render the game-over view
        const currentPhase = useGameStore.getState().phase;
        if (currentPhase) {
          setPhase({ ...currentPhase, phaseType: PhaseType.GAME_OVER as never });
        }
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [on, setPhase, setPrivateState, setPublicState, setTimer, setScores]);

  // Build submitInput — abstracts WebSocket message construction from game components
  const submitInput = useCallback(
    (inputType: string, data: unknown) => {
      send({
        type: ClientMessageType.SUBMIT_INPUT,
        inputType: inputType as InputType,
        payload: data as Record<string, unknown>,
      });
    },
    [send],
  );

  // Build myPlayer from connectionStore playerId + room player list
  const myPlayer: PlayerInfo = (() => {
    const player = room?.players.find((p: PublicPlayerState) => p.id === playerId);
    return {
      playerId: playerId ?? '',
      playerName: player?.name ?? '',
      playerColor: player?.color ?? '#6366f1',
      isAlive: player?.status === 'connected' || player?.status === 'disconnected',
    };
  })();

  if (!phase || !privateState) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-950">
        <div className="text-white text-xl animate-pulse">Loading...</div>
      </div>
    );
  }

  const gameId = (privateState as Record<string, unknown>).gameId as string;
  const PhoneComponent = gameId ? getPhoneComponent(gameId) : undefined;

  const gameComponent = PhoneComponent
    ? (
      <PhoneComponent
        phase={phase}
        publicState={publicState ?? {}}
        privateState={privateState}
        myPlayer={myPlayer}
        scores={scores}
        timerMs={timerMs}
        submitInput={submitInput}
        useGameEvent={useGameEvent}
      />
    )
    : (
      <div className="flex items-center justify-center min-h-dvh bg-gray-950">
        <div className="text-white text-xl">
          {gameId ? `Unknown game: ${gameId}` : 'No game loaded'}
        </div>
      </div>
    );

  return (
    <div className="relative min-h-dvh">
      {gameComponent}
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
