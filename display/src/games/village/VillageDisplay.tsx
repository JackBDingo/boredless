import type { PhaseState, VillagePublicState } from '@boredless/shared';
import { PhaseType } from '@boredless/shared';
import { Timer } from '../../components/Timer';
import { Moon, Sun, Vote, Skull, MessageCircle } from 'lucide-react';

interface VillageDisplayProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
}

export function VillageDisplay({ phase, publicState }: VillageDisplayProps) {
  const state = publicState as unknown as VillagePublicState;

  return (
    <div className="flex flex-col items-center justify-center h-full relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/5 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col items-center gap-6 p-8">
        {/* Day indicator */}
        {phase.phaseType !== PhaseType.VOS_ROLE_REVEAL && (
          <div className="text-gray-500 text-lg tracking-wider uppercase">Day {phase.roundNumber}</div>
        )}

        {/* Player grid */}
        <div className="flex flex-wrap gap-3 justify-center max-w-4xl">
          {state.players.map((p) => (
            <div
              key={p.playerId}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all ${
                p.isAlive ? 'bg-white/5 border-white/10' : 'opacity-30 bg-white/[0.02] border-white/5'
              } ${
                state.eliminatedPlayerId === p.playerId ? 'border-red-500/60 bg-red-500/10' : ''
              }`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: p.isAlive ? p.playerColor : '#374151' }}
              >
                {p.playerName.charAt(0).toUpperCase()}
              </div>
              <span className={p.isAlive ? 'text-white font-medium' : 'text-gray-600 line-through'}>
                {p.playerName}
              </span>
              {!p.isAlive && <Skull size={14} className="text-gray-600" />}
            </div>
          ))}
        </div>

        {/* ROLE REVEAL */}
        {phase.phaseType === PhaseType.VOS_ROLE_REVEAL && (
          <div className="text-center mt-4">
            <div className="w-20 h-20 rounded-2xl bg-violet-500/15 flex items-center justify-center mx-auto mb-4">
              <Moon size={40} className="text-violet-400" />
            </div>
            <h1 className="text-5xl font-bold text-white mb-3">Village of Shadows</h1>
            <p className="text-xl text-gray-400">Check your phones — your role has been assigned</p>
            <div className="mt-6"><Timer /></div>
          </div>
        )}

        {/* NIGHT */}
        {phase.phaseType === PhaseType.VOS_NIGHT && (
          <div className="text-center mt-4">
            <div className="w-20 h-20 rounded-2xl bg-blue-500/15 flex items-center justify-center mx-auto mb-4">
              <Moon size={40} className="text-blue-400" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-2">Night Falls</h2>
            <p className="text-gray-500">The village sleeps... creatures stir in the darkness</p>
            <p className="text-indigo-400 mt-4 text-lg">
              {state.nightActionsSubmitted}/{state.nightActionsExpected} actions
            </p>
            <div className="mt-4"><Timer /></div>
          </div>
        )}

        {/* NIGHT RESULT */}
        {phase.phaseType === PhaseType.VOS_NIGHT_RESULT && (
          <div className="text-center mt-4">
            <div className="w-20 h-20 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
              <Sun size={40} className="text-amber-400" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-2">Dawn Breaks</h2>
            <p className="text-xl text-gray-300 mt-4">{state.nightResultMessage}</p>
            {state.eliminatedPlayerName && state.eliminatedPlayerRole && (
              <p className="text-gray-500 mt-2">
                They were a <span className="text-white font-bold">{state.eliminatedPlayerRole}</span>
              </p>
            )}
            <div className="mt-4"><Timer /></div>
          </div>
        )}

        {/* DAY */}
        {phase.phaseType === PhaseType.VOS_DAY && (
          <div className="text-center mt-4">
            <div className="w-20 h-20 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
              <MessageCircle size={40} className="text-amber-400" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-2">Day Discussion</h2>
            <p className="text-gray-400">Discuss who you think the werewolves are</p>
            <div className="mt-4"><Timer /></div>
          </div>
        )}

        {/* VOTE */}
        {phase.phaseType === PhaseType.VOS_VOTE && (
          <div className="text-center mt-4">
            <div className="w-20 h-20 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <Vote size={40} className="text-red-400" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-2">Village Vote</h2>
            <p className="text-gray-400">Vote to eliminate a suspect</p>
            {state.votes && state.votes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3 justify-center">
                {state.votes.map((v) => (
                  <div key={v.targetPlayerId} className="bg-white/5 rounded-2xl px-5 py-3 border border-white/10">
                    <span className="text-white font-bold">{v.targetPlayerName}</span>
                    <span className="text-red-400 ml-3">{v.voteCount} vote{v.voteCount !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4"><Timer /></div>
          </div>
        )}

        {/* VOTE RESULT */}
        {phase.phaseType === PhaseType.VOS_VOTE_RESULT && (
          <div className="text-center mt-4">
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
    </div>
  );
}
