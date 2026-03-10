import type { BBPublicState } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { BBPhase } from '../phases.js';
import { Timer } from '@display/components/Timer';
import { Scoreboard } from '@display/components/Scoreboard';
import { Theater, Send, Vote, Sparkles } from 'lucide-react';
import type { DisplayProps } from '@display/games/types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BBDisplay({ phase, publicState, scores, useGameEvent: _useGameEvent }: DisplayProps) {
  const state = publicState as unknown as BBPublicState;

  return (
    <div className="flex flex-col items-center justify-center h-full relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-gray-950 to-purple-950/30" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-500/5 rounded-full blur-3xl" />

      <div className="relative z-10 flex flex-col items-center gap-6 p-8 w-full max-w-4xl">
        {/* Round indicator */}
        <div className="text-gray-500 text-lg tracking-wider uppercase">
          Round {phase.roundNumber} of {phase.totalRounds}
        </div>

        {/* INSTRUCTIONS */}
        {phase.phaseType === PhaseType.INSTRUCTIONS && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-indigo-500/15 flex items-center justify-center mx-auto mb-6">
              <Theater size={40} className="text-indigo-400" />
            </div>
            <h1 className="text-5xl font-bold text-white mb-3">Bluff Battle</h1>
            <p className="text-xl text-gray-400">Submit fake answers. Fool your friends. Spot the truth.</p>
            <div className="mt-6"><Timer /></div>
          </div>
        )}

        {/* PROMPT */}
        {phase.phaseType === BBPhase.PROMPT && (
          <div className="text-center">
            <h2 className="text-4xl font-bold text-white leading-snug">{state.currentPrompt}</h2>
            <p className="text-gray-500 mt-4">Check your phones — submit your best fake answer</p>
            <div className="mt-6"><Timer /></div>
          </div>
        )}

        {/* SUBMIT */}
        {phase.phaseType === BBPhase.SUBMIT && (
          <div className="text-center">
            <h2 className="text-3xl font-bold text-white mb-6 leading-snug">{state.currentPrompt}</h2>
            <div className="flex items-center justify-center gap-3">
              <Send size={20} className="text-indigo-400" />
              <p className="text-2xl text-indigo-400">
                {state.submittedCount}/{state.totalPlayers} submitted
              </p>
            </div>
            <div className="mt-6"><Timer /></div>
          </div>
        )}

        {/* VOTING */}
        {phase.phaseType === BBPhase.VOTING && (
          <div className="text-center w-full">
            <h2 className="text-2xl font-bold text-white mb-6">{state.currentPrompt}</h2>
            <div className="grid gap-3">
              {state.answers.map((answer, i) => (
                <div key={answer.answerId} className="bg-white/5 backdrop-blur-sm rounded-2xl p-5 text-left border border-white/10">
                  <span className="text-indigo-400 font-bold mr-3 text-lg">{String.fromCharCode(65 + i)}.</span>
                  <span className="text-white text-lg">{answer.text}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3 mt-4">
              <Vote size={18} className="text-gray-500" />
              <p className="text-gray-500">{state.votedCount}/{state.totalPlayers} voted</p>
            </div>
            <div className="mt-4"><Timer /></div>
          </div>
        )}

        {/* REVEAL */}
        {phase.phaseType === BBPhase.REVEAL && state.revealData && (
          <div className="text-center w-full">
            <div className="flex items-center justify-center gap-3 mb-6">
              <Sparkles size={24} className="text-amber-400" />
              <h2 className="text-3xl font-bold text-white">The Truth Revealed</h2>
              <Sparkles size={24} className="text-amber-400" />
            </div>
            <div className="grid gap-3">
              {state.revealData.answers.map((answer) => (
                <div
                  key={answer.answerId}
                  className={`rounded-2xl p-5 text-left border ${
                    answer.isCorrect
                      ? 'bg-emerald-500/10 border-emerald-500/40'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-lg text-white">{answer.text}</span>
                      {answer.isCorrect && (
                        <span className="ml-3 text-emerald-400 text-sm font-medium">CORRECT ANSWER</span>
                      )}
                      {!answer.isCorrect && answer.submittedByPlayerName && (
                        <span className="ml-3 text-gray-600 text-sm">— {answer.submittedByPlayerName}</span>
                      )}
                    </div>
                  </div>
                  {answer.voterPlayerNames.length > 0 && (
                    <div className="text-sm text-gray-500 mt-2">
                      Voted by: {answer.voterPlayerNames.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4"><Timer /></div>
          </div>
        )}

        {/* SCORES */}
        {phase.phaseType === BBPhase.SCORES && (
          <div className="text-center w-full">
            <h2 className="text-3xl font-bold text-white mb-6">Scores</h2>
            <Scoreboard scores={scores} showRoundScore />
            <div className="mt-4"><Timer /></div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BBDisplay;
