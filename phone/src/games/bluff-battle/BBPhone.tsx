import { useState } from 'react';
import { useConnectionStore } from '../../store/connection';
import { useGameStore } from '../../store/game';
import type { PhaseState, BBPrivateState } from '@boredless/shared';
import { PhaseType, ClientMessageType, InputType, BB_MAX_ANSWER_LENGTH } from '@boredless/shared';

interface Props {
  phase: PhaseState;
  privateState: Record<string, unknown>;
}

export function BBPhone({ phase, privateState }: Props) {
  const state = privateState as unknown as BBPrivateState;
  const send = useConnectionStore((s) => s.send);
  const timerMs = useGameStore((s) => s.timerRemainingMs);
  const [answer, setAnswer] = useState('');

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const isUrgent = seconds !== null && seconds <= 5;

  const handleSubmit = () => {
    if (!answer.trim()) return;
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.TEXT,
      payload: { answer: answer.trim() },
    });
    setAnswer('');
  };

  const handleVote = (answerId: string) => {
    send({
      type: ClientMessageType.SUBMIT_INPUT,
      inputType: InputType.VOTE,
      payload: { answerId },
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col items-center min-h-dvh bg-gray-950 px-5 py-6 overflow-y-auto">
      {/* Timer */}
      {seconds !== null && (
        <div className={`text-6xl font-bold mb-5 ${isUrgent ? 'text-red-400' : 'text-white'}`}>
          {seconds}
        </div>
      )}

      {/* SUBMIT phase — awaiting answer */}
      {phase.phaseType === PhaseType.BB_SUBMIT && !state.hasSubmitted && (
        <div className="w-full flex flex-col items-center gap-4">
          <p className="text-indigo-400 text-2xl font-bold text-center leading-tight">
            {state.prompt}
          </p>
          <p className="text-gray-500 text-sm text-center">
            Write a fake answer that could fool others!
          </p>
          <textarea
            className="
              w-full min-h-[80px]
              bg-gray-800 rounded-xl
              text-white text-lg
              px-4 py-3
              border-2 border-gray-700 focus:border-indigo-500
              outline-none resize-none
            "
            value={answer}
            onChange={(e) => setAnswer(e.target.value.slice(0, BB_MAX_ANSWER_LENGTH))}
            onKeyDown={handleKeyDown}
            placeholder="Your fake answer..."
            rows={3}
          />
          <p className="text-gray-600 text-xs self-end">
            {answer.length}/{BB_MAX_ANSWER_LENGTH}
          </p>
          <button
            onClick={handleSubmit}
            disabled={!answer.trim()}
            className="
              w-full bg-indigo-600 hover:bg-indigo-500
              disabled:opacity-40 disabled:cursor-not-allowed
              text-white text-lg font-bold
              rounded-xl py-4
              min-h-[44px]
              transition-colors
            "
          >
            Submit Answer
          </button>
        </div>
      )}

      {/* SUBMIT phase — already submitted */}
      {phase.phaseType === PhaseType.BB_SUBMIT && state.hasSubmitted && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">✅</div>
          <h2 className="text-2xl font-bold text-white">Submitted!</h2>
          <p className="text-gray-400">Waiting for others...</p>
          {state.ownAnswer && (
            <p className="text-gray-500 text-sm italic mt-4">
              Your answer: "{state.ownAnswer}"
            </p>
          )}
        </div>
      )}

      {/* VOTING phase — choose an answer */}
      {phase.phaseType === PhaseType.BB_VOTING && !state.hasVoted && state.voteOptions && (
        <div className="w-full flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold text-white text-center mb-2">
            Which is the REAL answer?
          </h2>
          {state.voteOptions.map((option) => (
            <button
              key={option.answerId}
              onClick={() => handleVote(option.answerId)}
              className="
                w-full
                bg-gray-800 hover:bg-gray-700
                text-white text-lg text-left
                rounded-xl px-5 py-4
                border border-gray-700 hover:border-indigo-500
                min-h-[44px]
                transition-colors
              "
            >
              {option.text}
            </button>
          ))}
        </div>
      )}

      {/* VOTING phase — voted */}
      {phase.phaseType === PhaseType.BB_VOTING && state.hasVoted && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">🗳️</div>
          <h2 className="text-2xl font-bold text-white">Vote Cast!</h2>
          <p className="text-gray-400">Waiting for others...</p>
        </div>
      )}

      {/* REVEAL or SCORES phase */}
      {(phase.phaseType === PhaseType.BB_REVEAL || phase.phaseType === PhaseType.BB_SCORES) && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">📺</div>
          <h2 className="text-2xl font-bold text-white">Look at the big screen!</h2>
        </div>
      )}

      {/* INSTRUCTIONS phase */}
      {phase.phaseType === PhaseType.INSTRUCTIONS && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="text-6xl">🎭</div>
          <h2 className="text-2xl font-bold text-white">Bluff Battle</h2>
          <p className="text-gray-400">Get ready!</p>
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
