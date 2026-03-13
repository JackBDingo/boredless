import { useState, useEffect } from 'react';
import type { CAHPrivateState, CAHPublicState, CAHAnonymousSubmission, CAHRevealedSubmission, CAHWhiteCard } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { CAHPhase } from '../phases.js';
import { Check, Monitor, Trophy, Layers, Star, Crown } from 'lucide-react';
import { PoweredByLogo } from '@phone/components/PoweredByLogo';
import type { PhoneProps } from '@phone/games/types';

const SUBMISSION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function TimerBar({ seconds, totalSeconds }: { seconds: number; totalSeconds: number }) {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (seconds / totalSeconds) * 100)) : 0;
  const isUrgent = seconds <= 5;
  return (
    <div className="w-full h-[3px] bg-white/[0.06] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(255,255,255,0.3)' }}
      />
    </div>
  );
}

/* Black card for phone — centered, bold, prominent */
function MiniBlackCard({ text, pick }: { text: string; pick: number }) {
  const parts = text.split('_');
  return (
    <div className="bg-black rounded-2xl px-6 py-5 border border-white/10 w-full text-center">
      {pick > 1 && (
        <div className="flex items-center justify-center gap-1.5 mb-3">
          {Array.from({ length: pick }).map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-white/40" />
          ))}
          <span className="text-white/30 text-[11px] ml-0.5">Pick {pick}</span>
        </div>
      )}
      <p className="text-white text-xl font-black leading-snug">
        {parts.length === 1 ? text : parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && <span className="inline-block border-b-2 border-white/40 w-20 mx-1 align-middle" />}
          </span>
        ))}
      </p>
    </div>
  );
}

/* Tappable white card in hand — actual card shape */
function HandCard({
  card,
  selected,
  selectionOrder,
  onTap,
  disabled,
}: {
  card: CAHWhiteCard;
  selected: boolean;
  selectionOrder?: number;
  onTap: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onTap}
      disabled={disabled && !selected}
      className={`relative rounded-2xl border-2 p-4 text-left transition-all duration-150 active:scale-[0.96] aspect-[3/4] ${
        selected
          ? 'bg-white border-white shadow-xl shadow-white/10 -translate-y-1'
          : 'bg-white/95 border-white/20 shadow-md'
      } ${disabled && !selected ? 'opacity-30 scale-[0.97]' : ''}`}
    >
      <p className={`text-sm font-bold leading-snug ${selected ? 'text-gray-900' : 'text-gray-700'}`}>
        {card.text}
      </p>
      {selected && selectionOrder !== undefined && (
        <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center">
          <span className="text-white text-xs font-bold">{selectionOrder}</span>
        </div>
      )}
    </button>
  );
}

/* Czar submission card — card-shaped, not a full-width bar */
function SubmissionCard({
  submission,
  letter,
  selected,
  onTap,
  disabled,
}: {
  submission: CAHAnonymousSubmission;
  letter: string;
  selected: boolean;
  onTap: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onTap}
      disabled={disabled}
      className={`relative rounded-2xl border-2 p-4 text-left transition-all duration-150 active:scale-[0.96] aspect-[3/4] ${
        selected
          ? 'bg-white border-yellow-400 shadow-xl shadow-yellow-400/10 -translate-y-1'
          : 'bg-white/95 border-white/20 shadow-md'
      } ${disabled && !selected ? 'opacity-30 scale-[0.97]' : ''}`}
    >
      <span className={`absolute top-3 left-3 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
        selected ? 'bg-yellow-400 text-gray-900' : 'bg-gray-100 text-gray-400'
      }`}>
        {letter}
      </span>
      {selected && (
        <div className="absolute top-3 right-3">
          <Check size={16} className="text-yellow-500" />
        </div>
      )}
      <div className="flex flex-col gap-1 pt-8">
        {submission.cards.map((card, i) => (
          <p key={i} className="text-gray-900 text-sm font-bold leading-snug">
            {card.text}
          </p>
        ))}
      </div>
    </button>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CAHPhone({ phase, privateState, publicState, timerMs, submitInput, myPlayer, useGameEvent: _useGameEvent }: PhoneProps) {
  const state = privateState as unknown as CAHPrivateState;
  const pub = publicState as unknown as CAHPublicState;
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [czarPicked, setCzarPicked] = useState(false);

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 60;
  const isUrgent = seconds !== null && seconds <= 5;
  const playerColor = myPlayer?.playerColor ?? '#ffffff';
  const pick = pub.currentBlackCard?.pick ?? 1;

  // Reset local state on phase changes
  useEffect(() => {
    setSelectedCardIds([]);
    setSelectedSubmissionId(null);
    setSubmitted(false);
    setCzarPicked(false);
  }, [phase.phaseType, phase.roundNumber]);

  const toggleCard = (cardId: string) => {
    setSelectedCardIds(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= pick) return [...prev.slice(0, pick - 1), cardId];
      return [...prev, cardId];
    });
  };

  const handleSubmit = () => {
    if (selectedCardIds.length !== pick) return;
    submitInput('vote', { answerId: selectedCardIds });
    setSubmitted(true);
  };

  const handleCzarPick = (submissionId: string) => {
    if (czarPicked) return;
    setSelectedSubmissionId(submissionId);
    submitInput('vote', { answerId: submissionId });
    setCzarPicked(true);
  };

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 relative overflow-y-auto">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 120% 40% at 50% 0%, ${playerColor}12 0%, transparent 100%)` }}
      />

      {seconds !== null && (
        <div className="relative z-20">
          <TimerBar seconds={seconds} totalSeconds={totalSeconds} />
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: playerColor }} />
          <span className="text-white/40 text-sm font-medium">{myPlayer?.playerName ?? ''}</span>
          {state.isCzar && <Crown size={12} className="text-yellow-400/60" />}
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

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1 px-5 pb-24 gap-4">

        {/* DEAL */}
        {phase.phaseType === CAHPhase.DEAL && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="flex -space-x-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="w-10 h-14 bg-black rounded-lg border border-white/15 shadow-lg"
                  style={{ transform: `rotate(${(i - 2) * 6}deg)`, zIndex: i }}
                />
              ))}
            </div>
            <p className="text-white text-lg font-semibold">Dealing cards…</p>
            {state.isCzar && (
              <div className="px-4 py-2 rounded-full bg-yellow-400/10 border border-yellow-400/20">
                <p className="text-yellow-400/80 text-xs font-bold tracking-widest uppercase">You're the Card Czar</p>
              </div>
            )}
          </div>
        )}

        {/* PROMPT: Czar waiting */}
        {phase.phaseType === CAHPhase.PROMPT && state.isCzar && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="px-4 py-2 rounded-full bg-yellow-400/10 border border-yellow-400/20">
              <p className="text-yellow-400/80 text-xs font-bold tracking-widest uppercase">Card Czar</p>
            </div>
            <p className="text-white/30 text-sm text-center">Waiting for players to submit…</p>
            {pub.currentBlackCard && (
              <div className="w-full mt-2">
                <MiniBlackCard text={pub.currentBlackCard.text} pick={pub.currentBlackCard.pick} />
              </div>
            )}
            <div className="flex flex-col items-center gap-2 mt-2">
              <div className="flex gap-2">
                {Array.from({ length: pub.totalNonCzarPlayers }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                      i < pub.submittedCount ? 'bg-white/60' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <p className="text-white/25 text-sm tabular-nums">{pub.submittedCount}/{pub.totalNonCzarPlayers} submitted</p>
            </div>
          </div>
        )}

        {/* PROMPT: Player selecting cards */}
        {phase.phaseType === CAHPhase.PROMPT && !state.isCzar && !state.hasSubmitted && !submitted && (
          <div className="flex flex-col flex-1 gap-4">
            {pub.currentBlackCard && (
              <MiniBlackCard text={pub.currentBlackCard.text} pick={pub.currentBlackCard.pick} />
            )}
            {pick > 1 && (
              <p className="text-white/30 text-xs text-center font-medium">
                Select {pick} cards · {selectedCardIds.length}/{pick} chosen
              </p>
            )}
            {/* Card grid — 2 columns, actual card shapes */}
            <div className="grid grid-cols-2 gap-3 auto-rows-min max-w-xs mx-auto w-full">
              {state.hand.map(card => {
                const isSelected = selectedCardIds.includes(card.id);
                const orderNum = isSelected ? selectedCardIds.indexOf(card.id) + 1 : undefined;
                return (
                  <HandCard
                    key={card.id}
                    card={card}
                    selected={isSelected}
                    selectionOrder={pick > 1 ? orderNum : undefined}
                    onTap={() => toggleCard(card.id)}
                    disabled={selectedCardIds.length >= pick && !isSelected}
                  />
                );
              })}
            </div>
            {/* Submit button */}
            <div className="sticky bottom-0 pb-2 pt-2">
              <button
                onClick={handleSubmit}
                disabled={selectedCardIds.length !== pick}
                className="w-full py-4 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-30"
                style={{
                  backgroundColor: selectedCardIds.length === pick ? '#fff' : 'rgba(255,255,255,0.06)',
                  color: selectedCardIds.length === pick ? '#000' : 'rgba(255,255,255,0.4)',
                }}
              >
                {selectedCardIds.length === pick
                  ? `Submit ${pick > 1 ? `${pick} cards` : 'card'}`
                  : `Choose ${pick - selectedCardIds.length} more`}
              </button>
            </div>
          </div>
        )}

        {/* PROMPT: Submitted waiting */}
        {phase.phaseType === CAHPhase.PROMPT && !state.isCzar && (state.hasSubmitted || submitted) && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <Check size={24} className="text-white/60" />
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">Submitted!</p>
              <p className="text-white/30 text-sm">Waiting for others…</p>
            </div>
          </div>
        )}

        {/* READING: Czar judging */}
        {phase.phaseType === CAHPhase.READING && state.isCzar && state.submissionsToJudge && (
          <div className="flex flex-col gap-4">
            {pub.currentBlackCard && (
              <MiniBlackCard text={pub.currentBlackCard.text} pick={pub.currentBlackCard.pick} />
            )}
            <p className="text-yellow-400/60 text-sm text-center font-bold tracking-wide">
              Pick the funniest answer
            </p>
            <div className="grid grid-cols-2 gap-3 auto-rows-min max-w-xs mx-auto w-full">
              {state.submissionsToJudge.map((sub: CAHAnonymousSubmission, i: number) => (
                <SubmissionCard
                  key={sub.submissionId}
                  submission={sub}
                  letter={SUBMISSION_LETTERS[i] ?? String(i + 1)}
                  selected={selectedSubmissionId === sub.submissionId}
                  onTap={() => handleCzarPick(sub.submissionId)}
                  disabled={czarPicked && selectedSubmissionId !== sub.submissionId}
                />
              ))}
            </div>
          </div>
        )}

        {/* READING: Non-czar waiting */}
        {phase.phaseType === CAHPhase.READING && !state.isCzar && (
          <div className="flex flex-col flex-1 gap-4">
            <div className="flex flex-col items-center justify-center gap-3 pt-8 pb-4">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Monitor size={24} className="text-white/30" />
              </div>
              <p className="text-white text-lg font-semibold">{pub.czarPlayerName} is choosing…</p>
              <p className="text-white/25 text-sm">Watch the TV</p>
            </div>
          </div>
        )}

        {/* REVEAL */}
        {phase.phaseType === CAHPhase.REVEAL && (
          <div className="flex flex-col flex-1 gap-4">
            {pub.winner && (
              <div className="text-center py-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Star size={14} className="text-yellow-400" />
                  <span className="text-yellow-400/80 text-xs font-bold tracking-widest uppercase">Winner</span>
                  <Star size={14} className="text-yellow-400" />
                </div>
                <p className="text-white text-3xl font-black">{pub.winner.playerName}</p>
                {pub.winner.playerId === myPlayer?.playerId && (
                  <p className="text-yellow-400/60 text-sm mt-2 font-medium">That's you! 🎉</p>
                )}
              </div>
            )}
            {state.revealedSubmissions && (
              <div className="flex flex-col gap-3">
                {state.revealedSubmissions.map((sub: CAHRevealedSubmission, i: number) => (
                  <div
                    key={sub.submissionId}
                    className={`rounded-2xl border-2 p-4 transition-all ${
                      sub.isWinner
                        ? 'border-yellow-400/50 bg-white shadow-lg shadow-yellow-400/5'
                        : 'border-white/10 bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                        sub.isWinner ? 'bg-yellow-400 text-gray-900' : 'bg-white/[0.06] text-white/25'
                      }`}>
                        {SUBMISSION_LETTERS[i] ?? String(i + 1)}
                      </span>
                      <div className="flex flex-col gap-0.5 flex-1">
                        {sub.cards.map((card, ci) => (
                          <p key={ci} className={`text-sm font-bold leading-snug ${sub.isWinner ? 'text-gray-900' : 'text-white/50'}`}>
                            {card.text}
                          </p>
                        ))}
                        <p className={`text-xs mt-1.5 font-medium ${sub.isWinner ? 'text-yellow-600/60' : 'text-white/20'}`}>
                          {sub.playerName}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCORES / GAME_OVER */}
        {(phase.phaseType === CAHPhase.SCORES || phase.phaseType === PhaseType.GAME_OVER) && (
          <div className="flex flex-col flex-1 items-center justify-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              {phase.phaseType === PhaseType.GAME_OVER
                ? <Trophy size={24} className="text-yellow-400/60" />
                : <Monitor size={24} className="text-white/30" />
              }
            </div>
            <div className="text-center">
              <p className="text-white text-xl font-semibold mb-1">
                {phase.phaseType === PhaseType.GAME_OVER ? 'Game Over' : 'Look at the TV'}
              </p>
              <p className="text-white/30 text-sm">
                {phase.phaseType === PhaseType.GAME_OVER ? 'Check the TV for final results' : 'Scores are up'}
              </p>
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

export default CAHPhone;
