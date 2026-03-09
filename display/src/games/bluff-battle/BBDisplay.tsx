import type { PhaseState, ScoreEntry, BBPublicState } from '@boredless/shared';
import { PhaseType } from '@boredless/shared';
import { Timer } from '../../components/Timer';
import { Scoreboard } from '../../components/Scoreboard';

interface BBDisplayProps {
  phase: PhaseState;
  publicState: Record<string, unknown>;
  scores: ScoreEntry[];
}

export function BBDisplay({ phase, publicState, scores }: BBDisplayProps) {
  const state = publicState as unknown as BBPublicState;

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 gap-6">
      {/* Round indicator */}
      <div className="text-gray-400 text-lg">
        Round {phase.roundNumber} of {phase.totalRounds}
      </div>

      {/* Phase-specific content */}
      {phase.phaseType === PhaseType.INSTRUCTIONS && (
        <div className="text-center">
          <h1 className="text-5xl font-bold text-indigo-400 mb-4">🎭 Bluff Battle</h1>
          <p className="text-xl text-gray-300">Submit fake answers. Fool your friends. Spot the truth!</p>
          <div className="mt-6"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_PROMPT && (
        <div className="text-center">
          <h2 className="text-4xl font-bold text-white">{state.currentPrompt}</h2>
          <p className="text-gray-400 mt-4">Check your phones — submit your best fake answer!</p>
          <div className="mt-6"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_SUBMIT && (
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-4">{state.currentPrompt}</h2>
          <p className="text-2xl text-indigo-400">
            {state.submittedCount}/{state.totalPlayers} submitted
          </p>
          <div className="mt-6"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_VOTING && (
        <div className="text-center w-full max-w-3xl">
          <h2 className="text-2xl font-bold text-white mb-6">{state.currentPrompt}</h2>
          <div className="grid gap-3">
            {state.answers.map((answer, i) => (
              <div key={answer.answerId} className="bg-gray-800 rounded-xl p-4 text-left">
                <span className="text-indigo-400 font-bold mr-3">{String.fromCharCode(65 + i)}.</span>
                <span className="text-white text-lg">{answer.text}</span>
              </div>
            ))}
          </div>
          <p className="text-gray-400 mt-4">{state.votedCount}/{state.totalPlayers} voted</p>
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_REVEAL && state.revealData && (
        <div className="text-center w-full max-w-3xl">
          <h2 className="text-2xl font-bold text-yellow-400 mb-6">The Truth Is Revealed!</h2>
          <div className="grid gap-3">
            {state.revealData.answers.map((answer) => (
              <div
                key={answer.answerId}
                className={`rounded-xl p-4 text-left ${
                  answer.isCorrect
                    ? 'bg-green-900/50 border-2 border-green-500'
                    : 'bg-gray-800'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-lg text-white">{answer.text}</span>
                    {answer.isCorrect && (
                      <span className="ml-2 text-green-400 text-sm">✓ CORRECT ANSWER</span>
                    )}
                    {!answer.isCorrect && answer.submittedByPlayerName && (
                      <span className="ml-2 text-gray-500 text-sm">— {answer.submittedByPlayerName}</span>
                    )}
                  </div>
                </div>
                {answer.voterPlayerNames.length > 0 && (
                  <div className="text-sm text-gray-400 mt-1">
                    Voted by: {answer.voterPlayerNames.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4"><Timer /></div>
        </div>
      )}

      {phase.phaseType === PhaseType.BB_SCORES && (
        <div className="text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Scores</h2>
          <Scoreboard scores={scores} showRoundScore />
          <div className="mt-4"><Timer /></div>
        </div>
      )}
    </div>
  );
}
