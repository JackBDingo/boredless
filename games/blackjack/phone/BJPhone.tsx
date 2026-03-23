import { useState } from 'react';
import type { BJPrivateState, BJPublicState, Card, PlayerHand } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { BJPhase } from '../phases.js';
import { SUIT_SYMBOLS, SUIT_COLORS } from '../constants.js';
import { BJ_DEFAULT_BET, BJ_MIN_BET, BJ_MAX_BET } from '../constants.js';
import { Spade, Trophy, Monitor } from 'lucide-react';
import { PoweredByLogo } from '@phone/components/PoweredByLogo';
import type { PhoneProps } from '@phone/games/types';
import { handValue } from '../server/deck.js';

// ============================================================
// Sub-components
// ============================================================

function TimerBar({ seconds, totalSeconds }: { seconds: number; totalSeconds: number }) {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (seconds / totalSeconds) * 100)) : 0;
  const isUrgent = seconds <= 5;
  return (
    <div className="w-full h-[3px] bg-white/[0.06] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(52,211,153,0.6)' }}
      />
    </div>
  );
}

function CardView({ card, faceDown, size = 'small' }: { card?: Card; faceDown?: boolean; size?: 'tiny' | 'small' | 'normal' }) {
  const sizeMap = {
    tiny:   { w: 'w-11 h-16', rank: 'text-[10px]', suit: 'text-[8px]', center: 'text-base', inset: 'inset-0.5', corner: 'top-0.5 left-1', radius: 'rounded-lg', dot: 'w-3 h-3' },
    small:  { w: 'w-14 h-20', rank: 'text-xs',     suit: 'text-[9px]', center: 'text-xl',   inset: 'inset-1',   corner: 'top-1 left-1.5', radius: 'rounded-lg', dot: 'w-4 h-4' },
    normal: { w: 'w-20 h-28', rank: 'text-sm',     suit: 'text-xs',    center: 'text-2xl',  inset: 'inset-1.5', corner: 'top-1.5 left-2',  radius: 'rounded-xl', dot: 'w-5 h-5' },
  };
  const s = sizeMap[size];
  if (faceDown || !card) {
    return (
      <div className={`${s.w} ${s.radius} bg-gradient-to-br from-emerald-900/60 to-emerald-800/40 border border-emerald-500/20 flex items-center justify-center relative overflow-hidden`}>
        <div className={`absolute ${s.inset} ${s.radius} border border-emerald-500/15`} />
        <div className={`${s.dot} rounded-full border-2 border-emerald-500/25`} />
      </div>
    );
  }
  const color = SUIT_COLORS[card.suit] ?? '#1e293b';
  const symbol = SUIT_SYMBOLS[card.suit] ?? '';
  return (
    <div className={`${s.w} ${s.radius} bg-white border border-gray-200 shadow-md relative overflow-hidden`}>
      <div className={`absolute ${s.corner} flex flex-col items-center leading-none`}>
        <span className={`${s.rank} font-bold`} style={{ color }}>{card.rank}</span>
        <span className={`${s.suit} -mt-px`} style={{ color }}>{symbol}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={s.center} style={{ color }}>{symbol}</span>
      </div>
    </div>
  );
}

function HandDisplay({ hand, active, compact }: { hand: PlayerHand; active: boolean; compact?: boolean }) {
  const { score, soft } = handValue(hand.cards);
  const bust = hand.bust;
  const bj = hand.blackjack;
  const cardSize = compact ? 'tiny' as const : 'small' as const;
  return (
    <div className={`flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-xl border ${
      active ? 'border-emerald-500/30 bg-emerald-500/[0.05]' : 'border-white/[0.06] bg-white/[0.02]'
    }`}>
      <div className="flex items-center gap-1">
        {hand.cards.map((card: Card, i: number) => (
          <CardView key={i} card={card} size={cardSize} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold tabular-nums ${bj ? 'text-yellow-400' : bust ? 'text-red-400' : 'text-white/70'}`}>
          {bj ? 'Blackjack!' : bust ? `BUST (${score})` : `${score}${soft ? ' soft' : ''}`}
        </span>
        {hand.doubled && <span className="text-[10px] text-amber-400/60 font-medium">2x</span>}
        {hand.split && <span className="text-[10px] text-purple-400/60 font-medium">split</span>}
        <span className="text-[10px] text-white/20 tabular-nums">bet {hand.bet}</span>
      </div>
    </div>
  );
}

function ActionBtn({ label, bg, text, onClick, disabled, sublabel }: {
  label: string; bg: string; text: string;
  onClick: () => void; disabled: boolean;
  sublabel?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 py-3.5 rounded-2xl font-bold text-sm tracking-wide transition-all active:scale-[0.95] disabled:opacity-25 shadow-lg ${bg} ${text}`}
    >
      {label}
      {sublabel && <span className="block text-[10px] font-medium opacity-70 mt-0.5">{sublabel}</span>}
    </button>
  );
}

function ResultBanner({ result, amount }: { result: string | null; amount: number }) {
  if (!result || result === 'pending') return null;
  const map: Record<string, { label: string; sub: string; color: string }> = {
    blackjack: { label: '🎉 Blackjack!', sub: `+${Math.floor(amount * 1)}`, color: '#f59e0b' },
    win:       { label: '✅ You Win!',   sub: `+${amount}`,                  color: '#10b981' },
    push:      { label: '🤝 Push',       sub: 'Bet returned',                color: '#60a5fa' },
    lose:      { label: '❌ You Lose',   sub: `${amount}`,                   color: '#f87171' },
    bust:      { label: '💥 Bust',       sub: `${amount}`,                   color: '#f87171' },
  };
  const { label, sub, color } = map[result] ?? { label: result, sub: '', color: '#94a3b8' };
  return (
    <div className="flex flex-col items-center gap-1 py-5 rounded-2xl border" style={{ borderColor: `${color}33`, backgroundColor: `${color}10` }}>
      <span className="text-xl font-bold" style={{ color }}>{label}</span>
      {sub && <span className="text-sm" style={{ color: `${color}99` }}>{sub}</span>}
    </div>
  );
}

// ============================================================
// Main phone component
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BJPhone({ phase, privateState, publicState, timerMs, submitInput, myPlayer, useGameEvent: _useGameEvent }: PhoneProps) {
  const state = privateState as unknown as BJPrivateState;
  const pub = publicState as unknown as BJPublicState;

  const [betAmount, setBetAmount] = useState<number>(BJ_DEFAULT_BET);
  const [actionSent, setActionSent] = useState(false);

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 30;
  const isUrgent = seconds !== null && seconds <= 5;
  const playerColor = myPlayer?.playerColor ?? '#10b981';

  const effectiveBet = state?.bet ?? betAmount;
  const myChips = state?.chips ?? 0;

  const handleBet = () => {
    submitInput('vote', { action: 'bet', bet: betAmount });
  };

  const handleAction = (action: string) => {
    submitInput('vote', { action });
    setActionSent(true);
    setTimeout(() => setActionSent(false), 800);
  };

  const activeHand = state?.hands?.[state?.activeHandIndex ?? 0];
  const allSettled = state?.stood ?? false;

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 relative overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 120% 40% at 50% 0%, ${playerColor}15 0%, transparent 100%)` }} />

      {seconds !== null && (
        <div className="relative z-20">
          <TimerBar seconds={seconds} totalSeconds={totalSeconds} />
        </div>
      )}

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
          <span className="text-white/15 text-xs tabular-nums">{myChips.toLocaleString()} chips</span>
        </div>
      </header>

      <div className="relative z-10 flex flex-col flex-1 px-6 pb-24 gap-5">

        {/* ── BETTING PHASE ── */}
        {phase.phaseType === BJPhase.BETTING && (
          <div className="flex flex-col flex-1 justify-between pt-6 pb-2">
            {/* Top: Round + Title */}
            <div className="text-center mb-6">
              <p className="text-white/25 text-[10px] font-semibold tracking-[0.2em] uppercase mb-1">Round {pub?.roundNumber ?? 1}</p>
              <h2 className="text-xl font-bold text-white">Place Your Bet</h2>
            </div>

            {/* Center: Chip stack visualization + amount */}
            <div className="flex flex-col items-center gap-6 flex-1 justify-center">
              {/* Big bet display */}
              <div className="relative">
                <div className="w-28 h-28 rounded-full border-4 border-emerald-500/30 bg-emerald-500/[0.08] flex items-center justify-center">
                  <div className="text-center">
                    <span className="text-3xl font-bold text-white tabular-nums">{effectiveBet}</span>
                    <p className="text-[10px] text-white/30 -mt-0.5">chips</p>
                  </div>
                </div>
              </div>

              {/* Chip preset buttons - casino style */}
              <div className="grid grid-cols-5 gap-2 w-full max-w-xs">
                {[20, 50, 100, 200, 500].filter(v => v <= Math.min(BJ_MAX_BET, myChips > 0 ? myChips : BJ_MAX_BET)).map(v => (
                  <button
                    key={v}
                    onClick={() => setBetAmount(v)}
                    className={`aspect-square rounded-full text-sm font-bold transition-all active:scale-90 ${
                      betAmount === v
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/50'
                        : 'bg-white/[0.06] text-white/50 border border-white/[0.08]'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* Slider for fine-tuning */}
              <div className="w-full max-w-xs px-2">
                <input
                  type="range"
                  min={BJ_MIN_BET}
                  max={Math.min(BJ_MAX_BET, myChips > 0 ? myChips : BJ_MAX_BET)}
                  step={BJ_MIN_BET}
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-lg"
                  style={{
                    background: `linear-gradient(to right, #059669 0%, #059669 ${
                      ((betAmount - BJ_MIN_BET) / (Math.min(BJ_MAX_BET, myChips > 0 ? myChips : BJ_MAX_BET) - BJ_MIN_BET)) * 100
                    }%, rgba(255,255,255,0.06) ${
                      ((betAmount - BJ_MIN_BET) / (Math.min(BJ_MAX_BET, myChips > 0 ? myChips : BJ_MAX_BET) - BJ_MIN_BET)) * 100
                    }%, rgba(255,255,255,0.06) 100%)`,
                  }}
                />
              </div>
            </div>

            {/* Bottom: Confirm button */}
            <div className="mt-6">
              {myChips <= 0 ? (
                <p className="text-center text-white/30 text-sm py-4">You're out of chips — watching this round</p>
              ) : (
                <button
                  onClick={handleBet}
                  disabled={state?.betPlaced ?? false}
                  className="w-full py-4 rounded-2xl font-bold text-base shadow-lg transition-all active:scale-[0.97] disabled:opacity-50 disabled:bg-white/[0.06] disabled:text-white/30 bg-emerald-600 text-white"
                >
                  {state?.betPlaced ? '✓ Bet Placed' : 'Confirm Bet'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── DEALING PHASE ── */}
        {phase.phaseType === BJPhase.DEALING && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Spade size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Dealing cards…</p>
              <p className="text-white/30 text-sm">Get ready</p>
            </div>
          </div>
        )}

        {/* ── PLAYING PHASE ── */}
        {phase.phaseType === BJPhase.PLAYING && (
          <div className="flex flex-col flex-1 justify-between pt-4 pb-2">
            {/* Top section: dealer + your hand */}
            <div className="flex flex-col items-center gap-5">
              {/* Dealer card - compact */}
              {pub?.dealerCards?.length > 0 && (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-white/20 text-[10px] font-semibold tracking-[0.2em] uppercase">Dealer Shows</span>
                  <div className="flex items-center gap-1">
                    <CardView card={pub.dealerCards[0]} size="small" />
                    <CardView faceDown size="small" />
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="w-16 h-px bg-white/[0.06]" />

              {/* Your hand */}
              {state?.hands && state.hands.length > 0 && (
                <div className="flex flex-col items-center gap-2 w-full max-w-xs">
                  <span className="text-white/20 text-[10px] font-semibold tracking-[0.2em] uppercase">Your Hand</span>
                  {state.hands.map((hand: PlayerHand, i: number) => (
                    <HandDisplay key={i} hand={hand} active={i === state.activeHandIndex && !allSettled} />
                  ))}
                </div>
              )}

              {/* Result banner */}
              {state?.result && (
                <div className="w-full max-w-xs">
                  <ResultBanner result={state.result} amount={state.resultAmount} />
                </div>
              )}
            </div>

            {/* Bottom: Action buttons */}
            <div className="mt-6">
              {!allSettled && activeHand && !activeHand.stood && !activeHand.bust && !activeHand.blackjack ? (
                <div className="flex flex-col gap-2.5 max-w-xs mx-auto w-full">
                  <div className="flex gap-2.5">
                    <ActionBtn
                      label="HIT"
                      bg="bg-emerald-600" text="text-white"
                      onClick={() => handleAction('hit')}
                      disabled={actionSent}
                    />
                    <ActionBtn
                      label="STAND"
                      bg="bg-sky-600" text="text-white"
                      onClick={() => handleAction('stand')}
                      disabled={actionSent}
                    />
                  </div>
                  {(state?.canDouble || state?.canSplit) && (
                    <div className="flex gap-2.5">
                      {state?.canDouble && (
                        <ActionBtn
                          label="DOUBLE"
                          bg="bg-amber-600" text="text-white"
                          sublabel={`-${activeHand.bet}`}
                          onClick={() => handleAction('double')}
                          disabled={actionSent}
                        />
                      )}
                      {state?.canSplit && (
                        <ActionBtn
                          label="SPLIT"
                          bg="bg-purple-600" text="text-white"
                          sublabel={`-${activeHand.bet}`}
                          onClick={() => handleAction('split')}
                          disabled={actionSent}
                        />
                      )}
                    </div>
                  )}
                </div>
              ) : allSettled && !state?.result ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <p className="text-white/30 text-sm">Waiting for dealer…</p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── DEALER PHASE ── */}
        {phase.phaseType === BJPhase.DEALER && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Monitor size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Dealer's Turn</p>
              <p className="text-white/30 text-sm">Watch the TV</p>
            </div>
            {state?.hands && state.hands.length > 0 && (
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {state.hands.map((hand: PlayerHand, i: number) => (
                  <HandDisplay key={i} hand={hand} active={false} compact />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── RESULTS PHASE ── */}
        {phase.phaseType === BJPhase.RESULTS && (
          <div className="flex flex-col flex-1 gap-4 pt-4 items-center">
            <div className="text-center">
              <p className="text-white/25 text-xs font-medium tracking-widest uppercase mb-1">Results</p>
              <h2 className="text-2xl font-bold text-white">Round {pub?.roundNumber}</h2>
            </div>

            {state?.result && <ResultBanner result={state.result} amount={state.resultAmount} />}

            {state?.hands && state.hands.length > 0 && (
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {state.hands.map((hand: PlayerHand, i: number) => (
                  <HandDisplay key={i} hand={hand} active={false} compact />
                ))}
              </div>
            )}

            <div className="flex flex-col items-center gap-1 mt-2">
              <span className="text-white/30 text-xs">Chips</span>
              <span className="text-white text-2xl font-bold tabular-nums">{myChips.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* ── SCORES ── */}
        {phase.phaseType === BJPhase.SCORES && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Monitor size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Standings</p>
              <p className="text-white/30 text-sm">Check the TV</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-white/30 text-xs">Your chips</span>
              <span className="text-white text-3xl font-bold tabular-nums">{myChips.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* ── GAME OVER ── */}
        {phase.phaseType === PhaseType.GAME_OVER && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Trophy size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Game Over</p>
              <p className="text-white/30 text-sm">Final chips: {myChips.toLocaleString()}</p>
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

export default BJPhone;
