import { useState } from 'react';
import type { BBPrivateState } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { BB_MAX_ANSWER_LENGTH } from '../constants.js';
import { BBPhase } from '../phases.js';
import { Send, Check, Vote, Monitor, Trophy, Theater } from 'lucide-react';
import { PoweredByLogo } from '@phone/components/PoweredByLogo';
import type { PhoneProps } from '@phone/games/types';

const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Thin timer bar — matches TV
function TimerBar({ seconds, totalSeconds }: { seconds: number; totalSeconds: number }) {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (seconds / totalSeconds) * 100)) : 0;
  const isUrgent = seconds <= 5;
  return (
    <div className="w-full h-[3px] bg-white/[0.06] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(129,140,248,0.6)' }}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
/**
 * Map declarative engine privateState to BBPrivateState.
 * The declarative module sends { globals, players, phase, input } — we need to
 * extract typed fields and parse serialized JSON.
 */
function extractBBPrivate(raw: Record<string, unknown>, myPlayerId: string): BBPrivateState {
  const g = (raw.globals ?? raw) as Record<string, unknown>;
  const players = (raw.players ?? {}) as Record<string, Record<string, unknown>>;
  const me = players[myPlayerId] ?? {};
  const input = (raw.input ?? {}) as Record<string, unknown>;

  const hasSubmitted = Boolean(me['has_submitted'] ?? input['hasSubmitted']);
  const hasVoted = Boolean(me['has_voted']);
  const ownAnswer = (me['submission'] as string) ?? null;

  let voteOptions: BBPrivateState['voteOptions'] = null;
  if (typeof g['answers_json'] === 'string') {
    try {
      const allAnswers = JSON.parse(g['answers_json']) as { answers: Array<{ answerId: string; text: string; submittedByPlayerId: string | null; isCorrect: boolean }> };
      // Filter out the player's own answer — they can't vote for their own bluff
      voteOptions = (allAnswers.answers ?? allAnswers).filter(
        (a: { submittedByPlayerId: string | null }) => a.submittedByPlayerId !== myPlayerId
      ).map((a: { answerId: string; text: string }) => ({
        answerId: a.answerId,
        text: a.text,
      }));
    } catch { /* ignore */ }
  }

  return {
    gameId: 'bluff_battle',
    prompt: (g['current_question'] as string) ?? null,
    hasSubmitted,
    hasVoted,
    ownAnswer,
    voteOptions,
  };
}

export function BBPhone({ phase, privateState, timerMs, submitInput, myPlayer, useGameEvent: _useGameEvent }: PhoneProps) {
  const state = extractBBPrivate(privateState, myPlayer?.playerId ?? '');
  const [answer, setAnswer] = useState('');
  const [selectedVote, setSelectedVote] = useState<string | null>(null);

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 60;
  const isUrgent = seconds !== null && seconds <= 5;
  const playerColor = myPlayer?.playerColor ?? '#6366f1';

  const handleSubmit = () => {
    if (!answer.trim()) return;
    submitInput('text', { answer: answer.trim() });
    setAnswer('');
  };

  const handleVote = (answerId: string) => {
    setSelectedVote(answerId);
    submitInput('vote', { answerId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 relative overflow-y-auto">
      {/* Subtle ambient tint from player color */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 120% 40% at 50% 0%, ${playerColor}15 0%, transparent 100%)` }} />

      {/* Timer bar — top edge */}
      {seconds !== null && (
        <div className="relative z-20">
          <TimerBar seconds={seconds} totalSeconds={totalSeconds} />
        </div>
      )}

      {/* Header — compact */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: playerColor }} />
          <span className="text-white/40 text-sm font-medium">{myPlayer?.playerName ?? ''}</span>
        </div>
        <div className="flex items-center gap-3">
          {seconds !== null && (
            <span className={`text-sm font-semibold tabular-nums transition-colors ${isUrgent ? 'text-red-400' : 'text-white/25'}`}>
              {seconds}s
            </span>
          )}
          <span className="text-white/15 text-xs">Round {phase.roundNumber}/{phase.totalRounds}</span>
        </div>
      </header>

      {/* Main content — good side margins, flex-1 to fill */}
      <div className="relative z-10 flex flex-col flex-1 px-6 pb-20">

        {/* ── SUBMIT: writing phase ── */}
        {phase.phaseType === BBPhase.SUBMIT && !state.hasSubmitted && (
          <div className="flex flex-col flex-1 gap-6">
            <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
              <p className="text-white/25 text-xs font-medium tracking-widest uppercase mb-3">Your bluff</p>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-snug tracking-tight mb-3">
                {state.prompt}
              </h1>
              <p className="text-white/30 text-sm">Write a convincing fake answer</p>
            </div>

            <div className="flex flex-col gap-3">
              <textarea
                className={`w-full min-h-[100px] bg-white/[0.04] text-white text-base px-4 py-4 rounded-2xl border outline-none resize-none placeholder:text-white/20 transition-colors ${
                  isUrgent ? 'border-red-500/40' : 'border-white/[0.08] focus:border-white/20'
                }`}
                value={answer}
                onChange={(e) => setAnswer(e.target.value.slice(0, BB_MAX_ANSWER_LENGTH))}
                onKeyDown={handleKeyDown}
                placeholder="Type your fake answer…"
                rows={3}
                autoFocus
              />
              <div className="flex items-center justify-between">
                <span className={`text-xs tabular-nums ${answer.length >= BB_MAX_ANSWER_LENGTH - 10 ? 'text-amber-500/70' : 'text-white/15'}`}>
                  {answer.length}/{BB_MAX_ANSWER_LENGTH}
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!answer.trim()}
                  className="flex items-center gap-2 text-sm font-semibold text-white px-6 py-3 rounded-xl transition-all active:scale-[0.97] disabled:opacity-25"
                  style={{ backgroundColor: answer.trim() ? playerColor : 'rgba(255,255,255,0.06)' }}
                >
                  Submit <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SUBMIT: already submitted ── */}
        {phase.phaseType === BBPhase.SUBMIT && state.hasSubmitted && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5 px-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Check size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Submitted</p>
              <p className="text-white/30 text-sm">Waiting for others…</p>
            </div>
            {state.ownAnswer && (
              <div className="w-full mt-2 px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <p className="text-white/15 text-xs mb-1.5">Your answer</p>
                <p className="text-white/50 text-sm italic">"{state.ownAnswer}"</p>
              </div>
            )}
          </div>
        )}

        {/* ── VOTING: choose ── */}
        {phase.phaseType === BBPhase.VOTING && !state.hasVoted && state.voteOptions && (
          <div className="flex flex-col flex-1 pt-6 gap-5">
            <div className="mb-1 text-center">
              <p className="text-white/25 text-xs font-medium tracking-widest uppercase mb-2">Vote for the real answer</p>
              <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">Which one is genuine?</h2>
            </div>

            <div className="flex flex-col gap-3">
              {state.voteOptions.map((option, i) => {
                const isSelected = selectedVote === option.answerId;
                return (
                  <button
                    key={option.answerId}
                    onClick={() => handleVote(option.answerId)}
                    disabled={!!selectedVote}
                    className={`w-full flex items-center gap-4 text-left rounded-2xl px-5 py-4 border transition-all active:scale-[0.98] disabled:pointer-events-none ${
                      isSelected
                        ? 'bg-white/[0.08] border-white/20'
                        : 'bg-white/[0.03] border-white/[0.07]'
                    }`}
                  >
                    <span
                      className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-colors"
                      style={{
                        backgroundColor: isSelected ? `${playerColor}33` : 'rgba(255,255,255,0.06)',
                        color: isSelected ? playerColor : 'rgba(255,255,255,0.4)',
                        border: isSelected ? `1px solid ${playerColor}55` : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      {ANSWER_LETTERS[i]}
                    </span>
                    <span className={`text-base leading-snug flex-1 ${isSelected ? 'text-white' : 'text-white/70'}`}>
                      {option.text}
                    </span>
                    {isSelected && <Check size={16} className="flex-shrink-0" style={{ color: playerColor }} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── VOTING: voted ── */}
        {phase.phaseType === BBPhase.VOTING && state.hasVoted && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Vote size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Vote cast</p>
              <p className="text-white/30 text-sm">Waiting for others…</p>
            </div>
          </div>
        )}

        {/* ── REVEAL / SCORES: watch TV ── */}
        {(phase.phaseType === BBPhase.REVEAL || phase.phaseType === BBPhase.SCORES) && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Monitor size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Look at the TV</p>
              <p className="text-white/30 text-sm">
                {phase.phaseType === BBPhase.REVEAL ? 'Results are being revealed' : 'Scores are up'}
              </p>
            </div>
          </div>
        )}

        {/* ── INSTRUCTIONS ── */}
        {phase.phaseType === PhaseType.INSTRUCTIONS && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Theater size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Bluff Battle</h2>
              <p className="text-white/30 text-sm max-w-xs leading-relaxed">
                Write fake answers. Fool your friends. Vote for the truth.
              </p>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {phase.phaseType === PhaseType.GAME_OVER && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <Trophy size={24} className="text-white/40" />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Game over</p>
              <p className="text-white/30 text-sm">Check the TV for final results</p>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 z-20">
        <PoweredByLogo />
      </div>
    </div>
  );
}

export default BBPhone;
