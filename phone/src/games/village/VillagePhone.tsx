import { useConnectionStore } from '../../store/connection';
import { useGameStore } from '../../store/game';
import type { PhaseState, VillagePrivateState } from '@boredless/shared';
import { PhaseType, ClientMessageType, InputType, VillageRole } from '@boredless/shared';
import { getRoleInfo } from './roleInfo';

interface Props {
  phase: PhaseState;
  privateState: Record<string, unknown>;
}

export function VillagePhone({ phase, privateState }: Props) {
  const state = privateState as unknown as VillagePrivateState;
  const send = useConnectionStore((s) => s.send);
  const timerMs = useGameStore((s) => s.timerRemainingMs);

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const isUrgent = seconds !== null && seconds <= 5;
  const roleInfo = getRoleInfo(state.role);

  const handleNightAction = (targetPlayerId: string) => {
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.NIGHT_ACTION,
      payload: { targetPlayerId },
    });
  };

  const handleVote = (targetPlayerId: string) => {
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.VOTE,
      payload: { answerId: targetPlayerId },
    });
  };

  // Dead player spectator view
  if (!state.isAlive) {
    return (
      <div className="flex flex-col items-center justify-center min-h-dvh bg-gray-950 px-5 py-6 text-center">
        <div className="text-6xl mb-4">💀</div>
        <h2 className="text-2xl font-bold text-white mb-2">You have been eliminated</h2>
        <p className="text-gray-400 mb-4">You were the {roleInfo.name} {roleInfo.emoji}</p>
        <p className="text-gray-500 text-sm">Watch the game unfold on the big screen</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center min-h-dvh bg-gray-950 px-5 py-6 overflow-y-auto">
      {/* Timer */}
      {seconds !== null && (
        <div className={`text-6xl font-bold mb-5 ${isUrgent ? 'text-red-400' : 'text-white'}`}>
          {seconds}
        </div>
      )}

      {/* Role badge (always visible) */}
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full border-2 mb-6"
        style={{
          backgroundColor: roleInfo.color + '22',
          borderColor: roleInfo.color,
        }}
      >
        <span className="text-2xl">{roleInfo.emoji}</span>
        <span className="font-bold" style={{ color: roleInfo.color }}>
          {roleInfo.name}
        </span>
      </div>

      {/* ROLE REVEAL phase */}
      {phase.phaseType === PhaseType.VOS_ROLE_REVEAL && (
        <div className="flex flex-col items-center gap-4 text-center w-full">
          <h2 className="text-2xl font-bold text-white">Your Role</h2>
          <p className="text-gray-300 text-sm leading-relaxed px-4">{roleInfo.description}</p>
          {state.werewolfTeammates.length > 0 && (
            <p className="text-red-400 text-sm italic">
              Your fellow werewolves are in the room... 🐺
            </p>
          )}
        </div>
      )}

      {/* NIGHT phase — werewolf/seer/doctor act */}
      {phase.phaseType === PhaseType.VOS_NIGHT &&
        state.role !== VillageRole.VILLAGER &&
        !state.hasActed &&
        state.nightTargets && (
          <div className="w-full flex flex-col items-center gap-4">
            <h2 className="text-2xl font-bold text-white text-center">
              {state.role === VillageRole.WEREWOLF && '🐺 Choose a victim'}
              {state.role === VillageRole.SEER && '🔮 Choose who to inspect'}
              {state.role === VillageRole.DOCTOR && '💉 Choose who to protect'}
            </h2>
            {state.nightTargets.map((target) => (
              <button
                key={target.playerId}
                onClick={() => handleNightAction(target.playerId)}
                className="
                  w-full
                  bg-gray-800 hover:bg-gray-700
                  text-white text-lg text-center
                  rounded-xl px-5 py-4
                  border border-gray-700 hover:border-indigo-500
                  min-h-[44px]
                  transition-colors
                "
              >
                {target.playerName}
              </button>
            ))}
          </div>
        )}

      {/* NIGHT phase — already acted */}
      {phase.phaseType === PhaseType.VOS_NIGHT &&
        state.role !== VillageRole.VILLAGER &&
        state.hasActed && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-5xl">✅</div>
            <h2 className="text-2xl font-bold text-white">Action submitted</h2>
            <p className="text-gray-400">Waiting for night to end...</p>
          </div>
        )}

      {/* NIGHT phase — villager sleeps */}
      {phase.phaseType === PhaseType.VOS_NIGHT && state.role === VillageRole.VILLAGER && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">🌙</div>
          <h2 className="text-2xl font-bold text-white">Night</h2>
          <p className="text-gray-400">You are sleeping... close your eyes 😴</p>
        </div>
      )}

      {/* NIGHT RESULT — seer learns result */}
      {phase.phaseType === PhaseType.VOS_NIGHT_RESULT && state.seerResult && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">🔮</div>
          <h2 className="text-2xl font-bold text-white">Seer Vision</h2>
          <p className="text-gray-300 text-lg">
            <span className="font-bold text-white">{state.seerResult.targetPlayerName}</span> is{' '}
            {state.seerResult.isWerewolf ? (
              <span className="text-red-400 font-bold">🐺 a WEREWOLF!</span>
            ) : (
              <span className="text-emerald-400 font-bold">✅ NOT a werewolf</span>
            )}
          </p>
        </div>
      )}

      {/* NIGHT RESULT — non-seer */}
      {phase.phaseType === PhaseType.VOS_NIGHT_RESULT && !state.seerResult && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">📺</div>
          <h2 className="text-2xl font-bold text-white">Look at the big screen!</h2>
        </div>
      )}

      {/* DAY phase — discussion */}
      {phase.phaseType === PhaseType.VOS_DAY && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">☀️</div>
          <h2 className="text-2xl font-bold text-white">Discussion Time</h2>
          <p className="text-gray-400">Talk to the other players. Who seems suspicious?</p>
        </div>
      )}

      {/* VOTE phase — choose target */}
      {phase.phaseType === PhaseType.VOS_VOTE && !state.hasVoted && state.voteTargets && (
        <div className="w-full flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold text-white text-center">
            🗳️ Vote to Eliminate
          </h2>
          {state.voteTargets.map((target) => (
            <button
              key={target.playerId}
              onClick={() => handleVote(target.playerId)}
              className="
                w-full
                bg-gray-800 hover:bg-red-900
                text-white text-lg text-center
                rounded-xl px-5 py-4
                border border-gray-700 hover:border-red-500
                min-h-[44px]
                transition-colors
              "
            >
              {target.playerName}
            </button>
          ))}
        </div>
      )}

      {/* VOTE phase — already voted */}
      {phase.phaseType === PhaseType.VOS_VOTE && state.hasVoted && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">🗳️</div>
          <h2 className="text-2xl font-bold text-white">Vote Cast!</h2>
          <p className="text-gray-400">Waiting for results...</p>
        </div>
      )}

      {/* VOTE RESULT */}
      {phase.phaseType === PhaseType.VOS_VOTE_RESULT && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">📺</div>
          <h2 className="text-2xl font-bold text-white">Look at the big screen!</h2>
        </div>
      )}

      {/* GAME OVER */}
      {phase.phaseType === PhaseType.GAME_OVER && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-6xl">🏆</div>
          <h2 className="text-2xl font-bold text-white">Game Over!</h2>
          <p className="text-gray-400">Check the big screen for results</p>
        </div>
      )}
    </div>
  );
}
