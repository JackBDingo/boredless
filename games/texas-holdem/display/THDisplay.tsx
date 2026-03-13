import type { THPublicState, SeatState, Card, WinnerInfo } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { THPhase } from '../phases.js';
import { SUIT_SYMBOLS, SUIT_COLORS } from '../constants.js';
import { Diamond, Trophy } from 'lucide-react';
import type { DisplayProps } from '@display/games/types';
import type { ScoreEntry } from '@boredless/shared';

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
      {/* Top-left corner */}
      <div className="absolute top-1.5 left-2 flex flex-col items-center leading-none">
        <span className={`${rankSize} font-bold`} style={{ color }}>{card.rank}</span>
        <span className={`${suitCorner} -mt-0.5`} style={{ color }}>{symbol}</span>
      </div>
      {/* Center pip */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${centerSize}`} style={{ color }}>{symbol}</span>
      </div>
      {/* Bottom-right corner (inverted) */}
      <div className="absolute bottom-1.5 right-2 flex flex-col items-center leading-none rotate-180">
        <span className={`${rankSize} font-bold`} style={{ color }}>{card.rank}</span>
        <span className={`${suitCorner} -mt-0.5`} style={{ color }}>{symbol}</span>
      </div>
    </div>
  );
}

function SeatBadge({ seat, isActive }: { seat: SeatState; isActive: boolean }) {
  const folded = seat.folded;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
      folded ? 'bg-white/[0.02] border-white/[0.04] opacity-40' :
      isActive ? 'bg-emerald-500/[0.08] border-emerald-500/30 ring-1 ring-emerald-500/20' :
      'bg-white/[0.03] border-white/[0.07]'
    }`}>
      <div className="flex flex-col items-center gap-0.5">
        <span className={`text-sm font-semibold truncate max-w-[80px] ${folded ? 'text-white/30 line-through' : 'text-white/80'}`}>
          {seat.playerName}
        </span>
        <span className="text-xs text-white/30 tabular-nums">{seat.chips.toLocaleString()}</span>
      </div>
      {seat.isDealer && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400/80">D</span>}
      {seat.isSmallBlind && !seat.isDealer && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400/70">SB</span>}
      {seat.isBigBlind && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400/70">BB</span>}
      {seat.allIn && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400/80">ALL IN</span>}
      {seat.currentBet > 0 && (
        <span className="text-xs text-emerald-400/60 tabular-nums">{seat.currentBet}</span>
      )}
    </div>
  );
}

function ScoreList({ scores }: { scores: ScoreEntry[] }) {
  return (
    <div className="w-full flex flex-col divide-y divide-white/[0.04]">
      {scores.map((entry, index) => (
        <div key={entry.playerId} className="flex items-center justify-center gap-4 py-5">
          <span className="w-6 text-right text-white/20 text-lg font-medium tabular-nums">{index + 1}</span>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0" style={{ backgroundColor: entry.playerColor }}>
            {entry.playerName.charAt(0).toUpperCase()}
          </div>
          <span className="text-white/80 text-lg font-medium w-32 truncate">{entry.playerName}</span>
          <span className="text-white text-xl font-semibold tabular-nums">{entry.score.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function THDisplay({ phase, publicState, scores, timerMs, useGameEvent: _useGameEvent }: DisplayProps) {
  const state = publicState as unknown as THPublicState;
  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 30;
  const isUrgent = seconds !== null && seconds <= 5;

  const isBettingPhase = [THPhase.PREFLOP, THPhase.FLOP, THPhase.TURN, THPhase.RIVER].includes(phase.phaseType as any);

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
          <Diamond size={18} className="text-white/15" />
          <span className="text-white/25 text-sm font-medium tracking-wider">Texas Hold'em</span>
        </div>
        {state.handNumber > 0 && (
          <span className="absolute left-1/2 -translate-x-1/2 text-white/20 text-sm font-medium tracking-widest">
            Hand #{state.handNumber} &middot; Blinds {state.smallBlind}/{state.bigBlind}
          </span>
        )}
        {seconds !== null ? (
          <span className={`text-base font-semibold tabular-nums transition-colors ${isUrgent ? 'text-red-400' : 'text-white/20'}`}>
            {seconds}s
          </span>
        ) : <div className="w-8" />}
      </header>

      <main className="relative z-10 flex flex-col flex-1 items-center justify-center px-16 lg:px-24 xl:px-32 pb-12 overflow-hidden">

        {/* INSTRUCTIONS */}
        {phase.phaseType === PhaseType.INSTRUCTIONS && (
          <div className="flex flex-col items-center gap-10 text-center max-w-4xl w-full">
            <div>
              <h1 className="text-7xl font-bold text-white tracking-tight leading-none mb-5">Texas Hold'em</h1>
              <p className="text-white/35 text-xl font-light">No-limit poker. Bluff, bet, and take it all.</p>
            </div>
            <div className="grid grid-cols-3 gap-6 w-full max-w-3xl">
              {[
                { step: '01', label: 'Get dealt in', detail: 'Two hole cards, five community cards' },
                { step: '02', label: 'Bet or bluff', detail: 'Check, raise, call, or go all-in' },
                { step: '03', label: 'Best hand wins', detail: 'Make the best 5-card hand to take the pot' },
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

        {/* BETTING PHASES + SHOWDOWN */}
        {(isBettingPhase || phase.phaseType === THPhase.SHOWDOWN) && state.seats && (
          <div className="flex flex-col items-center gap-8 w-full max-w-5xl">
            {/* Pot */}
            <div className="text-center">
              <p className="text-white/20 text-xs font-medium tracking-widest uppercase mb-1">
                {phase.phaseType === THPhase.SHOWDOWN ? 'Showdown' :
                 phase.phaseType === THPhase.PREFLOP ? 'Pre-Flop' :
                 phase.phaseType === THPhase.FLOP ? 'Flop' :
                 phase.phaseType === THPhase.TURN ? 'Turn' : 'River'}
              </p>
              <p className="text-white text-4xl font-bold tabular-nums">{state.pot.toLocaleString()}</p>
              <p className="text-white/20 text-sm">pot</p>
            </div>

            {/* Community Cards */}
            <div className="flex items-center gap-3 justify-center min-h-[96px]">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i}>
                  {state.communityCards[i] ? (
                    <CardView card={state.communityCards[i]} />
                  ) : (
                    <div className="w-24 h-36 rounded-xl border border-dashed border-white/[0.08]" />
                  )}
                </div>
              ))}
            </div>

            {/* Last action */}
            {state.lastAction && (
              <div className="text-center">
                <span className="text-white/40 text-sm">
                  {state.lastAction.playerName}{' '}
                  <span className={`font-semibold ${
                    state.lastAction.action === 'fold' ? 'text-red-400/60' :
                    state.lastAction.action === 'all-in' ? 'text-amber-400/80' :
                    state.lastAction.action === 'raise' ? 'text-emerald-400/70' :
                    'text-white/50'
                  }`}>
                    {state.lastAction.action === 'all-in' ? 'ALL IN' : state.lastAction.action.toUpperCase()}
                  </span>
                  {state.lastAction.amount > 0 && state.lastAction.action !== 'fold' && (
                    <span className="text-white/30"> ({state.lastAction.amount})</span>
                  )}
                </span>
              </div>
            )}

            {/* Winners */}
            {state.winners && state.winners.length > 0 && (
              <div className="flex flex-col items-center gap-3">
                {state.winners.map((w: WinnerInfo) => (
                  <div key={w.playerId} className="flex items-center gap-3 px-6 py-3 rounded-xl bg-emerald-500/[0.08] border border-emerald-500/20">
                    <Trophy size={16} className="text-emerald-400/70" />
                    <span className="text-emerald-300 font-semibold">{w.playerName}</span>
                    <span className="text-emerald-400/50 text-sm">wins {w.amount.toLocaleString()}</span>
                    {w.handLabel && <span className="text-emerald-400/40 text-xs">({w.handLabel})</span>}
                  </div>
                ))}
              </div>
            )}

            {/* Seats */}
            <div className="flex flex-wrap justify-center gap-3 max-w-4xl">
              {state.seats.map((seat: SeatState) => (
                <SeatBadge key={seat.playerId} seat={seat} isActive={seat.playerId === state.activePlayerId} />
              ))}
            </div>
          </div>
        )}

        {/* SCORES */}
        {phase.phaseType === THPhase.SCORES && (
          <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
            <div className="text-center">
              <p className="text-white/20 text-sm font-medium tracking-widest uppercase mb-2">Chip Count</p>
              <h2 className="text-5xl font-bold text-white tracking-tight">Standings</h2>
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

export default THDisplay;
