import { useState } from 'react';
import { useConnectionStore } from '../../store/connection';
import { useGameStore } from '../../store/game';
import type { PhaseState, BBPrivateState } from '@boredless/shared';
import { PhaseType, ClientMessageType, InputType, BB_MAX_ANSWER_LENGTH } from '@boredless/shared';
import { Send, Check, Vote, Monitor, Trophy, Theater } from 'lucide-react';
import { PoweredByLogo } from '../../components/PoweredByLogo';

/** Signature for the useGameEvent hook passed in from GameScreen */
type GameEventHook = (event: string, handler: (data: unknown) => void) => void;

interface Props {
  phase: PhaseState;
  privateState: Record<string, unknown>;
  /** Custom event listener — use to react to server events emitted via ctx.emitTo() */
  useGameEvent: GameEventHook;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BBPhone({ phase, privateState, useGameEvent: _useGameEvent }: Props) {
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
    <div className="flex flex-col items-center min-h-dvh bg-gray-950 px-6 py-8 overflow-y-auto relative">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/20 via-gray-950 to-gray-950" />

      <div className="relative z-10 w-full flex flex-col items-center">
        {/* Timer */}
        {seconds !== null && (
          <div className={`text-5xl font-bold tabular-nums mb-6 ${
            isUrgent ? 'text-red-400' : 'text-white/30'
          }`}>
            {seconds}
          </div>
        )}

        {/* SUBMIT — awaiting answer */}
        {phase.phaseType === PhaseType.BB_SUBMIT && !state.hasSubmitted && (
          <div className="w-full flex flex-col items-center gap-5">
            <p className="text-indigo-400 text-xl font-semibold text-center leading-snug">
              {state.prompt}
            </p>
            <p className="text-gray-600 text-sm text-center">
              Write a fake answer that could fool others
            </p>
            <textarea
              className="w-full min-h-[80px]
                bg-white/5 backdrop-blur-sm rounded-2xl
                text-white text-lg px-4 py-3
                border border-white/10 focus:border-indigo-500/50
                outline-none resize-none
                placeholder:text-gray-700
                transition-colors"
              value={answer}
              onChange={(e) => setAnswer(e.target.value.slice(0, BB_MAX_ANSWER_LENGTH))}
              onKeyDown={handleKeyDown}
              placeholder="Your fake answer..."
              rows={3}
            />
            <div className="w-full flex items-center justify-between">
              <span className="text-gray-700 text-xs">
                {answer.length}/{BB_MAX_ANSWER_LENGTH}
              </span>
              <button
                onClick={handleSubmit}
                disabled={!answer.trim()}
                className="flex items-center gap-2
                  bg-indigo-600 hover:bg-indigo-500
                  disabled:bg-white/5 disabled:text-gray-600
                  text-white font-semibold
                  rounded-xl px-6 py-3
                  min-h-[44px]
                  transition-all duration-200"
              >
                Submit
                <Send size={16} />
              </button>
            </div>
          </div>
        )}

        {/* SUBMIT — already submitted */}
        {phase.phaseType === PhaseType.BB_SUBMIT && state.hasSubmitted && (
          <div className="flex flex-col items-center gap-4 text-center mt-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
              <Check size={32} className="text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Submitted</h2>
            <p className="text-gray-500">Waiting for others...</p>
            {state.ownAnswer && (
              <div className="mt-4 px-5 py-3 bg-white/5 rounded-xl border border-white/10">
                <p className="text-gray-400 text-sm italic">"{state.ownAnswer}"</p>
              </div>
            )}
          </div>
        )}

        {/* VOTING — choose an answer */}
        {phase.phaseType === PhaseType.BB_VOTING && !state.hasVoted && state.voteOptions && (
          <div className="w-full flex flex-col items-center gap-4">
            <h2 className="text-xl font-bold text-white text-center mb-2">
              Which is the real answer?
            </h2>
            {state.voteOptions.map((option) => (
              <button
                key={option.answerId}
                onClick={() => handleVote(option.answerId)}
                className="w-full
                  bg-white/[0.03] hover:bg-white/[0.06] active:bg-white/[0.08]
                  text-white text-lg text-left
                  rounded-2xl px-5 py-4
                  border border-white/10 hover:border-indigo-500/40
                  min-h-[44px]
                  transition-all duration-200"
              >
                {option.text}
              </button>
            ))}
          </div>
        )}

        {/* VOTING — voted */}
        {phase.phaseType === PhaseType.BB_VOTING && state.hasVoted && (
          <div className="flex flex-col items-center gap-4 text-center mt-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center">
              <Vote size={32} className="text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Vote Cast</h2>
            <p className="text-gray-500">Waiting for others...</p>
          </div>
        )}

        {/* REVEAL or SCORES */}
        {(phase.phaseType === PhaseType.BB_REVEAL || phase.phaseType === PhaseType.BB_SCORES) && (
          <div className="flex flex-col items-center gap-4 text-center mt-8">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/15 flex items-center justify-center">
              <Monitor size={32} className="text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Look at the TV!</h2>
            <p className="text-gray-500">Results are being revealed</p>
          </div>
        )}

        {/* INSTRUCTIONS */}
        {phase.phaseType === PhaseType.INSTRUCTIONS && (
          <div className="flex flex-col items-center gap-4 text-center mt-8">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center">
              <Theater size={32} className="text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Bluff Battle</h2>
            <p className="text-gray-500">Get ready!</p>
          </div>
        )}

        {/* GAME OVER */}
        {phase.phaseType === PhaseType.GAME_OVER && (
          <div className="flex flex-col items-center gap-4 text-center mt-8">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/15 flex items-center justify-center">
              <Trophy size={32} className="text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Game Over</h2>
            <p className="text-gray-500">Check the TV for final results</p>
          </div>
        )}
      </div>
      <div className="fixed bottom-0 inset-x-0">
        <PoweredByLogo />
      </div>
    </div>
  );
}
