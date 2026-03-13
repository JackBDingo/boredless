import type { CAHPublicState, CAHAnonymousSubmission } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { CAHPhase } from '../phases.js';
import { Layers, Trophy, Star } from 'lucide-react';
import type { DisplayProps } from '@display/games/types';
import type { ScoreEntry } from '@boredless/shared';

const SUBMISSION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/* Replace _ blanks with styled underlines or filled answers */
function BlackCardText({ text, answers }: { text: string; answers?: string[] }) {
  const parts = text.split('_');
  if (parts.length === 1) return <span>{text}</span>;
  return (
    <span>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            answers && answers[i] ? (
              <span className="border-b-2 border-white/60 px-1 font-black italic">{answers[i]}</span>
            ) : (
              <span className="inline-block border-b-2 border-white/40 w-28 mx-1 align-middle" />
            )
          )}
        </span>
      ))}
    </span>
  );
}

/* Large black prompt card for TV */
function BlackCard({ text, pick, size = 'large' }: { text: string; pick: number; size?: 'large' | 'medium' }) {
  const isLarge = size === 'large';
  return (
    <div className={`bg-black rounded-3xl shadow-2xl border border-white/10 flex flex-col ${
      isLarge ? 'px-10 py-8 max-w-xl w-full' : 'px-8 py-6 max-w-md w-full'
    }`}>
      {pick > 1 && (
        <div className="flex items-center gap-1.5 mb-3">
          {Array.from({ length: pick }).map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-white/40" />
          ))}
          <span className="text-white/30 text-xs ml-1 font-medium">Pick {pick}</span>
        </div>
      )}
      <p className={`text-white font-black leading-snug flex-1 ${isLarge ? 'text-3xl' : 'text-2xl'}`}>
        <BlackCardText text={text} />
      </p>
      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-white/[0.06]">
        <Layers size={12} className="text-white/15" />
        <span className="text-white/10 text-xs font-medium tracking-wider">Cards Against Humanity</span>
      </div>
    </div>
  );
}

/* Uniform white answer card for TV */
function WhiteCard({ text, letter, highlight, playerName }: {
  text: string;
  letter?: string;
  highlight?: boolean;
  playerName?: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl shadow-lg border-2 flex flex-col transition-all duration-500 ${
        highlight
          ? 'border-yellow-400 ring-2 ring-yellow-400/30 scale-[1.03]'
          : 'border-gray-100'
      }`}
      style={{ width: 200, height: 200 }}
    >
      <div className="flex-1 p-5 flex flex-col">
        {letter && (
          <span className={`text-xs font-black tracking-widest mb-2 ${
            highlight ? 'text-yellow-500' : 'text-gray-300'
          }`}>{letter}</span>
        )}
        <p className="text-gray-900 text-base font-bold leading-snug flex-1">{text}</p>
      </div>
      {playerName && (
        <div className={`px-5 pb-3 ${highlight ? 'text-yellow-600/70' : 'text-gray-300'}`}>
          <p className="text-xs font-semibold truncate">
            {highlight && <Star size={10} className="inline mr-1 text-yellow-500 -mt-0.5" />}
            {playerName}
          </p>
        </div>
      )}
    </div>
  );
}

/* Multi-card submission wrapper */
function SubmissionGroup({
  submission,
  letter,
  highlight,
  playerName,
}: {
  submission: CAHAnonymousSubmission;
  letter: string;
  highlight?: boolean;
  playerName?: string;
}) {
  if (submission.cards.length === 1) {
    return (
      <WhiteCard
        text={submission.cards[0].text}
        letter={letter}
        highlight={highlight}
        playerName={playerName}
      />
    );
  }
  // Multi-card: card-shaped stack
  return (
    <div className={`flex flex-col gap-2 p-4 rounded-2xl border-2 transition-all duration-500 ${
      highlight ? 'border-yellow-400/40 bg-yellow-400/5 scale-[1.03]' : 'border-white/[0.06] bg-white/[0.02]'
    }`} style={{ width: 220, minHeight: 200 }}>
      <span className={`text-xs font-black tracking-widest ${
        highlight ? 'text-yellow-400' : 'text-white/20'
      }`}>{letter}</span>
      <div className="flex-1 flex flex-col gap-2">
        {submission.cards.map((card, i) => (
          <div key={i} className="bg-white rounded-xl px-4 py-3 shadow-md">
            <p className="text-gray-900 text-sm font-bold leading-snug">{card.text}</p>
          </div>
        ))}
      </div>
      {playerName && (
        <p className={`text-xs font-semibold ${highlight ? 'text-yellow-400/70' : 'text-white/20'}`}>
          {highlight && <Star size={10} className="inline mr-1 text-yellow-400" />}
          {playerName}
        </p>
      )}
    </div>
  );
}

function TimerBar({ seconds, totalSeconds }: { seconds: number; totalSeconds: number }) {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (seconds / totalSeconds) * 100)) : 0;
  const isUrgent = seconds <= 5;
  return (
    <div className="w-full h-1 bg-white/[0.04] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(255,255,255,0.25)' }}
      />
    </div>
  );
}

function ScoreList({ scores, showRoundScore }: { scores: ScoreEntry[]; showRoundScore?: boolean }) {
  return (
    <div className="w-full flex flex-col gap-3 max-w-lg mx-auto">
      {scores.map((entry, index) => {
        const isLeader = index === 0 && entry.score > 0;
        return (
          <div
            key={entry.playerId}
            className={`flex items-center gap-4 px-6 py-4 rounded-2xl border-2 transition-all ${
              isLeader
                ? 'bg-white border-white shadow-lg'
                : 'bg-white/[0.04] border-white/[0.06]'
            }`}
          >
            <span className={`w-8 text-center text-2xl font-black tabular-nums ${
              isLeader ? 'text-gray-900' : 'text-white/20'
            }`}>{index + 1}</span>
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: entry.playerColor }}
            >
              {entry.playerName.charAt(0).toUpperCase()}
            </div>
            <span className={`text-lg font-bold flex-1 truncate ${
              isLeader ? 'text-gray-900' : 'text-white/80'
            }`}>{entry.playerName}</span>
            <div className="flex items-baseline gap-2">
              {showRoundScore && entry.roundScore > 0 && (
                <span className={`text-sm font-bold tabular-nums ${
                  isLeader ? 'text-yellow-600/70' : 'text-yellow-400/50'
                }`}>+{entry.roundScore}</span>
              )}
              <span className={`text-2xl font-black tabular-nums ${
                isLeader ? 'text-gray-900' : 'text-white'
              }`}>{entry.score.toLocaleString()}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CAHDisplay({ phase, publicState, scores, timerMs, useGameEvent: _useGameEvent }: DisplayProps) {
  const state = publicState as unknown as CAHPublicState;
  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 60;
  const isUrgent = seconds !== null && seconds <= 5;

  return (
    <div className="flex flex-col h-full w-full bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900/30 via-gray-950 to-gray-950 pointer-events-none" />

      {seconds !== null && (
        <div className="relative z-20 flex-shrink-0">
          <TimerBar seconds={seconds} totalSeconds={totalSeconds} />
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-12 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Layers size={18} className="text-white/15" />
          <span className="text-white/20 text-sm font-medium tracking-wider">Cards Against Humanity</span>
        </div>
        <span className="absolute left-1/2 -translate-x-1/2 text-white/20 text-sm font-medium tracking-widest">
          Round {phase.roundNumber} / {phase.totalRounds}
        </span>
        {seconds !== null ? (
          <span className={`text-base font-bold tabular-nums transition-colors ${isUrgent ? 'text-red-400' : 'text-white/20'}`}>
            {seconds}s
          </span>
        ) : <div className="w-8" />}
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-col flex-1 items-center justify-center px-16 lg:px-24 xl:px-32 pb-12 overflow-hidden">

        {/* DEAL */}
        {phase.phaseType === CAHPhase.DEAL && (
          <div className="flex flex-col items-center gap-8">
            <div className="flex -space-x-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-20 h-28 bg-black rounded-2xl border border-white/10 shadow-xl"
                  style={{ transform: `rotate(${(i - 2.5) * 5}deg)`, zIndex: i }}
                />
              ))}
            </div>
            <div className="text-center">
              <p className="text-white/40 text-xl font-medium">Dealing cards…</p>
              {state.czarPlayerName && (
                <p className="text-white/20 text-sm mt-2">
                  Card Czar: <span className="text-white/40 font-bold">{state.czarPlayerName}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* PROMPT */}
        {phase.phaseType === CAHPhase.PROMPT && state.currentBlackCard && (
          <div className="flex flex-col items-center gap-10 w-full max-w-4xl">
            <p className="text-white/20 text-sm font-medium tracking-widest uppercase">
              🃏 Card Czar: <span className="text-white/40 font-bold">{state.czarPlayerName}</span>
            </p>
            <BlackCard text={state.currentBlackCard.text} pick={state.currentBlackCard.pick} />
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-2">
                {Array.from({ length: state.totalNonCzarPlayers }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                      i < state.submittedCount ? 'bg-white/50 scale-100' : 'bg-white/10 scale-90'
                    }`}
                  />
                ))}
              </div>
              <p className="text-white/25 text-sm tabular-nums">
                {state.submittedCount} of {state.totalNonCzarPlayers} submitted
              </p>
            </div>
          </div>
        )}

        {/* READING */}
        {phase.phaseType === CAHPhase.READING && state.currentBlackCard && (
          <div className="flex flex-col items-center gap-10 w-full max-w-3xl">
            <p className="text-white/25 text-sm font-medium tracking-widest uppercase">
              {state.czarPlayerName} is choosing…
            </p>
            <BlackCard text={state.currentBlackCard.text} pick={state.currentBlackCard.pick} size="medium" />
            <div className="flex flex-wrap justify-center gap-5 max-w-2xl">
              {state.submissions.map((sub: CAHAnonymousSubmission, i: number) => (
                <SubmissionGroup
                  key={sub.submissionId}
                  submission={sub}
                  letter={SUBMISSION_LETTERS[i] ?? String(i + 1)}
                />
              ))}
            </div>
          </div>
        )}

        {/* REVEAL */}
        {phase.phaseType === CAHPhase.REVEAL && state.currentBlackCard && (
          <div className="flex flex-col items-center gap-10 w-full max-w-3xl">
            {state.winner && (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <Star size={18} className="text-yellow-400" />
                  <span className="text-yellow-400/80 text-sm font-bold tracking-widest uppercase">Winner</span>
                  <Star size={18} className="text-yellow-400" />
                </div>
                <p className="text-white text-4xl font-black">{state.winner.playerName}</p>
                <p className="text-white/25 text-sm mt-2">+1 Awesome Point</p>
              </div>
            )}
            <BlackCard text={state.currentBlackCard.text} pick={state.currentBlackCard.pick} size="medium" />
            <div className="flex flex-wrap justify-center gap-5 max-w-2xl">
              {state.submissions.map((sub: CAHAnonymousSubmission, i: number) => {
                const isWinner = state.winner?.submissionId === sub.submissionId;
                return (
                  <SubmissionGroup
                    key={sub.submissionId}
                    submission={sub}
                    letter={SUBMISSION_LETTERS[i] ?? String(i + 1)}
                    highlight={isWinner}
                    playerName={(sub as unknown as { playerName?: string }).playerName}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* SCORES */}
        {phase.phaseType === CAHPhase.SCORES && (
          <div className="flex flex-col items-center gap-10 w-full max-w-3xl">
            <div className="text-center">
              <p className="text-white/20 text-sm font-bold tracking-widest uppercase mb-3">After Round {phase.roundNumber}</p>
              <h2 className="text-6xl font-black text-white tracking-tight">Scoreboard</h2>
              <p className="text-white/20 text-base mt-2 font-medium">Awesome Points</p>
            </div>
            <ScoreList scores={scores} showRoundScore />
          </div>
        )}

        {/* GAME OVER */}
        {phase.phaseType === PhaseType.GAME_OVER && (
          <div className="flex flex-col items-center gap-10 w-full max-w-3xl">
            <div className="text-center">
              <p className="text-white/20 text-sm font-bold tracking-widest uppercase mb-4">Final Results</p>
              <h1 className="text-7xl font-black text-white tracking-tight mb-6">Game Over</h1>
              {scores[0] && (
                <div className="flex items-center justify-center gap-4">
                  <Trophy size={28} className="text-yellow-400" />
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold"
                    style={{ backgroundColor: scores[0].playerColor }}
                  >
                    {scores[0].playerName.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-white text-3xl font-black">{scores[0].playerName}</p>
                    <p className="text-white/30 text-sm font-medium">Most Horrible Person</p>
                  </div>
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

export default CAHDisplay;
