import type { PhaseState, VillagePublicState } from '@boredless/shared';
import { PhaseType } from '@boredless/shared';
import { Timer } from '../../components/Timer';

interface VillageDisplayProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
}

export function VillageDisplay({ phase, publicState }: VillageDisplayProps) {
  const state = publicState as unknown as VillagePublicState;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
      {/* Day indicator */}
      {phase.phaseType !== PhaseType.VOS_ROLE_REVEAL && (
        <div className="text-gray-400 text-lg">Day {phase.roundNumber}</div>
      )}

      {/* Player grid */}
      <div className="flex flex-wrap gap-3 justify-center max-w-4xl">
        {state.players.map((p) => (
          <div
            key={p.playerId}
            className={`px-4 py-2 rounded-full border-2 ${
              p.isAlive ? '' : 'opacity-30 line-through'
            } ${
              state.eliminatedPlayerId === p.playerId ? 'border-red-500 bg-red-500/20' : ''
            }`}
            style={{
              borderColor: p.isAlive ? p.playerColor : '#4b5563',
              backgroundColor: p.isAlive ? p.playerColor + '22' : 'transparent',
            }}
          >
            <span className={p.isAlive ? 'text-white' : 'text-gray-600'}>{p.playerName}</span>
            {!p.isAlive && <span className="ml-1">💀</span>}
          </div>
        ))}
      </div>

      {/* Phase content */}
      {phase.phaseType === PhaseType.VOS_ROLE_REVEAL && (
        <div className="text-center">
          <h1 className="text-5xl font-bold text-purple-400">🐺 Village of Shadows</h1>
          <p className="text-xl text-gray-300 mt-4">Check your phones — your role has been assigned!</p>
          <div className="mt-6"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_NIGHT && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-blue-300">🌙 Night Falls</h2>
          <p className="text-gray-400 mt-2">The village sleeps... creatures stir in the darkness</p>
          <p className="text-indigo-400 mt-4">
            {state.nightActionsSubmitted}/{state.nightActionsExpected} actions
          </p>
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_NIGHT_RESULT && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-orange-300">☀️ Dawn Breaks</h2>
          <p className="text-xl text-white mt-4">{state.nightResultMessage}</p>
          {state.eliminatedPlayerName && state.eliminatedPlayerRole && (
            <p className="text-gray-400 mt-2">
              They were a <span className="text-white font-bold">{state.eliminatedPlayerRole}</span>
            </p>
          )}
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_DAY && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-yellow-300">☀️ Day Discussion</h2>
          <p className="text-gray-300 mt-2">Discuss who you think the werewolves are!</p>
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_VOTE && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-red-400">🗳️ Village Vote</h2>
          <p className="text-gray-300 mt-2">Vote to eliminate a suspect!</p>
          {state.votes && state.votes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-3 justify-center">
              {state.votes.map((v) => (
                <div key={v.targetPlayerId} className="bg-gray-800 rounded-xl px-4 py-2">
                  <span className="text-white font-bold">{v.targetPlayerName}</span>
                  <span className="text-red-400 ml-2">{v.voteCount} votes</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.VOS_VOTE_RESULT && (
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white">{state.voteResultMessage}</h2>
          {state.eliminatedPlayerName && state.eliminatedPlayerRole && (
            <p className="text-xl text-gray-400 mt-4">
              They were a <span className="text-white font-bold">{state.eliminatedPlayerRole}</span>
            </p>
          )}
          <div className="mt-4"><Timer /></div>
        </div>
      )}
    </div>
  );
}
