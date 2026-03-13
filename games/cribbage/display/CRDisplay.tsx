// ============================================================
// CRIBBAGE — TV Display Component
// ============================================================

import { PhaseType } from '@boredless/shared';
import { CRPhase } from '../phases.js';
import { SUIT_SYMBOLS, SUIT_COLORS } from '../constants.js';
import { Trophy } from 'lucide-react';
import type { DisplayProps } from '@display/games/types';
import type { ScoreEntry } from '@boredless/shared';
import type { CRPublicState, Card, PlayedCard, HandScore, ScoreItem } from '../types.js';

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimerBar({ seconds, totalSeconds }: { seconds: number; totalSeconds: number }) {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (seconds / totalSeconds) * 100)) : 0;
  const isUrgent = seconds <= 5;
  return (
    <div className="w-full h-1 bg-white/[0.04] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(52,211,153,0.5)' }}
      />
    </div>
  );
}

function CardView({ card, faceDown, small }: { card?: Card; faceDown?: boolean; small?: boolean }) {
  const w = small ? 'w-16 h-24' : 'w-24 h-36';
  if (faceDown || !card) {
    return (
      <div className={`${w} rounded-xl bg-gradient-to-br from-emerald-900/60 to-emerald-800/40 border border-emerald-500/20 flex items-center justify-center relative overflow-hidden`}>
        <div className="absolute inset-1.5 rounded-lg border border-emerald-500/15" />
        <div className="w-6 h-6 rounded-full border-2 border-emerald-500/25" />
      </div>
    );
  }
  const color = SUIT_COLORS[card.suit] ?? '#1e293b';
  const symbol = SUIT_SYMBOLS[card.suit] ?? '';
  const rankSize = small ? 'text-sm' : 'text-lg';
  const suitCorner = small ? 'text-xs' : 'text-sm';
  const centerSize = small ? 'text-2xl' : 'text-4xl';
  return (
    <div className={`${w} rounded-xl bg-white border border-gray-200 shadow-lg relative overflow-hidden`}>
      <div className="absolute top-1.5 left-2 flex flex-col items-center leading-none">
        <span className={`${rankSize} font-bold`} style={{ color }}>{card.rank}</span>
        <span className={`${suitCorner} -mt-0.5`} style={{ color }}>{symbol}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${centerSize}`} style={{ color }}>{symbol}</span>
      </div>
      <div className="absolute bottom-1.5 right-2 flex flex-col items-center leading-none rotate-180">
        <span className={`${rankSize} font-bold`} style={{ color }}>{card.rank}</span>
        <span className={`${suitCorner} -mt-0.5`} style={{ color }}>{symbol}</span>
      </div>
    </div>
  );
}

/** Cribbage board track visualization */
function CribbageBoard({ scores, playerNames, playerColors }: {
  scores: Record<string, number>;
  playerNames: Record<string, string>;
  playerColors: Record<string, string>;
}) {
  const entries = Object.entries(scores);
  const WIN = 121;

  return (
    <div className="w-full max-w-3xl">
      <div className="flex flex-col gap-2.5">
        {entries.map(([pid, score]) => {
          const pct = Math.min(100, (score / WIN) * 100);
          const color = playerColors[pid] ?? '#10b981';
          const name = playerNames[pid] ?? pid;
          return (
            <div key={pid} className="flex items-center gap-3">
              <span className="text-white/50 text-xs font-medium w-20 text-right truncate">{name}</span>
              <div className="flex-1 h-4 rounded-full bg-white/[0.06] relative overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
                {/* Peg markers at 61 and 91 */}
                <div className="absolute top-0 bottom-0 w-px bg-white/10" style={{ left: `${(61/WIN)*100}%` }} />
                <div className="absolute top-0 bottom-0 w-px bg-white/10" style={{ left: `${(91/WIN)*100}%` }} />
              </div>
              <span className="text-white/70 text-sm font-bold tabular-nums w-10">{score}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end mt-1">
        <span className="text-white/15 text-xs">/ {WIN}</span>
      </div>
    </div>
  );
}

function ScoreList({ scores }: { scores: ScoreEntry[] }) {
  return (
    <div className="w-full flex flex-col divide-y divide-white/[0.04]">
      {scores.map((entry, index) => (
        <div key={entry.playerId} className="flex items-center justify-center gap-4 py-4">
          <span className="w-6 text-right text-white/20 text-lg font-medium tabular-nums">{index + 1}</span>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
            style={{ backgroundColor: entry.playerColor }}>
            {entry.playerName.charAt(0).toUpperCase()}
          </div>
          <span className="text-white/80 text-lg font-medium w-32 truncate">{entry.playerName}</span>
          <span className="text-white text-xl font-semibold tabular-nums">{entry.score}</span>
        </div>
      ))}
    </div>
  );
}

function HandScoreBreakdown({ hs }: { hs: HandScore }) {
  if (hs.items.length === 0) {
    return (
      <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-white/40 text-sm text-center">No score — {hs.playerName}</p>
      </div>
    );
  }
  return (
    <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-white/60 text-sm font-semibold">{hs.playerName}</span>
        <span className="text-emerald-400 text-base font-bold">{hs.total} pts</span>
      </div>
      {hs.items.map((item: ScoreItem, i: number) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="text-white/40">{item.label}</span>
          <span className="text-white/60 font-semibold">+{item.points}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CRDisplay({ phase, publicState, players, scores, timerMs, useGameEvent: _useGameEvent }: DisplayProps) {
  const state = publicState as unknown as CRPublicState;
  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 30;
  const isUrgent = seconds !== null && seconds <= 5;

  // Build color map
  const playerColors: Record<string, string> = {};
  for (const p of players) {
    playerColors[p.playerId] = p.playerColor;
  }

  return (
    <div className="flex flex-col h-full w-full bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/15 via-gray-950 to-gray-950 pointer-events-none" />

      {seconds !== null && (
        <div className="relative z-20 flex-shrink-0">
          <TimerBar seconds={seconds} totalSeconds={totalSeconds} />
        </div>
      )}

      <header className="relative z-10 flex items-center justify-between px-12 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-white/25 text-sm font-medium tracking-wider">Cribbage</span>
        </div>
        {state && state.round > 0 && (
          <span className="absolute left-1/2 -translate-x-1/2 text-white/20 text-sm font-medium tracking-widest">
            Round {state.round} · Dealer: {state.dealerName}
          </span>
        )}
        {seconds !== null ? (
          <span className={`text-base font-semibold tabular-nums transition-colors ${isUrgent ? 'text-red-400' : 'text-white/20'}`}>
            {seconds}s
          </span>
        ) : <div className="w-8" />}
      </header>

      <main className="relative z-10 flex flex-col flex-1 items-center justify-center px-16 lg:px-24 xl:px-32 pb-12 overflow-hidden">

        {/* DEALING */}
        {phase.phaseType === CRPhase.DEALING && (
          <div className="flex flex-col items-center gap-8 text-center">
            <h1 className="text-6xl font-bold text-white tracking-tight">Cribbage</h1>
            <p className="text-white/35 text-xl">Dealing cards…</p>
            {state && state.scores && (
              <CribbageBoard scores={state.scores} playerNames={state.playerNames ?? {}} playerColors={playerColors} />
            )}
          </div>
        )}

        {/* DISCARD */}
        {phase.phaseType === CRPhase.DISCARD && state && (
          <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
            <div className="text-center">
              <p className="text-white/20 text-xs font-medium tracking-widest uppercase mb-2">Discard Phase</p>
              <h2 className="text-4xl font-bold text-white tracking-tight">Build the Crib</h2>
              <p className="text-white/30 text-sm mt-2">Choose cards to send to {state.dealerName}'s crib</p>
            </div>
            {/* Who has discarded */}
            <div className="flex flex-wrap justify-center gap-3">
              {state.playerOrder?.map((pid: string) => (
                <div key={pid} className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                  state.discardsDone?.[pid]
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400/80'
                    : 'bg-white/[0.03] border-white/[0.07] text-white/30'
                }`}>
                  {state.playerNames?.[pid] ?? pid}
                  {state.discardsDone?.[pid] ? ' ✓' : ' …'}
                </div>
              ))}
            </div>
            <CribbageBoard scores={state.scores} playerNames={state.playerNames ?? {}} playerColors={playerColors} />
          </div>
        )}

        {/* CUT */}
        {phase.phaseType === CRPhase.CUT && state && (
          <div className="flex flex-col items-center gap-8 w-full max-w-3xl">
            <div className="text-center">
              <p className="text-white/20 text-xs font-medium tracking-widest uppercase mb-2">Starter Card</p>
              <h2 className="text-4xl font-bold text-white tracking-tight">The Cut</h2>
            </div>
            <CardView card={state.starterCard ?? undefined} />
            {state.lastPegPoints && state.lastPegPoints.reason.includes('Heels') && (
              <div className="px-6 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-center">
                <p className="text-amber-400 font-semibold">{state.lastPegPoints.reason}</p>
                <p className="text-amber-400/60 text-sm">+{state.lastPegPoints.points} pts → {state.lastPegPoints.playerName}</p>
              </div>
            )}
            <CribbageBoard scores={state.scores} playerNames={state.playerNames ?? {}} playerColors={playerColors} />
          </div>
        )}

        {/* PEGGING */}
        {phase.phaseType === CRPhase.PEGGING && state && (
          <div className="flex flex-col items-center gap-6 w-full max-w-4xl">
            <div className="text-center">
              <p className="text-white/20 text-xs font-medium tracking-widest uppercase mb-1">The Play</p>
              <div className="flex items-baseline gap-3 justify-center">
                <span className="text-6xl font-bold text-white tabular-nums">{state.pegCount}</span>
                <span className="text-white/25 text-2xl">/ 31</span>
              </div>
              {state.activePlayerId && state.playerNames && (
                <p className="text-white/40 text-sm mt-2">
                  {state.playerNames[state.activePlayerId]}'s turn
                </p>
              )}
            </div>

            {/* Starter card */}
            {state.starterCard && (
              <div className="flex items-center gap-3">
                <span className="text-white/20 text-xs uppercase tracking-widest">Starter</span>
                <CardView card={state.starterCard} small />
              </div>
            )}

            {/* Played cards in current series */}
            {state.playedCards && state.playedCards.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {state.playedCards.map((pc: PlayedCard, i: number) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <CardView card={pc.card} small />
                    <span className="text-white/25 text-[10px] truncate max-w-[64px] text-center">{pc.playerName}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Last peg points */}
            {state.lastPegPoints && (
              <div className="px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-center">
                <span className="text-emerald-400 font-semibold">{state.lastPegPoints.playerName} +{state.lastPegPoints.points} — {state.lastPegPoints.reason}</span>
              </div>
            )}

            {/* Go players */}
            {state.goPlayers && state.goPlayers.length > 0 && (
              <div className="flex gap-2">
                {state.goPlayers.map((pid: string) => (
                  <span key={pid} className="px-3 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/40 text-sm">
                    {state.playerNames?.[pid] ?? pid}: Go
                  </span>
                ))}
              </div>
            )}

            <CribbageBoard scores={state.scores} playerNames={state.playerNames ?? {}} playerColors={playerColors} />
          </div>
        )}

        {/* SCORING */}
        {phase.phaseType === CRPhase.SCORING && state && (
          <div className="flex flex-col items-center gap-6 w-full max-w-4xl">
            <div className="text-center">
              <p className="text-white/20 text-xs font-medium tracking-widest uppercase mb-2">The Show</p>
              <h2 className="text-4xl font-bold text-white tracking-tight">Hand Scoring</h2>
              {state.starterCard && (
                <div className="flex items-center justify-center gap-2 mt-3">
                  <span className="text-white/20 text-xs uppercase tracking-widest">Starter</span>
                  <CardView card={state.starterCard} small />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 w-full max-w-3xl">
              {state.handScores?.map((hs: HandScore) => (
                <HandScoreBreakdown key={hs.playerId} hs={hs} />
              ))}
            </div>
            <CribbageBoard scores={state.scores} playerNames={state.playerNames ?? {}} playerColors={playerColors} />
          </div>
        )}

        {/* CRIB */}
        {phase.phaseType === CRPhase.CRIB && state && (
          <div className="flex flex-col items-center gap-6 w-full max-w-3xl">
            <div className="text-center">
              <p className="text-white/20 text-xs font-medium tracking-widest uppercase mb-2">Crib Scoring</p>
              <h2 className="text-4xl font-bold text-white tracking-tight">{state.dealerName}'s Crib</h2>
            </div>
            {state.cribScore && <HandScoreBreakdown hs={state.cribScore} />}
            <CribbageBoard scores={state.scores} playerNames={state.playerNames ?? {}} playerColors={playerColors} />
          </div>
        )}

        {/* RESULTS */}
        {phase.phaseType === CRPhase.RESULTS && state && (
          <div className="flex flex-col items-center gap-6 w-full max-w-3xl">
            <div className="text-center">
              <p className="text-white/20 text-xs font-medium tracking-widest uppercase mb-2">Round {state.round} Complete</p>
              <h2 className="text-4xl font-bold text-white tracking-tight">Results</h2>
            </div>
            {state.winner && (
              <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
                <Trophy size={18} className="text-emerald-400" />
                <span className="text-emerald-300 font-bold text-lg">{state.winner.playerName} wins!</span>
              </div>
            )}
            <CribbageBoard scores={state.scores} playerNames={state.playerNames ?? {}} playerColors={playerColors} />
          </div>
        )}

        {/* SCORES */}
        {phase.phaseType === CRPhase.SCORES && (
          <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
            <div className="text-center">
              <p className="text-white/20 text-sm font-medium tracking-widest uppercase mb-2">Standings</p>
              <h2 className="text-5xl font-bold text-white tracking-tight">Scoreboard</h2>
            </div>
            <ScoreList scores={scores} />
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
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                    style={{ backgroundColor: scores[0].playerColor }}>
                    {scores[0].playerName.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-white/50 text-2xl font-medium">
                    {scores[0].playerName} <span className="text-white/25 font-normal">wins</span>
                  </p>
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

export default CRDisplay;
