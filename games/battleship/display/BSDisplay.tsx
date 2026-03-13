import type { DisplayProps } from '@display/games/types';
import type { BSPublicState, PlacedShip } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { BSPhase } from '../phases.js';
import { Anchor, Trophy } from 'lucide-react';

// ── Column labels A–J ─────────────────────────────────────────────────────────
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ── Timer bar ─────────────────────────────────────────────────────────────────
function TimerBar({ ms, totalMs }: { ms: number; totalMs: number }) {
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (ms / totalMs) * 100)) : 0;
  const seconds = Math.ceil(ms / 1000);
  const isUrgent = seconds <= 5;
  return (
    <div className="w-full h-1 bg-white/[0.04] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(56,189,248,0.5)' }}
      />
    </div>
  );
}

// ── Score list ────────────────────────────────────────────────────────────────
function ScoreList({ scores }: { scores: { playerId: string; playerName: string; playerColor: string; score: number; roundScore?: number }[] }) {
  return (
    <div className="w-full flex flex-col divide-y divide-white/[0.04]">
      {scores.map((entry, index) => (
        <div key={entry.playerId} className="flex items-center gap-4 py-5">
          <span className="w-6 text-right text-white/20 text-lg font-medium tabular-nums">{index + 1}</span>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
            style={{ backgroundColor: entry.playerColor }}
          >
            {entry.playerName.charAt(0).toUpperCase()}
          </div>
          <span className="text-white/80 text-lg font-medium flex-1 truncate">{entry.playerName}</span>
          {entry.roundScore !== undefined && entry.roundScore > 0 && (
            <span className="text-sky-400/50 text-sm font-medium tabular-nums">+{entry.roundScore}</span>
          )}
          <span className="text-white text-xl font-semibold tabular-nums">{entry.score.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── Cell type resolution ───────────────────────────────────────────────────────
type CellRenderState = 'empty' | 'ship' | 'hit' | 'miss' | 'sunk';

function getCellState(
  cell: string,
  hits: string[],
  misses: string[],
  sunkShips: PlacedShip[],
  showShips?: PlacedShip[],   // for result phase — show all ships
): CellRenderState {
  // Check sunk first (sunk cells are always 'sunk')
  if (sunkShips.some(s => s.cells.includes(cell))) return 'sunk';
  if (hits.includes(cell)) return 'hit';
  if (misses.includes(cell)) return 'miss';
  if (showShips?.some(s => s.cells.includes(cell))) return 'ship';
  return 'empty';
}

// ── Grid cell colors ──────────────────────────────────────────────────────────
function cellBg(state: CellRenderState): string {
  switch (state) {
    case 'sunk':  return 'bg-red-900/80 border-red-700/60';
    case 'hit':   return 'bg-red-500/70 border-red-400/60';
    case 'miss':  return 'bg-slate-400/20 border-slate-400/30';
    case 'ship':  return 'bg-sky-800/50 border-sky-600/30';
    default:      return 'bg-sky-950/40 border-sky-900/30';
  }
}

// ── Single 10×10 board ────────────────────────────────────────────────────────
interface BoardProps {
  hits: string[];
  misses: string[];
  sunkShips: PlacedShip[];
  revealShips?: PlacedShip[];   // result phase: show all ships
  isActive: boolean;
  label: string;
  shipsRemaining: number;
  playerColor: string;
  lastShotCell?: string;        // flash the last shot
}

function BattleGrid({
  hits, misses, sunkShips, revealShips,
  isActive, label, shipsRemaining, playerColor, lastShotCell,
}: BoardProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      {/* Player label */}
      <div
        className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-semibold transition-all duration-300 ${
          isActive
            ? 'border-sky-400/40 bg-sky-400/10 text-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.2)]'
            : 'border-white/[0.07] bg-white/[0.03] text-white/50'
        }`}
      >
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: playerColor }} />
        <span>{label}</span>
        <span className={`ml-1 text-xs ${isActive ? 'text-sky-400/70' : 'text-white/20'}`}>
          ⚓ {shipsRemaining}
        </span>
      </div>

      {/* Col labels */}
      <div className="flex">
        <div className="w-5" /> {/* row label spacer */}
        {COLS.map(c => (
          <div key={c} className="w-7 h-4 flex items-center justify-center text-[9px] font-medium text-white/25 select-none">
            {c}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {ROWS.map(row => (
        <div key={row} className="flex items-center">
          {/* Row label */}
          <div className="w-5 h-7 flex items-center justify-center text-[9px] font-medium text-white/25 select-none">
            {row}
          </div>
          {COLS.map(col => {
            const cell = `${col}${row}`;
            const cs = getCellState(cell, hits, misses, sunkShips, revealShips);
            const isLastShot = cell === lastShotCell;
            return (
              <div
                key={cell}
                className={`w-7 h-7 border rounded-[2px] flex items-center justify-center transition-all duration-300 ${cellBg(cs)} ${
                  isLastShot ? 'ring-1 ring-yellow-400/60' : ''
                }`}
              >
                {cs === 'hit' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                )}
                {cs === 'sunk' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-red-800" />
                )}
                {cs === 'miss' && (
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400/60" />
                )}
                {cs === 'ship' && (
                  <div className="w-4 h-3 rounded-[1px] bg-sky-500/50" />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main display component ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BSDisplay({ phase, publicState, scores, timerMs, useGameEvent: _useGameEvent }: DisplayProps) {
  const state = publicState as unknown as BSPublicState;
  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 30;
  const isUrgent = seconds !== null && seconds <= 5;

  const lastShotCell = state.lastShot?.cell;

  return (
    <div className="flex flex-col h-full w-full bg-[#06080f] relative overflow-hidden">
      {/* Nautical ambient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-950/20 via-[#06080f] to-[#06080f] pointer-events-none" />

      {/* Timer bar */}
      {timerMs !== null && phase.timerTotalMs !== null && (
        <div className="relative z-20 flex-shrink-0">
          <TimerBar ms={timerMs} totalMs={phase.timerTotalMs} />
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-10 pt-5 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <Anchor size={16} className="text-white/15" />
          <span className="text-white/20 text-sm font-medium tracking-wider">Battleship</span>
        </div>
        <span className="text-white/20 text-sm font-medium tabular-nums">
          {phase.phaseType === BSPhase.BATTLE ? `Turn ${state.turnNumber}` : ''}
        </span>
        {seconds !== null ? (
          <span className={`text-base font-semibold tabular-nums transition-colors ${isUrgent ? 'text-red-400' : 'text-white/20'}`}>
            {seconds}s
          </span>
        ) : <div className="w-8" />}
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-col flex-1 items-center justify-center pb-8 overflow-hidden px-6">

        {/* ── SETUP PHASE ── */}
        {phase.phaseType === BSPhase.SETUP && (
          <div className="flex flex-col items-center gap-8 max-w-2xl w-full text-center">
            <div>
              <h1 className="text-5xl font-bold text-white tracking-tight mb-3">Fleet Positioning</h1>
              <p className="text-white/30 text-lg">Captains are placing their ships…</p>
            </div>
            {state.player1 && state.player2 && state.readyStatus && (
              <div className="flex gap-8 justify-center">
                {[state.player1, state.player2].map(p => {
                  const ready = state.readyStatus?.[p.playerId] ?? false;
                  return (
                    <div key={p.playerId} className={`flex items-center gap-3 px-6 py-4 rounded-2xl border ${ready ? 'bg-sky-500/[0.08] border-sky-500/25' : 'bg-white/[0.03] border-white/[0.07]'}`}>
                      <div className={`w-3 h-3 rounded-full ${ready ? 'bg-sky-400' : 'bg-white/15'}`} />
                      <span className={`text-base font-medium ${ready ? 'text-sky-300' : 'text-white/50'}`}>
                        {p.playerName}
                      </span>
                      <span className={`text-sm ${ready ? 'text-sky-400/70' : 'text-white/25'}`}>
                        {ready ? 'Ready' : 'Placing…'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BATTLE PHASE ── */}
        {phase.phaseType === BSPhase.BATTLE && state.player1 && state.player2 && (
          <div className="flex flex-col items-center gap-5 w-full">
            {/* Active player indicator */}
            {state.lastShot && (
              <div className={`px-5 py-2 rounded-full text-sm font-medium border ${
                state.lastShot.result === 'hit'
                  ? 'bg-red-500/10 border-red-500/30 text-red-300'
                  : 'bg-white/[0.04] border-white/[0.08] text-white/40'
              }`}>
                {state.lastShot.cell} — {state.lastShot.result === 'hit'
                  ? (state.lastShot.sunkShip ? `💥 SUNK!` : '🔴 HIT!')
                  : '💧 Miss'}
              </div>
            )}

            {/* Two grids side by side */}
            <div className="flex items-start gap-10 justify-center">
              <BattleGrid
                hits={state.player1.board.hits}
                misses={state.player1.board.misses}
                sunkShips={state.player1.board.sunkShips}
                isActive={state.activePlayerId === state.player1.playerId}
                label={state.player1.playerName}
                shipsRemaining={state.player1.board.shipsRemaining}
                playerColor="#38bdf8"
                lastShotCell={state.lastShot?.playerId !== state.player1.playerId ? lastShotCell : undefined}
              />
              <div className="flex flex-col items-center gap-2 self-center text-white/15 text-2xl font-light">
                VS
              </div>
              <BattleGrid
                hits={state.player2.board.hits}
                misses={state.player2.board.misses}
                sunkShips={state.player2.board.sunkShips}
                isActive={state.activePlayerId === state.player2.playerId}
                label={state.player2.playerName}
                shipsRemaining={state.player2.board.shipsRemaining}
                playerColor="#f472b6"
                lastShotCell={state.lastShot?.playerId !== state.player2.playerId ? lastShotCell : undefined}
              />
            </div>
          </div>
        )}

        {/* ── RESULT PHASE ── */}
        {phase.phaseType === BSPhase.RESULT && state.player1 && state.player2 && (
          <div className="flex flex-col items-center gap-6 w-full">
            {scores[0] && (
              <div className="text-center">
                <p className="text-white/25 text-sm font-medium tracking-widest uppercase mb-2">Victory</p>
                <h1 className="text-6xl font-bold text-white tracking-tight mb-2">{scores[0].playerName} Wins!</h1>
                <Trophy size={28} className="inline text-yellow-400/60" />
              </div>
            )}
            {/* Both grids fully revealed */}
            <div className="flex items-start gap-10 justify-center">
              <BattleGrid
                hits={state.player1.board.hits}
                misses={state.player1.board.misses}
                sunkShips={state.player1.board.sunkShips}
                revealShips={state.player1.board.sunkShips}
                isActive={false}
                label={state.player1.playerName}
                shipsRemaining={state.player1.board.shipsRemaining}
                playerColor="#38bdf8"
              />
              <BattleGrid
                hits={state.player2.board.hits}
                misses={state.player2.board.misses}
                sunkShips={state.player2.board.sunkShips}
                revealShips={state.player2.board.sunkShips}
                isActive={false}
                label={state.player2.playerName}
                shipsRemaining={state.player2.board.shipsRemaining}
                playerColor="#f472b6"
              />
            </div>
          </div>
        )}

        {/* ── SCORES PHASE ── */}
        {phase.phaseType === BSPhase.SCORES && (
          <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
            <div className="text-center">
              <p className="text-white/20 text-sm font-medium tracking-widest uppercase mb-2">Final Score</p>
              <h2 className="text-5xl font-bold text-white tracking-tight">Results</h2>
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

export default BSDisplay;
