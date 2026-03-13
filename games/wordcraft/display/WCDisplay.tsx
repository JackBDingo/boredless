import type { WCPublicState, WCPlayerInfo, LastWordResult } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { WCPhase } from '../phases.js';
import { WC_BOARD_SIZE, WC_PLAYING_TIME_SECONDS } from '../constants.js';
import { Trophy } from 'lucide-react';
import type { DisplayProps } from '@display/games/types';
import type { ScoreEntry } from '@boredless/shared';

// ============================================================
// Premium square config (local copy to avoid server-only import)
// ============================================================

type PremiumType = 'TW' | 'DW' | 'TL' | 'DL' | null;

const PREMIUM_SQUARES: Map<string, PremiumType> = new Map([
  ['0,0','TW'],['0,7','TW'],['0,14','TW'],['7,0','TW'],['7,14','TW'],['14,0','TW'],['14,7','TW'],['14,14','TW'],
  ['1,1','DW'],['2,2','DW'],['3,3','DW'],['4,4','DW'],
  ['1,13','DW'],['2,12','DW'],['3,11','DW'],['4,10','DW'],
  ['13,1','DW'],['12,2','DW'],['11,3','DW'],['10,4','DW'],
  ['13,13','DW'],['12,12','DW'],['11,11','DW'],['10,10','DW'],
  ['7,7','DW'],
  ['1,5','TL'],['1,9','TL'],
  ['5,1','TL'],['5,5','TL'],['5,9','TL'],['5,13','TL'],
  ['9,1','TL'],['9,5','TL'],['9,9','TL'],['9,13','TL'],
  ['13,5','TL'],['13,9','TL'],
  ['0,3','DL'],['0,11','DL'],
  ['2,6','DL'],['2,8','DL'],
  ['3,0','DL'],['3,7','DL'],['3,14','DL'],
  ['6,2','DL'],['6,6','DL'],['6,8','DL'],['6,12','DL'],
  ['7,3','DL'],['7,11','DL'],
  ['8,2','DL'],['8,6','DL'],['8,8','DL'],['8,12','DL'],
  ['11,0','DL'],['11,7','DL'],['11,14','DL'],
  ['12,6','DL'],['12,8','DL'],
  ['14,3','DL'],['14,11','DL'],
]);

function getPremium(row: number, col: number): PremiumType {
  return PREMIUM_SQUARES.get(`${row},${col}`) ?? null;
}

// ============================================================
// Sub-components
// ============================================================

function TimerBar({ seconds, totalSeconds }: { seconds: number; totalSeconds: number }) {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (seconds / totalSeconds) * 100)) : 0;
  const isUrgent = seconds <= 10;
  return (
    <div className="w-full h-1 bg-white/[0.04] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(251,191,36,0.5)' }}
      />
    </div>
  );
}

function ScoreList({ scores }: { scores: ScoreEntry[] }) {
  return (
    <div className="w-full flex flex-col divide-y divide-white/[0.04]">
      {scores.map((entry, index) => (
        <div key={entry.playerId} className="flex items-center justify-center gap-4 py-5">
          <span className="w-6 text-right text-white/20 text-lg font-medium tabular-nums">{index + 1}</span>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
            style={{ backgroundColor: entry.playerColor }}
          >
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
// Board rendering
// ============================================================

const PREMIUM_STYLES: Record<NonNullable<PremiumType>, { bg: string; text: string; label: string }> = {
  TW: { bg: 'bg-rose-700/80',    text: 'text-rose-200',    label: 'TW' },
  DW: { bg: 'bg-fuchsia-700/70', text: 'text-fuchsia-200', label: 'DW' },
  TL: { bg: 'bg-blue-700/80',    text: 'text-blue-200',    label: 'TL' },
  DL: { bg: 'bg-sky-700/70',     text: 'text-sky-200',     label: 'DL' },
};

interface BoardProps {
  board: WCPublicState['board'];
  lastWord: LastWordResult | null;
  highlightWord: boolean;
}

function Board({ board, lastWord, highlightWord }: BoardProps) {
  const highlightSet = new Set<string>();
  if (highlightWord && lastWord) {
    for (const { row, col } of lastWord.placedTiles) {
      highlightSet.add(`${row},${col}`);
    }
  }

  return (
    <div
      className="grid gap-[1px] bg-gray-800/60 rounded-lg overflow-hidden border border-white/[0.06] shadow-2xl"
      style={{ gridTemplateColumns: `repeat(${WC_BOARD_SIZE}, 1fr)` }}
    >
      {Array.from({ length: WC_BOARD_SIZE }, (_, row) =>
        Array.from({ length: WC_BOARD_SIZE }, (_, col) => {
          const cell = board?.[row]?.[col];
          const tile = cell?.tile ?? null;
          const premium = getPremium(row, col);
          const isCenter = row === 7 && col === 7;
          const key = `${row},${col}`;
          const isHighlighted = highlightSet.has(key);

          if (tile) {
            const letter = tile.isBlank ? (tile.letter || '?') : tile.letter;
            const points = tile.points;
            return (
              <div
                key={key}
                className={`aspect-square flex items-center justify-center relative ${
                  isHighlighted
                    ? 'bg-amber-400 shadow-[0_0_8px_2px_rgba(251,191,36,0.6)] animate-pulse'
                    : 'bg-amber-200/90'
                }`}
              >
                <span
                  className={`font-bold leading-none select-none ${isHighlighted ? 'text-amber-900' : 'text-stone-800'}`}
                  style={{ fontSize: 'clamp(7px, 1.4vw, 18px)' }}
                >
                  {letter}
                </span>
                {points > 0 && (
                  <span
                    className="absolute bottom-[1px] right-[2px] font-semibold text-stone-600/80 leading-none"
                    style={{ fontSize: 'clamp(4px, 0.6vw, 8px)' }}
                  >
                    {points}
                  </span>
                )}
              </div>
            );
          }

          if (isCenter) {
            return (
              <div key={key} className="aspect-square flex items-center justify-center bg-fuchsia-700/70">
                <span className="text-fuchsia-200 select-none" style={{ fontSize: 'clamp(8px, 1.6vw, 20px)' }}>
                  ★
                </span>
              </div>
            );
          }

          if (premium && !cell?.premiumUsed) {
            const { bg, text, label } = PREMIUM_STYLES[premium];
            return (
              <div key={key} className={`aspect-square flex items-center justify-center ${bg}`}>
                <span
                  className={`font-bold leading-none select-none ${text}`}
                  style={{ fontSize: 'clamp(4px, 0.75vw, 9px)', letterSpacing: '-0.02em' }}
                >
                  {label}
                </span>
              </div>
            );
          }

          return <div key={key} className="aspect-square bg-gray-900/80" />;
        })
      )}
    </div>
  );
}

// ============================================================
// Sidebar
// ============================================================

function Sidebar({
  players,
  currentPlayerId,
  tilesInBag,
  turnOrder,
}: {
  players: WCPlayerInfo[];
  currentPlayerId: string | null;
  tilesInBag: number;
  turnOrder: string[];
}) {
  const ordered = [...players].sort((a, b) => {
    const ai = turnOrder.indexOf(a.playerId);
    const bi = turnOrder.indexOf(b.playerId);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <div className="flex flex-col gap-4 w-44 flex-shrink-0">
      <div className="flex flex-col gap-2">
        {ordered.map((p) => {
          const isCurrent = p.playerId === currentPlayerId;
          return (
            <div
              key={p.playerId}
              className={`flex flex-col px-3 py-2 rounded-xl border transition-all ${
                isCurrent
                  ? 'bg-amber-500/[0.12] border-amber-500/40'
                  : 'bg-white/[0.02] border-white/[0.06]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-semibold truncate ${isCurrent ? 'text-amber-300' : 'text-white/60'}`}>
                  {p.playerName}
                </span>
                {isCurrent && (
                  <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                    TURN
                  </span>
                )}
              </div>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className={`text-xl font-bold tabular-nums ${isCurrent ? 'text-amber-200' : 'text-white/70'}`}>
                  {p.score.toLocaleString()}
                </span>
                <span className="text-xs text-white/25 tabular-nums">{p.tilesInRack}▪</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1 px-3 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
        <span className="text-white/25 text-[10px] font-medium tracking-widest uppercase">Bag</span>
        <span className="text-white/60 text-3xl font-bold tabular-nums">{tilesInBag}</span>
        <span className="text-white/20 text-[10px]">tiles left</span>
      </div>
    </div>
  );
}

// ============================================================
// Word reveal banner
// ============================================================

function WordRevealBanner({ lastWord }: { lastWord: LastWordResult }) {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
      <div className="flex flex-col items-center gap-1.5 px-8 py-4 rounded-2xl border border-amber-500/40 bg-gray-950/90 shadow-[0_0_40px_0px_rgba(251,191,36,0.25)] backdrop-blur-sm">
        <span className="text-amber-400/60 text-xs font-medium tracking-widest uppercase">
          {lastWord.playerName}
        </span>
        <span className="text-5xl font-black tracking-wider text-white drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]">
          {lastWord.word.toUpperCase()}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-amber-300 text-2xl font-bold tabular-nums">+{lastWord.score}</span>
          <span className="text-amber-400/50 text-sm">pts</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main display component
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function WCDisplay({ phase, publicState, scores, timerMs, useGameEvent: _useGameEvent }: DisplayProps) {
  const state = publicState as unknown as WCPublicState;
  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : WC_PLAYING_TIME_SECONDS;
  const isUrgent = seconds !== null && seconds <= 10;

  const isPlayingPhase = phase.phaseType === WCPhase.PLAYING || phase.phaseType === WCPhase.WORD_REVEAL;

  return (
    <div className="flex flex-col h-full w-full bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-amber-950/15 via-gray-950 to-gray-950 pointer-events-none" />

      {seconds !== null && (
        <div className="relative z-20 flex-shrink-0">
          <TimerBar seconds={seconds} totalSeconds={totalSeconds} />
        </div>
      )}

      <header className="relative z-10 flex items-center justify-between px-10 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-2xl select-none">🔤</span>
          <span className="text-white/20 text-sm font-medium tracking-wider">WordCraft</span>
        </div>

        {state?.roundNumber > 0 && (
          <span className="absolute left-1/2 -translate-x-1/2 text-white/20 text-sm font-medium tracking-widest">
            Round {state.roundNumber}
          </span>
        )}

        {seconds !== null ? (
          <span className={`text-base font-semibold tabular-nums transition-colors ${isUrgent ? 'text-red-400' : 'text-white/20'}`}>
            {seconds}s
          </span>
        ) : (
          <div className="w-8" />
        )}
      </header>

      <main className="relative z-10 flex flex-col flex-1 items-center justify-center px-8 pb-8 overflow-hidden">

        {/* WC_STARTING */}
        {phase.phaseType === WCPhase.STARTING && (
          <div className="flex flex-col items-center gap-10 w-full max-w-2xl">
            <div className="text-center">
              <p className="text-amber-400/40 text-xs font-medium tracking-widest uppercase mb-3">Get Ready</p>
              <h2 className="text-7xl font-black text-white tracking-tight">
                {seconds !== null && seconds > 0 ? seconds : '🚀'}
              </h2>
              <p className="text-white/30 text-lg mt-4">Game starting…</p>
            </div>
            {state?.players && state.players.length > 0 && (
              <div className="flex flex-wrap justify-center gap-3">
                {[...state.players]
                  .sort((a, b) => {
                    const ai = state.turnOrder?.indexOf(a.playerId) ?? 99;
                    const bi = state.turnOrder?.indexOf(b.playerId) ?? 99;
                    return ai - bi;
                  })
                  .map((p, i) => (
                    <div key={p.playerId} className="flex flex-col items-center gap-1.5 px-6 py-3 rounded-2xl border bg-white/[0.03] border-white/[0.08]">
                      <span className="text-white/20 text-xs tabular-nums">#{i + 1}</span>
                      <span className="text-white/80 font-semibold text-lg">{p.playerName}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* WC_PLAYING + WC_WORD_REVEAL */}
        {isPlayingPhase && state?.board && (
          <div className="flex items-start gap-6 w-full h-full">
            <div className="flex-1 min-w-0 flex items-center justify-center relative">
              <div className="w-full" style={{ maxWidth: 'min(100%, calc(100vh - 180px))' }}>
                <Board
                  board={state.board}
                  lastWord={state.lastWord}
                  highlightWord={phase.phaseType === WCPhase.WORD_REVEAL}
                />
              </div>
              {phase.phaseType === WCPhase.WORD_REVEAL && state.lastWord && (
                <WordRevealBanner lastWord={state.lastWord} />
              )}
            </div>
            <Sidebar
              players={state.players ?? []}
              currentPlayerId={state.currentPlayerId}
              tilesInBag={state.tilesInBag ?? 0}
              turnOrder={state.turnOrder ?? []}
            />
          </div>
        )}

        {/* WC_SCORES */}
        {phase.phaseType === WCPhase.SCORES && (
          <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
            <div className="text-center">
              <p className="text-amber-400/40 text-sm font-medium tracking-widest uppercase mb-2">Scores</p>
              <h2 className="text-5xl font-bold text-white tracking-tight">Standings</h2>
            </div>
            <ScoreList scores={scores} />
          </div>
        )}

        {/* GAME_OVER */}
        {phase.phaseType === PhaseType.GAME_OVER && (
          <div className="flex flex-col items-center gap-10 w-full max-w-2xl">
            <div className="text-center">
              <p className="text-amber-400/40 text-sm font-medium tracking-widest uppercase mb-4">Final</p>
              <h1 className="text-7xl font-bold text-white tracking-tight mb-6">Game Over</h1>
              {scores[0] && (
                <div className="flex items-center justify-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                    style={{ backgroundColor: scores[0].playerColor }}
                  >
                    {scores[0].playerName.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-white/50 text-2xl font-medium">
                    {scores[0].playerName}{' '}
                    <span className="text-white/25 font-normal">wins</span>
                  </p>
                  <Trophy size={20} className="text-amber-400/40" />
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

export default WCDisplay;
