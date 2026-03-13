import { useState } from 'react';
import type { THPrivateState, THPublicState, Card, AvailableAction } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { THPhase } from '../phases.js';
import { SUIT_SYMBOLS, SUIT_COLORS } from '../constants.js';
import { Diamond, Trophy, Monitor, Eye, EyeOff } from 'lucide-react';
import { PoweredByLogo } from '@phone/components/PoweredByLogo';
import type { PhoneProps } from '@phone/games/types';

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

function CardView({ card, small }: { card: Card; small?: boolean }) {
  const color = SUIT_COLORS[card.suit] ?? '#1e293b';
  const symbol = SUIT_SYMBOLS[card.suit] ?? '';
  const size = small ? 'w-16 h-24' : 'w-24 h-36';
  const rankSize = small ? 'text-sm' : 'text-lg';
  const suitCorner = small ? 'text-xs' : 'text-sm';
  const centerSize = small ? 'text-2xl' : 'text-4xl';
  return (
    <div className={`${size} rounded-xl bg-white border border-gray-200 shadow-lg relative overflow-hidden`}>
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

function ActionButton({ action, onPress, playerColor, disabled }: {
  action: AvailableAction;
  onPress: (action: string, amount: number) => void;
  playerColor: string;
  disabled: boolean;
}) {
  const label = action.action === 'all-in' ? 'ALL IN' : action.action.toUpperCase();

  const styles: Record<string, { bg: string; text: string }> = {
    'fold': { bg: 'bg-red-600', text: 'text-white' },
    'check': { bg: 'bg-white/10', text: 'text-white/80' },
    'call': { bg: 'bg-sky-600', text: 'text-white' },
    'raise': { bg: 'bg-emerald-600', text: 'text-white' },
    'all-in': { bg: 'bg-gradient-to-r from-amber-500 to-orange-500', text: 'text-white' },
  };
  const s = styles[action.action] ?? { bg: 'bg-white/10', text: 'text-white/60' };

  return (
    <button
      onClick={() => onPress(action.action, action.minAmount ?? 0)}
      disabled={disabled}
      className={`flex-1 py-3 rounded-2xl font-bold text-sm tracking-wide transition-all active:scale-[0.95] disabled:opacity-25 shadow-lg ${s.bg} ${s.text}`}
    >
      {label}
      {action.minAmount !== undefined && action.action !== 'fold' && action.action !== 'check' && (
        <span className="block text-[10px] font-medium opacity-70 mt-0.5">{action.minAmount.toLocaleString()}</span>
      )}
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function THPhone({ phase, privateState, publicState, timerMs, submitInput, myPlayer, useGameEvent: _useGameEvent }: PhoneProps) {
  const state = privateState as unknown as THPrivateState;
  const pub = publicState as unknown as THPublicState;
  const [raiseAmount, setRaiseAmount] = useState<number>(0);
  const [showCards, setShowCards] = useState(true);
  const [actionSent, setActionSent] = useState(false);

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 30;
  const isUrgent = seconds !== null && seconds <= 5;
  const playerColor = myPlayer?.playerColor ?? '#10b981';

  const isBettingPhase = [THPhase.PREFLOP, THPhase.FLOP, THPhase.TURN, THPhase.RIVER].includes(phase.phaseType as any);

  const handleAction = (action: string, amount: number) => {
    if (action === 'raise') {
      const finalAmount = raiseAmount > 0 ? raiseAmount : amount;
      submitInput('vote', { action: 'raise', amount: finalAmount });
    } else {
      submitInput('vote', { action, amount });
    }
    setActionSent(true);
    setRaiseAmount(0);
    // Reset after brief delay (for next action opportunity)
    setTimeout(() => setActionSent(false), 1500);
  };

  const raiseAction = state.availableActions?.find(a => a.action === 'raise');

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
          <span className="text-white/15 text-xs tabular-nums">{state.chips?.toLocaleString() ?? 0} chips</span>
        </div>
      </header>

      <div className="relative z-10 flex flex-col flex-1 px-6 pb-20">

        {/* INSTRUCTIONS */}
        {phase.phaseType === PhaseType.INSTRUCTIONS && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Diamond size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Texas Hold'em</h2>
              <p className="text-white/30 text-sm max-w-xs leading-relaxed">
                No-limit poker. Make the best 5-card hand to win the pot.
              </p>
            </div>
          </div>
        )}

        {/* BETTING PHASES */}
        {isBettingPhase && state.holeCards && (
          <div className="flex flex-col flex-1 gap-5 pt-4">
            {/* Hole cards */}
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <p className="text-white/25 text-xs font-medium tracking-widest uppercase">Your Cards</p>
                <button onClick={() => setShowCards(!showCards)} className="text-white/20 hover:text-white/40">
                  {showCards ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {showCards ? (
                <div className="flex items-center gap-3">
                  {state.holeCards.map((card: Card, i: number) => (
                    <CardView key={i} card={card} />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-24 h-36 rounded-xl bg-emerald-900/40 border border-emerald-500/20" />
                  <div className="w-24 h-36 rounded-xl bg-emerald-900/40 border border-emerald-500/20" />
                </div>
              )}
            </div>

            {/* Community cards (mini) */}
            {pub.communityCards && pub.communityCards.length > 0 && (
              <div className="flex items-center justify-center gap-2">
                {pub.communityCards.map((card: Card, i: number) => (
                  <CardView key={i} card={card} small />
                ))}
              </div>
            )}

            {/* Pot info */}
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="text-white/30">Pot: <span className="text-white/60 font-semibold tabular-nums">{pub.pot?.toLocaleString()}</span></span>
              {state.currentBet > 0 && (
                <span className="text-white/30">Your bet: <span className="text-white/60 tabular-nums">{state.currentBet}</span></span>
              )}
            </div>

            {/* Hand result at showdown */}
            {state.handResult && (
              <div className="text-center px-4 py-2 rounded-lg bg-emerald-500/[0.08] border border-emerald-500/20">
                <span className="text-emerald-400 text-sm font-semibold">{state.handResult.label}</span>
              </div>
            )}

            {/* Action buttons */}
            {state.isActive && !state.folded && !actionSent && (
              <div className="flex flex-col gap-3 mt-auto">
                {/* Raise slider */}
                {raiseAction && raiseAction.minAmount !== undefined && raiseAction.maxAmount !== undefined && (
                  <div className="flex flex-col gap-2.5 px-1">
                    <div className="flex items-center justify-between">
                      <span className="text-white/40 text-xs font-medium uppercase tracking-wider">Raise to</span>
                      <span className="text-white font-bold text-lg tabular-nums">
                        {(raiseAmount || raiseAction.minAmount).toLocaleString()}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="range"
                        min={raiseAction.minAmount}
                        max={raiseAction.maxAmount}
                        step={Math.max(1, Math.floor((raiseAction.maxAmount - raiseAction.minAmount) / 20))}
                        value={raiseAmount || raiseAction.minAmount}
                        onChange={(e) => setRaiseAmount(Number(e.target.value))}
                        className="w-full h-2 rounded-full appearance-none cursor-pointer bg-white/[0.06]"
                        style={{
                          background: `linear-gradient(to right, #059669 0%, #059669 ${((raiseAmount || raiseAction.minAmount) - raiseAction.minAmount) / (raiseAction.maxAmount - raiseAction.minAmount) * 100}%, rgba(255,255,255,0.06) ${((raiseAmount || raiseAction.minAmount) - raiseAction.minAmount) / (raiseAction.maxAmount - raiseAction.minAmount) * 100}%, rgba(255,255,255,0.06) 100%)`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-white/20 tabular-nums">
                      <span>{raiseAction.minAmount.toLocaleString()}</span>
                      <span>{raiseAction.maxAmount.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-2.5">
                  {state.availableActions.map((action: AvailableAction) => (
                    <ActionButton
                      key={action.action}
                      action={action}
                      onPress={handleAction}
                      playerColor={playerColor}
                      disabled={actionSent}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Waiting for turn / folded */}
            {!state.isActive && !state.folded && isBettingPhase && (
              <div className="flex flex-col items-center justify-center gap-3 mt-auto py-6">
                <p className="text-white/30 text-sm">Waiting for your turn…</p>
              </div>
            )}

            {state.folded && (
              <div className="flex flex-col items-center justify-center gap-3 mt-auto py-6">
                <p className="text-white/40 text-lg font-semibold">Folded</p>
                <p className="text-white/20 text-sm">Watch the action on TV</p>
              </div>
            )}

            {actionSent && !state.folded && (
              <div className="flex flex-col items-center justify-center gap-3 mt-auto py-6">
                <p className="text-white/40 text-sm">Action sent</p>
              </div>
            )}
          </div>
        )}

        {/* SHOWDOWN */}
        {phase.phaseType === THPhase.SHOWDOWN && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Monitor size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Showdown</p>
              {state.handResult && (
                <p className="text-emerald-400/70 text-sm">{state.handResult.label}</p>
              )}
              <p className="text-white/30 text-sm mt-2">Look at the TV</p>
            </div>
          </div>
        )}

        {/* SCORES / GAME OVER */}
        {(phase.phaseType === THPhase.SCORES || phase.phaseType === PhaseType.GAME_OVER) && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              {phase.phaseType === PhaseType.GAME_OVER ? (
                <Trophy size={24} style={{ color: playerColor }} />
              ) : (
                <Monitor size={24} style={{ color: playerColor }} />
              )}
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">
                {phase.phaseType === PhaseType.GAME_OVER ? 'Game Over' : 'Standings'}
              </p>
              <p className="text-white/30 text-sm">Check the TV for results</p>
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

export default THPhone;
