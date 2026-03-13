// ============================================================
// CRIBBAGE — Phone Controller Component
// ============================================================

import { useState } from 'react';
import { PhaseType } from '@boredless/shared';
import { CRPhase } from '../phases.js';
import { SUIT_SYMBOLS, SUIT_COLORS } from '../constants.js';
import { Trophy, Monitor } from 'lucide-react';
import { PoweredByLogo } from '@phone/components/PoweredByLogo';
import type { PhoneProps } from '@phone/games/types';
import type { CRPrivateState, CRPublicState, Card, HandScore, ScoreItem } from '../types.js';

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function CardView({ card, faceDown, small, selected, disabled, onTap }: {
  card?: Card;
  faceDown?: boolean;
  small?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onTap?: () => void;
}) {
  const w = small ? 'w-14 h-20' : 'w-20 h-28';
  const base = `${w} rounded-xl relative overflow-hidden transition-all active:scale-[0.95]`;

  if (faceDown || !card) {
    return (
      <div className={`${base} bg-gradient-to-br from-emerald-900/60 to-emerald-800/40 border border-emerald-500/20 flex items-center justify-center`}>
        <div className="absolute inset-1.5 rounded-lg border border-emerald-500/15" />
        <div className="w-5 h-5 rounded-full border-2 border-emerald-500/25" />
      </div>
    );
  }

  const color = SUIT_COLORS[card.suit] ?? '#1e293b';
  const symbol = SUIT_SYMBOLS[card.suit] ?? '';
  const rankSize = small ? 'text-xs' : 'text-base';
  const suitCorner = small ? 'text-[10px]' : 'text-xs';
  const centerSize = small ? 'text-xl' : 'text-3xl';

  return (
    <button
      onClick={onTap}
      disabled={!onTap || disabled}
      className={`${base} bg-white border shadow-lg cursor-pointer
        ${selected ? 'border-emerald-400 shadow-emerald-400/30 shadow-md -translate-y-2 scale-105' : 'border-gray-200'}
        ${disabled ? 'opacity-40' : ''}
        ${onTap && !disabled ? 'cursor-pointer' : 'cursor-default'}
      `}
    >
      {selected && (
        <div className="absolute inset-0 bg-emerald-400/10 pointer-events-none" />
      )}
      <div className="absolute top-1 left-1.5 flex flex-col items-center leading-none">
        <span className={`${rankSize} font-bold`} style={{ color }}>{card.rank}</span>
        <span className={`${suitCorner} -mt-0.5`} style={{ color }}>{symbol}</span>
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${centerSize}`} style={{ color }}>{symbol}</span>
      </div>
      <div className="absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180">
        <span className={`${rankSize} font-bold`} style={{ color }}>{card.rank}</span>
        <span className={`${suitCorner} -mt-0.5`} style={{ color }}>{symbol}</span>
      </div>
    </button>
  );
}

function HandScoreBreakdown({ hs }: { hs: HandScore }) {
  if (hs.items.length === 0) {
    return (
      <div className="px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-center">
        <p className="text-white/30 text-sm">No score this hand</p>
      </div>
    );
  }
  return (
    <div className="px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-white/50 text-xs uppercase tracking-wider">Hand Score</span>
        <span className="text-emerald-400 font-bold text-lg">{hs.total} pts</span>
      </div>
      {hs.items.map((item: ScoreItem, i: number) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="text-white/40">{item.label}</span>
          <span className="text-white/60 font-semibold">+{item.points}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CRPhone({ phase, privateState, publicState, timerMs, submitInput, myPlayer, scores, useGameEvent: _useGameEvent }: PhoneProps) {
  const state = privateState as unknown as CRPrivateState;
  const pub = publicState as unknown as CRPublicState;

  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [actionSent, setActionSent] = useState(false);

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 30;
  const isUrgent = seconds !== null && seconds <= 5;
  const playerColor = myPlayer?.playerColor ?? '#10b981';

  const n = pub?.playerOrder?.length ?? 2;
  const discardCount = n === 2 ? 2 : 1;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleCardSelection = (cardId: string) => {
    setSelectedCards(prev => {
      if (prev.includes(cardId)) {
        return prev.filter(id => id !== cardId);
      }
      if (prev.length >= discardCount) {
        // Replace oldest selection
        return [...prev.slice(1), cardId];
      }
      return [...prev, cardId];
    });
  };

  const handleConfirmDiscard = () => {
    if (selectedCards.length !== discardCount) return;
    submitInput('vote', { action: 'discard', cardIds: selectedCards });
    setSelectedCards([]);
    setActionSent(true);
    setTimeout(() => setActionSent(false), 2000);
  };

  const handlePlayCard = (cardId: string) => {
    if (actionSent) return;
    submitInput('vote', { action: 'play_card', cardId });
    setActionSent(true);
    setTimeout(() => setActionSent(false), 1500);
  };

  const handleGo = () => {
    if (actionSent) return;
    submitInput('vote', { action: 'go' });
    setActionSent(true);
    setTimeout(() => setActionSent(false), 1500);
  };

  // ── Discard status ─────────────────────────────────────────────────────────
  const alreadyDiscarded = state?.cribCards?.length >= discardCount;
  const myScore = pub?.scores?.[myPlayer?.playerId ?? ''] ?? 0;

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 relative overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 120% 40% at 50% 0%, ${playerColor}15 0%, transparent 100%)` }} />

      {seconds !== null && (
        <div className="relative z-20">
          <TimerBar seconds={seconds} totalSeconds={totalSeconds} />
        </div>
      )}

      <header className="relative z-10 flex items-center justify-between px-5 pt-4 pb-2">
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
          <span className="text-white/20 text-xs tabular-nums">{myScore} pts</span>
        </div>
      </header>

      <div className="relative z-10 flex flex-col flex-1 px-5 pb-24">

        {/* DEALING */}
        {phase.phaseType === CRPhase.DEALING && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <span className="text-2xl">🃏</span>
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Cribbage</h2>
              <p className="text-white/30 text-sm max-w-xs leading-relaxed">
                Classic card game. Score points through pegging and hand combinations. First to 121 wins!
              </p>
            </div>
          </div>
        )}

        {/* DISCARD */}
        {phase.phaseType === CRPhase.DISCARD && state && (
          <div className="flex flex-col gap-5 pt-4">
            {alreadyDiscarded ? (
              <div className="flex flex-col flex-1 items-center justify-center gap-4 py-8">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/25">
                  <span className="text-xl">✓</span>
                </div>
                <p className="text-white/50 text-base font-medium">Cards sent to crib</p>
                <p className="text-white/25 text-sm">Waiting for others…</p>
                {/* Show crib cards */}
                <div className="flex gap-2 mt-2">
                  {state.cribCards.map((c: Card) => (
                    <CardView key={c.id} card={c} small />
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <p className="text-white/40 text-sm font-medium mb-1">
                    Choose {discardCount} card{discardCount > 1 ? 's' : ''} for the crib
                  </p>
                  <p className="text-white/20 text-xs">
                    Crib goes to {pub?.dealerName ?? 'dealer'}
                    {pub?.playerNames?.[myPlayer?.playerId ?? ''] === pub?.dealerName ? ' (you!)' : ''}
                  </p>
                </div>
                {/* Hand cards */}
                <div className="flex flex-wrap justify-center gap-2 py-2">
                  {state.hand.map((card: Card) => (
                    <CardView
                      key={card.id}
                      card={card}
                      selected={selectedCards.includes(card.id)}
                      onTap={() => toggleCardSelection(card.id)}
                    />
                  ))}
                </div>
                {/* Confirm button */}
                <button
                  onClick={handleConfirmDiscard}
                  disabled={selectedCards.length !== discardCount || actionSent}
                  className={`w-full py-4 rounded-2xl font-bold text-base tracking-wide shadow-lg transition-all active:scale-[0.95] disabled:opacity-30
                    ${selectedCards.length === discardCount ? 'bg-emerald-600 text-white' : 'bg-white/[0.06] text-white/40'}`}
                >
                  {actionSent ? 'Sent!' : `Send to Crib (${selectedCards.length}/${discardCount})`}
                </button>
              </>
            )}
          </div>
        )}

        {/* CUT */}
        {phase.phaseType === CRPhase.CUT && pub && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="text-center">
              <p className="text-white/30 text-sm mb-3">Starter card cut</p>
              {pub.starterCard && <CardView card={pub.starterCard} />}
            </div>
            {pub.lastPegPoints?.reason?.includes('Heels') && (
              <div className="px-5 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-center">
                <p className="text-amber-400 font-semibold text-sm">{pub.lastPegPoints.reason}</p>
                <p className="text-amber-400/60 text-xs mt-1">+{pub.lastPegPoints.points} pts → {pub.lastPegPoints.playerName}</p>
              </div>
            )}
            <p className="text-white/20 text-sm">Pegging starts soon…</p>
          </div>
        )}

        {/* PEGGING */}
        {phase.phaseType === CRPhase.PEGGING && state && (
          <div className="flex flex-col gap-5 pt-4">
            {/* Count display */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.07]">
              <span className="text-white/30 text-sm">Count</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-white tabular-nums">{pub?.pegCount ?? 0}</span>
                <span className="text-white/20 text-lg">/ 31</span>
              </div>
            </div>

            {/* Starter card */}
            {pub?.starterCard && (
              <div className="flex items-center gap-2">
                <span className="text-white/20 text-xs uppercase tracking-wider">Starter</span>
                <CardView card={pub.starterCard} small />
              </div>
            )}

            {/* Player's hand */}
            <div>
              <p className="text-white/30 text-xs uppercase tracking-widest mb-2">Your cards</p>
              {state.hand.length === 0 ? (
                <p className="text-white/20 text-sm py-4 text-center">No cards left to play</p>
              ) : (
                <div className="flex flex-wrap gap-2 py-1">
                  {state.hand.map((card: Card) => {
                    const isPlayable = state.playableCardIds?.includes(card.id);
                    const isMyTurn = state.isMyTurn;
                    return (
                      <CardView
                        key={card.id}
                        card={card}
                        disabled={!isMyTurn || !isPlayable || actionSent}
                        onTap={isMyTurn && isPlayable && !actionSent ? () => handlePlayCard(card.id) : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {/* Go button / waiting */}
            {state.isMyTurn && !actionSent && (
              <div className="flex flex-col gap-3">
                {state.canPlay ? (
                  <p className="text-white/40 text-sm text-center">Tap a highlighted card to play</p>
                ) : (
                  <button
                    onClick={handleGo}
                    className="w-full py-4 rounded-2xl font-bold text-base tracking-wide shadow-lg bg-amber-600 text-white active:scale-[0.95] transition-all"
                  >
                    Go! (No playable cards)
                  </button>
                )}
              </div>
            )}

            {!state.isMyTurn && (
              <p className="text-white/25 text-sm text-center mt-2">
                {pub?.activePlayerId && pub?.playerNames?.[pub.activePlayerId]
                  ? `${pub.playerNames[pub.activePlayerId]}'s turn…`
                  : 'Waiting…'}
              </p>
            )}

            {actionSent && (
              <p className="text-white/30 text-sm text-center mt-2">Action sent…</p>
            )}

            {/* Last peg points */}
            {pub?.lastPegPoints && (
              <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <p className="text-emerald-400 text-sm font-semibold">
                  {pub.lastPegPoints.playerName} +{pub.lastPegPoints.points} — {pub.lastPegPoints.reason}
                </p>
              </div>
            )}
          </div>
        )}

        {/* SCORING */}
        {phase.phaseType === CRPhase.SCORING && state && (
          <div className="flex flex-col gap-5 pt-4">
            <div className="text-center">
              <p className="text-white/30 text-sm mb-1">The Show</p>
              <h3 className="text-2xl font-bold text-white">Hand Scoring</h3>
            </div>
            {pub?.starterCard && (
              <div className="flex items-center gap-2">
                <span className="text-white/20 text-xs uppercase tracking-wider">Starter</span>
                <CardView card={pub.starterCard} small />
              </div>
            )}
            {/* Your scoring hand */}
            {state.cribCards && state.cribCards.length > 0 && (
              <div>
                <p className="text-white/20 text-xs uppercase tracking-widest mb-2">Your hand (scored)</p>
                <div className="flex flex-wrap gap-2">
                  {/* scoringHand is not in private state, but hand is empty so show cribCards context */}
                  {state.hand.length === 0 && state.cribCards.map((c: Card) => (
                    <CardView key={c.id} card={c} small />
                  ))}
                </div>
              </div>
            )}
            {state.handScore && <HandScoreBreakdown hs={state.handScore} />}
            {!state.handScore && (
              <div className="text-center py-6">
                <Monitor size={24} className="text-white/20 mx-auto mb-2" />
                <p className="text-white/30 text-sm">See the TV for all scores</p>
              </div>
            )}
          </div>
        )}

        {/* CRIB */}
        {phase.phaseType === CRPhase.CRIB && pub && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="text-center">
              <p className="text-white/30 text-sm mb-2">Crib Scoring</p>
              <h3 className="text-2xl font-bold text-white">{pub.dealerName}'s Crib</h3>
            </div>
            {pub.cribScore && <HandScoreBreakdown hs={pub.cribScore} />}
            <div className="text-center">
              <Monitor size={20} className="text-white/20 mx-auto mb-2" />
              <p className="text-white/25 text-sm">Watch the TV for the breakdown</p>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {phase.phaseType === CRPhase.RESULTS && pub && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            {pub.winner ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/25">
                  <Trophy size={24} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/30 text-sm mb-1">Winner!</p>
                  <h2 className="text-2xl font-bold text-white">{pub.winner.playerName}</h2>
                  <p className="text-white/25 text-sm mt-1">Reached 121 points!</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <Monitor size={28} className="text-white/20" />
                <p className="text-white/40 text-base font-medium">Round {pub.round} complete</p>
                <p className="text-white/20 text-sm">Your score: {myScore}</p>
              </div>
            )}
          </div>
        )}

        {/* SCORES */}
        {phase.phaseType === CRPhase.SCORES && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Monitor size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Standings</p>
              <p className="text-white/30 text-sm">Your score: {myScore}</p>
            </div>
          </div>
        )}

        {/* GAME OVER */}
        {phase.phaseType === PhaseType.GAME_OVER && (
          <div className="flex flex-col flex-1 items-center justify-center gap-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}>
              <Trophy size={24} style={{ color: playerColor }} />
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white mb-2">Game Over</h2>
              {scores[0] && (
                <p className="text-white/50 text-lg">{scores[0].playerName} wins!</p>
              )}
              <p className="text-white/25 text-sm mt-2">Your final score: {myScore}</p>
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

export default CRPhone;
