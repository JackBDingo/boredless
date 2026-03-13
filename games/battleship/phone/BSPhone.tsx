import { useState, useCallback } from 'react';
import type { PhoneProps } from '@phone/games/types';
import type { BSPrivateState, PlacedShip, Ship } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { BSPhase } from '../phases.js';
import { Anchor, RotateCcw, Trophy, Monitor, CheckCircle } from 'lucide-react';
import { PoweredByLogo } from '@phone/components/PoweredByLogo';

// ── Constants ──────────────────────────────────────────────────────────────────
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ── Timer bar ─────────────────────────────────────────────────────────────────
function TimerBar({ ms, totalMs }: { ms: number; totalMs: number }) {
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (ms / totalMs) * 100)) : 0;
  const isUrgent = ms <= 5000;
  return (
    <div className="w-full h-[3px] bg-white/[0.06] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(56,189,248,0.6)' }}
      />
    </div>
  );
}

// ── Utility: generate cells for a ship placement ───────────────────────────────
function buildShipCells(
  row: number,
  col: number,
  size: number,
  horizontal: boolean,
): string[] | null {
  const cells: string[] = [];
  for (let i = 0; i < size; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (r >= 10 || c >= 10 || r < 0 || c < 0) return null;
    cells.push(`${COLS[c]}${r + 1}`);
  }
  return cells;
}

// ── Utility: check if cells overlap with existing placed ships ────────────────
function overlaps(cells: string[], placedShips: PlacedShip[]): boolean {
  const occupied = new Set(placedShips.flatMap(s => s.cells));
  return cells.some(c => occupied.has(c));
}

// ── Setup phase: ship placement UI ───────────────────────────────────────────
interface SetupGridProps {
  placedShips: PlacedShip[];
  selectedShip: Ship | null;
  horizontal: boolean;
  hoveredCell: string | null;
  onCellTap: (cell: string) => void;
  onCellHover: (cell: string | null) => void;
  playerColor: string;
}

function SetupGrid({
  placedShips, selectedShip, horizontal, hoveredCell, onCellTap, onCellHover, playerColor,
}: SetupGridProps) {
  // Cells occupied by placed ships
  const occupiedCells = new Set(placedShips.flatMap(s => s.cells));

  // Preview cells for the hovered position
  let previewCells: string[] = [];
  let previewValid = false;
  if (selectedShip && hoveredCell) {
    const colIdx = COLS.indexOf(hoveredCell[0]!);
    const rowIdx = parseInt(hoveredCell.slice(1), 10) - 1;
    const cells = buildShipCells(rowIdx, colIdx, selectedShip.size, horizontal);
    if (cells) {
      previewCells = cells;
      previewValid = !overlaps(cells, placedShips);
    }
  }

  return (
    <div className="flex flex-col items-center select-none">
      {/* Col headers */}
      <div className="flex">
        <div className="w-5" />
        {COLS.map(c => (
          <div key={c} className="w-8 h-5 flex items-center justify-center text-[9px] text-white/25 font-medium">
            {c}
          </div>
        ))}
      </div>

      {/* Rows */}
      {ROWS.map(row => (
        <div key={row} className="flex items-center">
          <div className="w-5 h-8 flex items-center justify-center text-[9px] text-white/25 font-medium">
            {row}
          </div>
          {COLS.map(col => {
            const cell = `${col}${row}`;
            const isOccupied = occupiedCells.has(cell);
            const isPreview = previewCells.includes(cell);
            const isPreviewBad = isPreview && !previewValid;

            let bg = 'bg-sky-950/40 border-sky-900/30 active:bg-sky-800/40';
            if (isOccupied) bg = `border-sky-600/30`;
            if (isPreview && previewValid) bg = 'border-sky-400/50';
            if (isPreviewBad) bg = 'bg-red-900/40 border-red-700/40';

            return (
              <button
                key={cell}
                className={`w-8 h-8 aspect-square border rounded-[2px] flex items-center justify-center transition-all duration-75 ${bg}`}
                style={isOccupied ? { backgroundColor: `${playerColor}40`, borderColor: `${playerColor}60` } : isPreview && previewValid ? { backgroundColor: `${playerColor}30` } : undefined}
                onPointerEnter={() => onCellHover(cell)}
                onPointerLeave={() => onCellHover(null)}
                onClick={() => onCellTap(cell)}
                aria-label={cell}
              >
                {isOccupied && <div className="w-4 h-3 rounded-[1px]" style={{ backgroundColor: `${playerColor}80` }} />}
                {isPreview && previewValid && <div className="w-4 h-3 rounded-[1px] opacity-60" style={{ backgroundColor: playerColor }} />}
                {isPreviewBad && <div className="w-4 h-3 rounded-[1px] bg-red-500/60" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Battle phase: targeting grid ──────────────────────────────────────────────
interface TargetGridProps {
  hits: string[];
  misses: string[];
  sunkShips: PlacedShip[];
  firedCells: string[];
  selectedCell: string | null;
  onCellTap: (cell: string) => void;
  playerColor: string;
}

function TargetGrid({ hits, misses, sunkShips, firedCells, selectedCell, onCellTap, playerColor }: TargetGridProps) {
  const sunkCells = new Set(sunkShips.flatMap(s => s.cells));

  return (
    <div className="flex flex-col items-center select-none">
      {/* Col headers */}
      <div className="flex">
        <div className="w-5" />
        {COLS.map(c => (
          <div key={c} className="w-8 h-5 flex items-center justify-center text-[9px] text-white/25 font-medium">
            {c}
          </div>
        ))}
      </div>

      {ROWS.map(row => (
        <div key={row} className="flex items-center">
          <div className="w-5 h-8 flex items-center justify-center text-[9px] text-white/25 font-medium">
            {row}
          </div>
          {COLS.map(col => {
            const cell = `${col}${row}`;
            const isHit = hits.includes(cell);
            const isMiss = misses.includes(cell);
            const isSunk = sunkCells.has(cell);
            const isFired = firedCells.includes(cell);
            const isSelected = selectedCell === cell;
            const canTarget = !isFired;

            let bg = 'bg-sky-950/40 border-sky-900/30';
            if (isSunk) bg = 'bg-red-900/80 border-red-700/60';
            else if (isHit) bg = 'bg-red-600/60 border-red-500/50';
            else if (isMiss) bg = 'bg-slate-700/30 border-slate-600/30';
            else if (isSelected) bg = `border-2`;

            return (
              <button
                key={cell}
                disabled={!canTarget}
                className={`w-8 h-8 aspect-square border rounded-[2px] flex items-center justify-center transition-all duration-75 ${bg} ${canTarget && !isSelected ? 'active:bg-sky-700/40' : ''} ${!canTarget ? 'cursor-default' : ''}`}
                style={isSelected ? { borderColor: playerColor, backgroundColor: `${playerColor}30` } : undefined}
                onClick={() => canTarget && onCellTap(cell)}
                aria-label={cell}
              >
                {isSunk && <div className="w-3 h-3 rounded-full bg-red-800" />}
                {isHit && !isSunk && <div className="w-3 h-3 rounded-full bg-red-400" />}
                {isMiss && <div className="w-2 h-2 rounded-full bg-slate-400/50" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Own board thumbnail (inactive battle phase) ───────────────────────────────
interface OwnBoardMiniProps {
  ships: PlacedShip[];
  incomingShots: { cell: string; result: string }[];
  playerColor: string;
}

function OwnBoardMini({ ships, incomingShots, playerColor }: OwnBoardMiniProps) {
  const shipCells = new Set(ships.flatMap(s => s.cells));
  const hitCells = new Set(incomingShots.filter(s => s.result === 'hit').map(s => s.cell));
  const missCells = new Set(incomingShots.filter(s => s.result === 'miss').map(s => s.cell));
  const sunkCells = new Set(ships.filter(s => s.sunk).flatMap(s => s.cells));

  return (
    <div className="flex flex-col items-center">
      {ROWS.map(row => (
        <div key={row} className="flex">
          {COLS.map(col => {
            const cell = `${col}${row}`;
            const isSunk = sunkCells.has(cell);
            const isHit = hitCells.has(cell);
            const isMiss = missCells.has(cell);
            const isShip = shipCells.has(cell);

            let bg = 'bg-sky-950/30';
            if (isSunk) bg = 'bg-red-900/70';
            else if (isHit) bg = 'bg-red-500/60';
            else if (isMiss) bg = 'bg-slate-600/30';
            else if (isShip) bg = '';

            return (
              <div
                key={cell}
                className={`w-3.5 h-3.5 border-[0.5px] border-sky-900/20 ${bg}`}
                style={isShip && !isHit && !isSunk ? { backgroundColor: `${playerColor}40` } : undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Main phone component ──────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BSPhone({ phase, privateState, timerMs, submitInput, myPlayer, useGameEvent: _useGameEvent }: PhoneProps) {
  const state = privateState as unknown as BSPrivateState;
  const playerColor = myPlayer?.playerColor ?? '#38bdf8';

  const seconds = timerMs !== null ? Math.ceil(timerMs / 1000) : null;
  const totalSeconds = phase.timerTotalMs !== null ? Math.ceil(phase.timerTotalMs / 1000) : 30;

  // ── Setup state ──────────────────────────────────────────────────────────
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [horizontal, setHorizontal] = useState(true);
  const [localPlaced, setLocalPlaced] = useState<PlacedShip[]>([]);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  // Sync local placed ships with server state (server is authoritative)
  const placedShips = state.placedShips ?? localPlaced;
  const availableShips = state.availableShips ?? [];

  const handleSetupCellTap = useCallback((cell: string) => {
    if (!selectedShip) return;
    const colIdx = COLS.indexOf(cell[0]!);
    const rowIdx = parseInt(cell.slice(1), 10) - 1;
    const cells = buildShipCells(rowIdx, colIdx, selectedShip.size, horizontal);
    if (!cells) return;
    if (overlaps(cells, placedShips)) return;

    const newShip: PlacedShip = {
      shipId: selectedShip.id,
      cells,
      hits: [],
      sunk: false,
    };
    const newPlaced = [...placedShips.filter(s => s.shipId !== selectedShip.id), newShip];
    setLocalPlaced(newPlaced);
    setSelectedShip(null);
  }, [selectedShip, horizontal, placedShips]);

  const handleRemoveShip = (shipId: string) => {
    setLocalPlaced(prev => prev.filter(s => s.shipId !== shipId));
  };

  const handleReady = () => {
    if (placedShips.length !== 5) return;
    submitInput('confirm', { ships: placedShips });
  };

  // ── Battle state ─────────────────────────────────────────────────────────
  const [selectedFireCell, setSelectedFireCell] = useState<string | null>(null);

  const handleFireCellTap = (cell: string) => {
    setSelectedFireCell(prev => prev === cell ? null : cell);
  };

  const handleFire = () => {
    if (!selectedFireCell) return;
    submitInput('vote', { cell: selectedFireCell });
    setSelectedFireCell(null);
  };

  const firedCells = state.firedCells ?? [];
  const isUrgent = seconds !== null && seconds <= 5;

  return (
    <div className="flex flex-col min-h-dvh bg-[#06080f] relative overflow-y-auto">
      {/* Ambient player color tint */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 120% 35% at 50% 0%, ${playerColor}12 0%, transparent 100%)` }}
      />

      {/* Timer bar */}
      {timerMs !== null && phase.timerTotalMs !== null && (
        <div className="relative z-20 flex-shrink-0">
          <TimerBar ms={timerMs} totalMs={phase.timerTotalMs} />
        </div>
      )}

      {/* Header */}
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
          <Anchor size={14} className="text-white/15" />
        </div>
      </header>

      {/* ── SETUP PHASE ── */}
      {phase.phaseType === BSPhase.SETUP && !state.isReady && (
        <div className="relative z-10 flex flex-col flex-1 px-3 pb-4 gap-3">
          {/* Instruction */}
          <p className="text-center text-white/30 text-xs px-4 pt-1">
            {selectedShip ? `Placing ${selectedShip.name} (${selectedShip.size}) — tap grid` : 'Tap a ship to select it'}
          </p>

          {/* Grid */}
          <div className="flex justify-center overflow-x-auto">
            <SetupGrid
              placedShips={placedShips}
              selectedShip={selectedShip}
              horizontal={horizontal}
              hoveredCell={hoveredCell}
              onCellTap={handleSetupCellTap}
              onCellHover={setHoveredCell}
              playerColor={playerColor}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3 px-1">
            <button
              onClick={() => setHorizontal(h => !h)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                selectedShip ? 'border-white/15 bg-white/[0.05] text-white/60' : 'border-white/[0.06] bg-white/[0.02] text-white/25'
              }`}
            >
              <RotateCcw size={14} />
              {horizontal ? 'H' : 'V'}
            </button>
            <span className="text-white/20 text-xs flex-1 text-center">
              {placedShips.length}/5 ships placed
            </span>
            <button
              onClick={handleReady}
              disabled={placedShips.length < 5}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-30"
              style={{
                backgroundColor: placedShips.length >= 5 ? playerColor : 'rgba(255,255,255,0.06)',
                color: placedShips.length >= 5 ? '#fff' : 'rgba(255,255,255,0.3)',
              }}
            >
              Ready!
            </button>
          </div>

          {/* Ship tray */}
          <div className="flex flex-col gap-1.5 px-1">
            <p className="text-white/20 text-xs">Fleet</p>
            <div className="flex flex-wrap gap-2">
              {/* Available ships */}
              {availableShips.map(ship => {
                const isSelected = selectedShip?.id === ship.id;
                return (
                  <button
                    key={ship.id}
                    onClick={() => setSelectedShip(isSelected ? null : ship)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all active:scale-[0.97] ${
                      isSelected
                        ? 'border-opacity-60 bg-opacity-20 text-white'
                        : 'border-white/[0.08] bg-white/[0.03] text-white/50'
                    }`}
                    style={isSelected ? { borderColor: `${playerColor}80`, backgroundColor: `${playerColor}20`, color: playerColor } : undefined}
                  >
                    <span>{ship.name}</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: ship.size }).map((_, i) => (
                        <div
                          key={i}
                          className="w-2.5 h-2.5 rounded-[2px]"
                          style={{ backgroundColor: isSelected ? `${playerColor}80` : 'rgba(255,255,255,0.15)' }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
              {/* Placed ships (tappable to remove) */}
              {placedShips.map(ps => (
                <button
                  key={ps.shipId}
                  onClick={() => {
                    handleRemoveShip(ps.shipId);
                    // Re-select the ship so player can reposition
                    const ship = [...(state.availableShips ?? []), ...(availableShips)].find(s => s.id === ps.shipId)
                      ?? { id: ps.shipId, name: ps.shipId, size: ps.cells.length };
                    setSelectedShip(ship as Ship);
                  }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/[0.12] bg-white/[0.05] text-white/40 text-xs font-medium"
                >
                  <CheckCircle size={10} className="text-green-400/60" />
                  <span className="capitalize">{ps.shipId}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── SETUP: ready, waiting for opponent ── */}
      {phase.phaseType === BSPhase.SETUP && state.isReady && (
        <div className="relative z-10 flex flex-col flex-1 items-center justify-center gap-5 px-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}
          >
            <CheckCircle size={24} style={{ color: playerColor }} />
          </div>
          <div className="text-center">
            <p className="text-white text-xl font-semibold mb-1">Fleet Ready!</p>
            <p className="text-white/30 text-sm">Waiting for opponent…</p>
          </div>
        </div>
      )}

      {/* ── BATTLE: active player (your turn) ── */}
      {phase.phaseType === BSPhase.BATTLE && state.isActivePlayer && (
        <div className="relative z-10 flex flex-col flex-1 px-3 pb-4 gap-3">
          <div className="text-center pt-1">
            <p className="text-white/60 text-sm font-semibold">🎯 Your Turn!</p>
            <p className="text-white/25 text-xs">Tap a cell to target, then fire</p>
          </div>

          {/* Targeting grid */}
          <div className="flex justify-center overflow-x-auto">
            <TargetGrid
              hits={state.opponentBoard.hits}
              misses={state.opponentBoard.misses}
              sunkShips={state.opponentBoard.sunkShips}
              firedCells={firedCells}
              selectedCell={selectedFireCell}
              onCellTap={handleFireCellTap}
              playerColor={playerColor}
            />
          </div>

          {/* Fire button */}
          <div className="flex justify-center">
            <button
              onClick={handleFire}
              disabled={!selectedFireCell}
              className="px-10 py-3 rounded-2xl text-base font-bold transition-all active:scale-[0.96] disabled:opacity-30"
              style={{
                backgroundColor: selectedFireCell ? '#ef4444' : 'rgba(255,255,255,0.06)',
                color: '#fff',
              }}
            >
              {selectedFireCell ? `🔥 FIRE! (${selectedFireCell})` : 'Select a target'}
            </button>
          </div>

          {/* Mini own board */}
          {state.myBoard.ships.length > 0 && (
            <div className="flex flex-col items-center gap-1 opacity-60 mt-1">
              <p className="text-white/20 text-[9px] tracking-widest uppercase">Your fleet</p>
              <OwnBoardMini
                ships={state.myBoard.ships}
                incomingShots={state.myBoard.incomingShots}
                playerColor={playerColor}
              />
            </div>
          )}
        </div>
      )}

      {/* ── BATTLE: inactive player (waiting) ── */}
      {phase.phaseType === BSPhase.BATTLE && !state.isActivePlayer && (
        <div className="relative z-10 flex flex-col flex-1 px-4 pb-4 gap-4">
          <div className="text-center pt-2">
            <p className="text-white/40 text-sm font-medium">⚓ Opponent's turn</p>
            <p className="text-white/20 text-xs">Waiting for them to fire…</p>
          </div>

          {/* Own board full view */}
          {state.myBoard.ships.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-white/20 text-xs tracking-widest uppercase">Your fleet</p>
              <OwnBoardMini
                ships={state.myBoard.ships}
                incomingShots={state.myBoard.incomingShots}
                playerColor={playerColor}
              />
            </div>
          )}

          {/* Shots I've fired */}
          <div className="flex flex-col items-center gap-1 opacity-50">
            <p className="text-white/20 text-[9px] tracking-widest uppercase">My shots on opponent</p>
            <TargetGrid
              hits={state.opponentBoard.hits}
              misses={state.opponentBoard.misses}
              sunkShips={state.opponentBoard.sunkShips}
              firedCells={firedCells}
              selectedCell={null}
              onCellTap={() => {}}
              playerColor={playerColor}
            />
          </div>
        </div>
      )}

      {/* ── RESULT PHASE ── */}
      {phase.phaseType === BSPhase.RESULT && (
        <div className="relative z-10 flex flex-col flex-1 items-center justify-center gap-5 px-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${playerColor}1a`, border: `1px solid ${playerColor}33` }}
          >
            <Trophy size={24} style={{ color: playerColor }} />
          </div>
          <div className="text-center">
            <p className="text-white text-2xl font-bold mb-1">
              {state.isActivePlayer ? '🏆 Victory!' : '💀 Defeated'}
            </p>
            <p className="text-white/30 text-sm">Check the TV for final results</p>
          </div>
        </div>
      )}

      {/* ── SCORES / GAME OVER ── */}
      {(phase.phaseType === BSPhase.SCORES || phase.phaseType === PhaseType.GAME_OVER) && (
        <div className="relative z-10 flex flex-col flex-1 items-center justify-center gap-5 px-6">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
            <Monitor size={24} className="text-white/40" />
          </div>
          <div className="text-center">
            <p className="text-white text-xl font-semibold mb-1">
              {phase.phaseType === BSPhase.SCORES ? 'Scores' : 'Game Over'}
            </p>
            <p className="text-white/30 text-sm">Check the TV for results</p>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 z-20">
        <PoweredByLogo />
      </div>
    </div>
  );
}

export default BSPhone;
