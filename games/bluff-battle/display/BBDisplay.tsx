import type { BBPublicState, BBRevealAnswer } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { BBPhase } from '../phases.js';
import { Theater, Send, Vote, Check, X, Trophy } from 'lucide-react';
import type { DisplayProps } from '@display/games/types';
import type { ScoreEntry } from '@boredless/shared';

const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Single timer bar at top of screen — thin, elegant
function TimerBar({ seconds, totalSeconds }: { seconds: number; totalSeconds: number }) {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (seconds / totalSeconds) * 100)) : 0;
  const isUrgent = seconds <= 5;
  return (
    <div className="w-full h-1 bg-white/[0.04] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(129,140,248,0.5)' }}
      />
    </div>
  );
}

// Progress indicator for submissions/votes
function ProgressBar({ icon: Icon, count, total, label }: { icon: typeof Send; count: number; total: number; label: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-md">
      <div className="flex items-center gap-2 text-white/35">
        <Icon size={14} />
        <span className="text-sm tabular-nums">{count} of {total} {label}</span>
      </div>
      <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, backgroundColor: 'rgba(129,140,248,0.45)' }} />
      </div>
    </div>
  );
}

// Score rows
function ScoreList({ scores, showRoundScore }: { scores: ScoreEntry[]; showRoundScore?: boolean }) {
  return (
    <div className="w-full flex flex-col divide-y divide-white/[0.04]">
      {scores.map((entry, index) => (
        <div key={entry.playerId} className="flex items-center justify-center gap-4 py-5">
          <span className="w-6 text-right text-white/20 text-lg font-medium tabular-nums">{index + 1}</span>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0" style={{ backgroundColor: entry.playerColor }}>
            {entry.playerName.charAt(0).toUpperCase()}
          </div>
          <span className="text-white/80 text-lg font-medium w-32 truncate">{entry.playerName}</span>
          {showRoundScore && entry.roundScore > 0 && (
            <span className="text-emerald-400/50 text-sm font-medium tabular-nums">+{entry.roundScore}</span>
          )}
          <span className="text-white text-xl font-semibold tabular-nums">{entry.score.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
/**
 * Map declarative engine publicState (globals/players shape) to BBPublicState.
 * The declarative module sends { globals, players, phase } — we need to
 * extract typed fields and parse serialized JSON.
 */
function extractBBState(raw: Record<string, unknown>): BBPublicState {
  const g = (raw.globals ?? raw) as Record<string, unknown>;
  const players = (raw.players ?? {}) as Record<string, Record<string, unknown>>;
  const playerList = Object.values(players);
  const totalPlayers = playerList.length;
  // Compute counts from per-player state (more reliable than globals counter)
  const submittedCount = typeof g['submitted_count'] === 'number' && g['submitted_count'] > 0
    ? g['submitted_count']
    : playerList.filter(p => p['has_submitted'] || p['submission']).length;
  const votedCount = typeof g['voted_count'] === 'number' && g['voted_count'] > 0
    ? g['voted_count']
    : playerList.filter(p => p['has_voted']).length;

  let answers: BBPublicState['answers'] = [];
  if (typeof g['answers_json'] === 'string') {
    try { answers = JSON.parse(g['answers_json']); } catch { /* ignore */ }
  }

  let revealData: BBPublicState['revealData'] = null;
  if (typeof g['reveal_json'] === 'string') {
    try { revealData = JSON.parse(g['reveal_json']); } catch { /* ignore */ }
  }

  return {
    gameId: 'bluff_battle',
    currentPrompt: (g['current_question'] as string) ?? null,
    roundNumber: typeof g['round'] === 'number' ? g['round'] : 0,
    totalRounds: typeof g['total_rounds'] === 'number' ? g['total_rounds'] : 3,
    answers,
    submittedCount,
    totalPlayers,
    votedCount,
    revealData,
  };
}

export function BBDisplay({ phase, publicState, scores, timerMs, useGameEvent: _useGameEvent }: DisplayProps) {
  const state = extractBBState(publicState);
  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 60;
  const isUrgent = seconds !== null && seconds <= 5;

  return (
    <div className="flex flex-col h-full w-full bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/15 via-gray-950 to-gray-950 pointer-events-none" />

      {/* Timer bar at very top — the ONLY timer */}
      {seconds !== null && (
        <div className="relative z-20 flex-shrink-0">
          <TimerBar seconds={seconds} totalSeconds={totalSeconds} />
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-12 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Theater size={18} className="text-white/15" />
          <span className="text-white/25 text-sm font-medium tracking-wider">Bluff Battle</span>
        </div>
        <span className="absolute left-1/2 -translate-x-1/2 text-white/20 text-sm font-medium tracking-widest">
          Round {phase.roundNumber} of {phase.totalRounds}
        </span>
        {seconds !== null ? (
          <span className={`text-base font-semibold tabular-nums transition-colors ${isUrgent ? 'text-red-400' : 'text-white/20'}`}>
            {seconds}s
          </span>
        ) : <div className="w-8" />}
      </header>

      {/* Main — centered with generous side margins */}
      <main className="relative z-10 flex flex-col flex-1 items-center justify-center px-16 lg:px-24 xl:px-32 pb-12 overflow-hidden">

        {/* DEBUG — remove after fixing */}
        <div className="absolute top-2 right-2 z-50 bg-red-900/80 text-white text-xs px-2 py-1 rounded font-mono">
          phase: {phase.phaseType} | prompt: {state.currentPrompt ? 'yes' : 'null'} | answers: {state.answers?.length ?? 0}
        </div>

        {/* INSTRUCTIONS */}
        {phase.phaseType === PhaseType.INSTRUCTIONS && (
          <div className="flex flex-col items-center gap-10 text-center max-w-4xl w-full">
            <div>
              <h1 className="text-7xl font-bold text-white tracking-tight leading-none mb-5">Bluff Battle</h1>
              <p className="text-white/35 text-xl font-light">Write fake answers. Fool your friends. Spot the truth.</p>
            </div>
            <div className="grid grid-cols-3 gap-6 w-full max-w-3xl">
              {[
                { step: '01', label: 'Write a bluff', detail: 'Invent a convincing fake answer' },
                { step: '02', label: 'Vote for truth', detail: 'Pick the real answer from the lineup' },
                { step: '03', label: 'Score points', detail: '1,000 for truth · 500 per player fooled' },
              ].map((item) => (
                <div key={item.step} className="px-6 py-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-left">
                  <p className="text-white/10 text-xs font-medium tracking-widest mb-3">{item.step}</p>
                  <p className="text-white/60 font-medium mb-1">{item.label}</p>
                  <p className="text-white/25 text-sm leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUBMIT */}
        {phase.phaseType === BBPhase.SUBMIT && (
          <div className="flex flex-col items-center gap-10 text-center max-w-4xl w-full">
            <p className="text-white/20 text-sm font-medium tracking-widest uppercase">Submit your bluff</p>
            <h2 className="text-6xl font-bold text-white leading-tight tracking-tight">{state.currentPrompt}</h2>
            <ProgressBar icon={Send} count={state.submittedCount} total={state.totalPlayers} label="submitted" />
          </div>
        )}

        {/* VOTING */}
        {phase.phaseType === BBPhase.VOTING && (
          <div className="flex flex-col items-center gap-8 w-full max-w-5xl">
            <div className="text-center mb-2">
              <p className="text-white/20 text-sm font-medium tracking-widest uppercase mb-3">Which is real?</p>
              <h2 className="text-4xl font-bold text-white leading-tight tracking-tight">{state.currentPrompt}</h2>
            </div>
            <div className="w-full flex flex-wrap justify-center gap-4">
              {state.answers.map((answer, i) => (
                <div key={answer.answerId} className="flex items-start gap-4 px-6 py-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] w-full max-w-lg">
                  <span className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white/40 bg-white/[0.06] border border-white/[0.08]">
                    {ANSWER_LETTERS[i]}
                  </span>
                  <span className="text-white/80 text-xl font-medium leading-snug pt-0.5">{answer.text}</span>
                </div>
              ))}
            </div>
            <ProgressBar icon={Vote} count={state.votedCount} total={state.totalPlayers} label="voted" />
          </div>
        )}

        {/* REVEAL */}
        {phase.phaseType === BBPhase.REVEAL && state.revealData && (
          <div className="flex flex-col items-center gap-8 w-full max-w-5xl">
            <div className="text-center mb-2">
              <p className="text-white/20 text-sm font-medium tracking-widest uppercase mb-3">The truth</p>
              <h2 className="text-4xl font-bold text-white tracking-tight">{state.currentPrompt}</h2>
            </div>
            <div className="w-full flex flex-wrap justify-center gap-4">
              {state.revealData.answers.map((answer: BBRevealAnswer, i: number) => {
                const correct = answer.isCorrect;
                return (
                  <div key={answer.answerId} className={`flex flex-col rounded-2xl px-6 py-5 border transition-all duration-500 ${correct ? 'bg-emerald-500/[0.06] border-emerald-500/25' : 'bg-white/[0.02] border-white/[0.06]'}`}>
                    <div className="flex items-start gap-4">
                      <span className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${correct ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-white/[0.05] text-white/30 border border-white/[0.08]'}`}>
                        {ANSWER_LETTERS[i]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xl font-medium leading-snug ${correct ? 'text-emerald-300' : 'text-white/70'}`}>{answer.text}</p>
                        {correct
                          ? <p className="text-emerald-500/50 text-xs font-medium mt-1.5 tracking-wide uppercase">Correct answer</p>
                          : answer.submittedByPlayerName
                            ? <p className="text-white/20 text-xs mt-1.5">Written by {answer.submittedByPlayerName}</p>
                            : null}
                      </div>
                      <div className="flex-shrink-0 mt-0.5">
                        {correct
                          ? <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center"><Check size={15} className="text-emerald-400" /></div>
                          : <div className="w-8 h-8 rounded-full bg-white/[0.04] flex items-center justify-center"><X size={15} className="text-white/15" /></div>}
                      </div>
                    </div>
                    {answer.voterPlayerNames.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center gap-2 flex-wrap">
                        <span className="text-white/15 text-xs">{correct ? 'Found by' : 'Fooled'}</span>
                        {answer.voterPlayerNames.map((name: string) => (
                          <span key={name} className={`text-xs px-2.5 py-0.5 rounded-full ${correct ? 'bg-emerald-500/10 text-emerald-400/60' : 'bg-white/[0.04] text-white/35'}`}>{name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SCORES */}
        {phase.phaseType === BBPhase.SCORES && (
          <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
            <div className="text-center">
              <p className="text-white/20 text-sm font-medium tracking-widest uppercase mb-2">After Round {phase.roundNumber}</p>
              <h2 className="text-5xl font-bold text-white tracking-tight">Standings</h2>
            </div>
            <ScoreList scores={scores} showRoundScore />
          </div>
        )}

        {/* GAME OVER */}
        {phase.phaseType === PhaseType.GAME_OVER && (
          <div className="flex flex-col items-center gap-10 w-full max-w-2xl">
            <div className="text-center">
              <p className="text-white/20 text-sm font-medium tracking-widest uppercase mb-4">Final</p>
              <h1 className="text-7xl font-bold text-white tracking-tight mb-4">Game Over</h1>
              {scores[0] && (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold" style={{ backgroundColor: scores[0].playerColor }}>
                    {scores[0].playerName.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-white/50 text-2xl font-medium">{scores[0].playerName} <span className="text-white/25 font-normal">wins</span></p>
                  <Trophy size={20} className="text-white/25" />
                </div>
              )}
            </div>
            <ScoreList scores={scores} />
          </div>
        )}
      </main>
    </div>
  );
}

export default BBDisplay;
