import type { BJPublicState, SeatState, Card } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { BJPhase } from '../phases.js';
import { SUIT_SYMBOLS, SUIT_COLORS } from '../constants.js';
import { Spade, Trophy } from 'lucide-react';
import type { DisplayProps } from '@display/games/types';
import type { ScoreEntry } from '@boredless/shared';
import { handValue } from '../server/deck.js';

// ============================================================
// Sub-components
// ============================================================

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

function HandCards({ cards, small }: { cards: Card[]; small?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {cards.map((card, i) => (
        <CardView key={i} card={card} small={small} />
      ))}
    </div>
  );
}

function HandScore({ cards, bust, blackjack }: { cards: Card[]; bust?: boolean; blackjack?: boolean }) {
  if (cards.length === 0) return null;
  const { score, soft } = handValue(cards);
  const label = blackjack ? 'BJ' : bust ? 'BUST' : soft ? `${score}` : `${score}`;
  const color = blackjack ? 'text-yellow-400' : bust ? 'text-red-400' : 'text-white/70';
  return (
    <span className={`text-sm font-bold tabular-nums ${color}`}>
      {label}{soft && !blackjack && !bust ? <span className="text-white/30 text-xs font-normal"> soft</span> : null}
    </span>
  );
}

function ResultBadge({ result }: { result: string | null }) {
  if (!result || result === 'pending') return null;
  const map: Record<string, { label: string; cls: string }> = {
    blackjack: { label: 'BLACKJACK', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    win:       { label: 'WIN',       cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    push:      { label: 'PUSH',      cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    lose:      { label: 'LOSE',      cls: 'bg-red-500/20 text-red-400/80 border-red-500/30' },
    bust:      { label: 'BUST',      cls: 'bg-red-500/20 text-red-400/80 border-red-500/30' },
  };
  const { label, cls } = map[result] ?? { label: result.toUpperCase(), cls: 'bg-white/10 text-white/50 border-white/20' };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cls}`}>{label}</span>
  );
}

function SeatCard({ seat }: { seat: SeatState }) {
  const allDone = seat.hands.length > 0 && seat.hands.every(h => h.stood || h.bust || h.blackjack);
  const noBet = seat.chips <= 0 && seat.bet === 0;

  return (
    <div className={`flex flex-col items-center gap-2 px-4 py-3 rounded-2xl border transition-all min-w-[120px] ${
      noBet ? 'bg-white/[0.01] border-white/[0.04] opacity-30' :
      allDone ? 'bg-white/[0.03] border-white/[0.06]' :
      'bg-emerald-500/[0.05] border-emerald-500/20'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white/80 truncate max-w-[90px]">{seat.playerName}</span>
        {seat.result && <ResultBadge result={seat.result} />}
      </div>

      <span className="text-xs text-white/30 tabular-nums">{seat.chips.toLocaleString()} chips</span>

      {seat.hands.length > 0 && (
        <div className="flex flex-col items-center gap-1.5">
          {seat.hands.map((hand, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <HandCards cards={hand.cards} small />
              <div className="flex items-center gap-2">
                <HandScore cards={hand.cards} bust={hand.bust} blackjack={hand.blackjack} />
                <span className="text-xs text-white/20 tabular-nums">bet {hand.bet}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {seat.bet > 0 && seat.hands.length === 0 && (
        <span className="text-xs text-emerald-400/50 tabular-nums">bet {seat.bet}</span>
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

// ============================================================
// Main display component
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BJDisplay({ phase, publicState, scores, timerMs, useGameEvent: _useGameEvent }: DisplayProps) {
  const state = publicState as unknown as BJPublicState;
  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 30;
  const isUrgent = seconds !== null && seconds <= 5;

  const isPlayPhase = [BJPhase.BETTING, BJPhase.DEALING, BJPhase.PLAYING, BJPhase.DEALER, BJPhase.RESULTS].includes(phase.phaseType as any);

  const phaseLabel: Record<string, string> = {
    [BJPhase.BETTING]:  'Place Your Bets',
    [BJPhase.DEALING]:  'Dealing...',
    [BJPhase.PLAYING]:  'Players Act',
    [BJPhase.DEALER]:   'Dealer Plays',
    [BJPhase.RESULTS]:  'Results',
    [BJPhase.SCORES]:   'Standings',
  };

  return (
    <div className="flex flex-col h-full w-full bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/20 via-gray-950 to-gray-950 pointer-events-none" />

      {seconds !== null && (
        <div className="relative z-20 flex-shrink-0">
          <TimerBar seconds={seconds} totalSeconds={totalSeconds} />
        </div>
      )}

      <header className="relative z-10 flex items-center justify-between px-12 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Spade size={18} className="text-white/15" />
          <span className="text-white/25 text-sm font-medium tracking-wider">Blackjack</span>
        </div>
        {state?.roundNumber > 0 && (
          <span className="absolute left-1/2 -translate-x-1/2 text-white/20 text-sm font-medium tracking-widest">
            Round {state.roundNumber}
            {isPlayPhase && phase.phaseType !== BJPhase.BETTING && ` · ${phaseLabel[phase.phaseType] ?? ''}`}
          </span>
        )}
        {seconds !== null ? (
          <span className={`text-base font-semibold tabular-nums transition-colors ${isUrgent ? 'text-red-400' : 'text-white/20'}`}>
            {seconds}s
          </span>
        ) : <div className="w-8" />}
      </header>

      <main className="relative z-10 flex flex-col flex-1 items-center justify-center px-10 pb-10 overflow-hidden gap-8">

        {/* ── BETTING PHASE ── */}
        {phase.phaseType === BJPhase.BETTING && (
          <div className="flex flex-col items-center gap-8 w-full max-w-5xl">
            <div className="text-center">
              <p className="text-white/20 text-xs font-medium tracking-widest uppercase mb-1">Betting</p>
              <h2 className="text-5xl font-bold text-white tracking-tight">Place Your Bets</h2>
              <p className="text-white/30 text-sm mt-2">Use your phone to set your wager</p>
            </div>
            {state?.seats && (
              <div className="flex flex-wrap justify-center gap-3">
                {state.seats.map((seat: SeatState) => (
                  <div key={seat.playerId} className={`flex flex-col items-center gap-1.5 px-5 py-3 rounded-2xl border ${
                    seat.betPlaced ?? false ? 'bg-emerald-500/[0.08] border-emerald-500/30' : 'bg-white/[0.03] border-white/[0.07]'
                  }`}>
                    <span className="text-white/70 font-semibold text-sm">{seat.playerName}</span>
                    <span className="text-white/30 text-xs tabular-nums">{seat.chips.toLocaleString()} chips</span>
                    {(seat.betPlaced ?? false) && (
                      <span className="text-emerald-400/70 text-xs tabular-nums">bet {seat.bet}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── DEALING / PLAYING / DEALER / RESULTS ── */}
        {[BJPhase.DEALING, BJPhase.PLAYING, BJPhase.DEALER, BJPhase.RESULTS].includes(phase.phaseType as any) && state?.dealerCards && (
          <div className="flex flex-col items-center gap-6 w-full max-w-6xl">

            {/* Dealer area */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-3">
                <span className="text-white/30 text-xs font-medium tracking-widest uppercase">Dealer</span>
                {phase.phaseType !== BJPhase.PLAYING && (
                  <span className="text-white/50 text-sm font-bold tabular-nums">
                    {state.dealerCards.length > 0 ? (() => {
                      const { score, soft } = handValue(state.dealerCards);
                      if (score > 21) return <span className="text-red-400">BUST ({score})</span>;
                      return <span>{score}{soft ? ' soft' : ''}</span>;
                    })() : null}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {state.dealerCards.map((card: Card, i: number) => (
                  // Hide hole card during playing phase
                  <CardView key={i} card={card} faceDown={phase.phaseType === BJPhase.PLAYING && i === 1} />
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="w-full max-w-2xl h-px bg-white/[0.05]" />

            {/* Player seats */}
            <div className="flex flex-wrap justify-center gap-3 w-full">
              {state.seats.map((seat: SeatState) => (
                <SeatCard key={seat.playerId} seat={seat} />
              ))}
            </div>

            {/* Last action */}
            {state.lastAction && phase.phaseType === BJPhase.PLAYING && (
              <div className="text-center">
                <span className="text-white/35 text-sm">
                  {state.lastAction.playerName}{' '}
                  <span className="text-white/60 font-semibold">{state.lastAction.action.toUpperCase()}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── SCORES ── */}
        {phase.phaseType === BJPhase.SCORES && (
          <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
            <div className="text-center">
              <p className="text-white/20 text-sm font-medium tracking-widest uppercase mb-2">Chip Count</p>
              <h2 className="text-5xl font-bold text-white tracking-tight">Standings</h2>
            </div>
            <ScoreList scores={scores} />
          </div>
        )}

        {/* ── GAME OVER ── */}
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

export default BJDisplay;
