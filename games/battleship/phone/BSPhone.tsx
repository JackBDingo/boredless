import { useState, useCallback } from 'react';
import type { PhoneProps } from '@phone/games/types';
import type { BSPrivateState, PlacedShip, Ship } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { BSPhase } from '../phases.js';
import { Anchor, RotateCcw, Trophy, Monitor, CheckCircle } from 'lucide-react';
import { PoweredByLogo } from '@phone/components/PoweredByLogo';
import spritesheetUrl from '../assets/ships-spritesheet.png';
import { SPRITES, SHIP_SPRITE_MAP, SHEET_WIDTH, SHEET_HEIGHT } from '../assets/spritesheet.js';

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

// ── Water tile cell background ────────────────────────────────────────────────
/** Returns inline style for a water-tile background using the spritesheet */
function waterTileStyle(cellPx: number): React.CSSProperties {
  const sprite = SPRITES.water;
  const scale = cellPx / sprite.width;
  return {
    backgroundImage: `url(${spritesheetUrl})`,
    backgroundSize: `${SHEET_WIDTH * scale}px ${SHEET_HEIGHT * scale}px`,
    backgroundPosition: `-${sprite.x * scale}px -${sprite.y * scale}px`,
    backgroundRepeat: 'no-repeat',
  };
}

// ── Ship sprite renderer ───────────────────────────────────────────────────────
/**
 * Renders a ship from the spritesheet.
 * The ship is always drawn vertically in the sheet.
 * For horizontal placement, rotate -90deg (via CSS transform).
 *
 * @param shipId    - Ship ID matching SHIP_SPRITE_MAP keys
 * @param cellPx    - Width/height of one grid cell in pixels
 * @param size      - Number of cells the ship occupies
 * @param horizontal - Whether the ship is placed horizontally
 * @param opacity   - Opacity (0–1)
 */
interface ShipSpriteProps {
  shipId: string;
  cellPx: number;
  size: number;
  horizontal: boolean;
  opacity?: number;
  style?: React.CSSProperties;
}

function ShipSprite({ shipId, cellPx, size, horizontal, opacity = 1, style }: ShipSpriteProps) {
  const spriteName = SHIP_SPRITE_MAP[shipId];
  if (!spriteName) return null;
  const sprite = SPRITES[spriteName];

  // The ship occupies `size` cells.
  // We render it as a box that is: cellPx * size tall, cellPx wide (vertical orientation).
  // Scale factor: fit the sprite height into `size * cellPx` px.
  const renderHeight = cellPx * size;
  const renderWidth = cellPx;
  const scaleH = renderHeight / sprite.height;
  // Use the same scale for X so the ship doesn't stretch horizontally.
  // Center it horizontally within the cell.
  const scaledW = sprite.width * scaleH;

  // Background for the vertical sprite
  const sheetScale = scaleH;
  const bgSize = `${SHEET_WIDTH * sheetScale}px ${SHEET_HEIGHT * sheetScale}px`;
  const bgPosX = -(sprite.x * sheetScale) + (renderWidth - scaledW) / 2;
  const bgPosY = -(sprite.y * sheetScale);
  const bgPos = `${bgPosX}px ${bgPosY}px`;

  // When horizontal, rotate the whole element -90deg around its center.
  // The container must be sized for the HORIZONTAL footprint (size*cellPx wide, cellPx tall).
  const containerStyle: React.CSSProperties = horizontal
    ? {
        width: renderHeight,  // rotated: height becomes width
        height: renderWidth,  // rotated: width becomes height
        position: 'relative',
        ...style,
      }
    : {
        width: renderWidth,
        height: renderHeight,
        position: 'relative',
        ...style,
      };

  const innerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: renderWidth,
    height: renderHeight,
    backgroundImage: `url(${spritesheetUrl})`,
    backgroundSize: bgSize,
    backgroundPosition: bgPos,
    backgroundRepeat: 'no-repeat',
    opacity,
    transformOrigin: horizontal ? `${renderWidth / 2}px ${renderWidth / 2}px` : undefined,
    transform: horizontal ? `rotate(-90deg) translateX(-${renderHeight - renderWidth}px)` : undefined,
  };

  return (
    <div style={containerStyle}>
      <div style={innerStyle} />
    </div>
  );
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  placedShips, selectedShip, horizontal, hoveredCell, onCellTap, onCellHover, playerColor,
}: SetupGridProps) {
  const CELL_PX = 32; // w-8 / h-8

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

  // Build a map from cell → ship info for placed ships
  const cellToShip = new Map<string, PlacedShip>();
  for (const ps of placedShips) {
    for (const c of ps.cells) cellToShip.set(c, ps);
  }

  // Build a map from cell → position-in-ship (0-indexed) and ship size
  const cellShipInfo = new Map<string, { index: number; size: number; shipId: string; isFirst: boolean }>();
  for (const ps of placedShips) {
    for (let i = 0; i < ps.cells.length; i++) {
      cellShipInfo.set(ps.cells[i]!, {
        index: i,
        size: ps.cells.length,
        shipId: ps.shipId,
        isFirst: i === 0,
      });
    }
  }

  // Determine orientation of placed ships
  const shipOrientation = new Map<string, boolean>(); // shipId → isHorizontal
  for (const ps of placedShips) {
    if (ps.cells.length >= 2) {
      const c0 = ps.cells[0]!;
      const c1 = ps.cells[1]!;
      shipOrientation.set(ps.shipId, c0[0] !== c1[0]); // different cols = horizontal
    } else {
      shipOrientation.set(ps.shipId, true);
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
            const shipInfo = cellShipInfo.get(cell);
            const isHoriz = shipInfo ? (shipOrientation.get(shipInfo.shipId) ?? true) : true;

            // Ship sprite overlay for occupied cells
            // Only render the sprite on the FIRST cell of the ship
            const showSprite = isOccupied && shipInfo?.isFirst;

            let bg = 'bg-sky-950/40 border-sky-900/30 active:bg-sky-800/40';
            let borderStyle: React.CSSProperties = {};
            if (isOccupied) {
              bg = 'border-sky-600/30';
              borderStyle = { backgroundColor: `${playerColor}25`, borderColor: `${playerColor}45` };
            }
            if (isPreview && previewValid) {
              bg = 'border-sky-400/50';
              borderStyle = { backgroundColor: `${playerColor}20` };
            }
            if (isPreviewBad) {
              bg = 'bg-red-900/40 border-red-700/40';
              borderStyle = {};
            }

            return (
              <button
                key={cell}
                className={`w-8 h-8 aspect-square border rounded-[2px] flex items-center justify-center transition-all duration-75 relative overflow-visible ${bg}`}
                style={{
                  ...borderStyle,
                  ...waterTileStyle(CELL_PX),
                }}
                onPointerEnter={() => onCellHover(cell)}
                onPointerLeave={() => onCellHover(null)}
                onClick={() => onCellTap(cell)}
                aria-label={cell}
              >
                {/* Dark overlay on empty cells */}
                {!isOccupied && !isPreview && (
                  <div className="absolute inset-0 bg-[#06080f]/60 rounded-[1px]" />
                )}
                {/* Slight tint for preview */}
                {isPreview && previewValid && (
                  <div className="absolute inset-0 rounded-[1px]" style={{ backgroundColor: `${playerColor}30` }} />
                )}
                {isPreviewBad && (
                  <div className="absolute inset-0 bg-red-900/50 rounded-[1px]" />
                )}
                {/* Ship sprite — positioned relative to the FIRST cell, spans full ship length */}
                {showSprite && shipInfo && (
                  <div
                    className="absolute z-10 pointer-events-none"
                    style={
                      isHoriz
                        ? { top: 0, left: 0, width: CELL_PX * shipInfo.size, height: CELL_PX }
                        : { top: 0, left: 0, width: CELL_PX, height: CELL_PX * shipInfo.size }
                    }
                  >
                    <ShipSprite
                      shipId={shipInfo.shipId}
                      cellPx={CELL_PX}
                      size={shipInfo.size}
                      horizontal={isHoriz}
                      opacity={0.9}
                    />
                  </div>
                )}
                {/* Preview ship sprite — only on first preview cell */}
                {isPreview && previewValid && selectedShip && previewCells[0] === cell && (
                  <div
                    className="absolute z-10 pointer-events-none"
                    style={
                      horizontal
                        ? { top: 0, left: 0, width: CELL_PX * selectedShip.size, height: CELL_PX }
                        : { top: 0, left: 0, width: CELL_PX, height: CELL_PX * selectedShip.size }
                    }
                  >
                    <ShipSprite
                      shipId={selectedShip.id}
                      cellPx={CELL_PX}
                      size={selectedShip.size}
                      horizontal={horizontal}
                      opacity={0.6}
                    />
                  </div>
                )}
                {isPreviewBad && previewCells[0] === cell && selectedShip && (
                  <div
                    className="absolute z-10 pointer-events-none"
                    style={
                      horizontal
                        ? { top: 0, left: 0, width: CELL_PX * selectedShip.size, height: CELL_PX }
                        : { top: 0, left: 0, width: CELL_PX, height: CELL_PX * selectedShip.size }
                    }
                  >
                    <ShipSprite
                      shipId={selectedShip.id}
                      cellPx={CELL_PX}
                      size={selectedShip.size}
                      horizontal={horizontal}
                      opacity={0.35}
                    />
                  </div>
                )}
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
  const CELL_PX = 32;
  const sunkCells = new Set(sunkShips.flatMap(s => s.cells));

  // For sunk ships — render ship sprites on first cell
  const cellToSunkShip = new Map<string, PlacedShip>();
  for (const ps of sunkShips) {
    for (const c of ps.cells) cellToSunkShip.set(c, ps);
  }
  const cellShipInfo = new Map<string, { index: number; size: number; shipId: string; isFirst: boolean }>();
  for (const ps of sunkShips) {
    for (let i = 0; i < ps.cells.length; i++) {
      cellShipInfo.set(ps.cells[i]!, {
        index: i,
        size: ps.cells.length,
        shipId: ps.shipId,
        isFirst: i === 0,
      });
    }
  }
  const shipOrientation = new Map<string, boolean>();
  for (const ps of sunkShips) {
    if (ps.cells.length >= 2) {
      shipOrientation.set(ps.shipId, ps.cells[0]![0] !== ps.cells[1]![0]);
    } else {
      shipOrientation.set(ps.shipId, true);
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
            const shipInfo = cellShipInfo.get(cell);
            const isHoriz = shipInfo ? (shipOrientation.get(shipInfo.shipId) ?? true) : true;

            return (
              <button
                key={cell}
                disabled={!canTarget}
                className={`w-8 h-8 aspect-square border rounded-[2px] flex items-center justify-center transition-all duration-75 relative overflow-visible ${canTarget && !isSelected ? 'active:bg-sky-700/40' : ''} ${!canTarget ? 'cursor-default' : ''}`}
                style={{
                  ...(isSelected ? { borderColor: playerColor, borderWidth: 2 } : { borderColor: 'rgba(56,189,248,0.12)' }),
                  ...waterTileStyle(CELL_PX),
                }}
                onClick={() => canTarget && onCellTap(cell)}
                aria-label={cell}
              >
                {/* Base ocean overlay */}
                <div className={`absolute inset-0 rounded-[1px] ${isSunk ? 'bg-red-950/60' : 'bg-[#06080f]/55'}`} />
                {/* Selected highlight */}
                {isSelected && (
                  <div className="absolute inset-0 rounded-[1px]" style={{ backgroundColor: `${playerColor}25` }} />
                )}
                {/* Sunk ship sprite */}
                {isSunk && shipInfo?.isFirst && (
                  <div
                    className="absolute z-10 pointer-events-none"
                    style={
                      isHoriz
                        ? { top: 0, left: 0, width: CELL_PX * shipInfo.size, height: CELL_PX }
                        : { top: 0, left: 0, width: CELL_PX, height: CELL_PX * shipInfo.size }
                    }
                  >
                    <ShipSprite
                      shipId={shipInfo.shipId}
                      cellPx={CELL_PX}
                      size={shipInfo.size}
                      horizontal={isHoriz}
                      opacity={0.5}
                    />
                  </div>
                )}
                {/* Hit / miss markers */}
                {isSunk && (
                  <div className="relative z-20 text-[14px] leading-none">🔴</div>
                )}
                {isHit && !isSunk && (
                  <div className="relative z-20 text-[14px] leading-none">🔴</div>
                )}
                {isMiss && (
                  <div className="relative z-20 text-[12px] leading-none">⚪</div>
                )}
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
  const CELL_PX = 14; // w-3.5
  const shipCells = new Set(ships.flatMap(s => s.cells));
  const hitCells = new Set(incomingShots.filter(s => s.result === 'hit').map(s => s.cell));
  const missCells = new Set(incomingShots.filter(s => s.result === 'miss').map(s => s.cell));
  const sunkCells = new Set(ships.filter(s => s.sunk).flatMap(s => s.cells));

  // Build ship position info for sprites
  const cellShipInfo = new Map<string, { index: number; size: number; shipId: string; isFirst: boolean }>();
  for (const ps of ships) {
    for (let i = 0; i < ps.cells.length; i++) {
      cellShipInfo.set(ps.cells[i]!, {
        index: i,
        size: ps.cells.length,
        shipId: ps.shipId,
        isFirst: i === 0,
      });
    }
  }
  const shipOrientation = new Map<string, boolean>();
  for (const ps of ships) {
    if (ps.cells.length >= 2) {
      shipOrientation.set(ps.shipId, ps.cells[0]![0] !== ps.cells[1]![0]);
    } else {
      shipOrientation.set(ps.shipId, true);
    }
  }

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
            const shipInfo = cellShipInfo.get(cell);
            const isHoriz = shipInfo ? (shipOrientation.get(shipInfo.shipId) ?? true) : true;

            return (
              <div
                key={cell}
                className="w-3.5 h-3.5 border-[0.5px] border-sky-900/20 relative overflow-visible"
                style={waterTileStyle(CELL_PX)}
              >
                {/* Base overlay */}
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: isSunk
                      ? 'rgba(127,29,29,0.6)'
                      : isHit
                      ? 'rgba(239,68,68,0.45)'
                      : isMiss
                      ? 'rgba(71,85,105,0.3)'
                      : isShip
                      ? `${playerColor}25`
                      : 'rgba(6,8,15,0.55)',
                  }}
                />
                {/* Ship sprite on first cell */}
                {isShip && shipInfo?.isFirst && (
                  <div
                    className="absolute z-10 pointer-events-none"
                    style={
                      isHoriz
                        ? { top: 0, left: 0, width: CELL_PX * shipInfo.size, height: CELL_PX }
                        : { top: 0, left: 0, width: CELL_PX, height: CELL_PX * shipInfo.size }
                    }
                  >
                    <ShipSprite
                      shipId={shipInfo.shipId}
                      cellPx={CELL_PX}
                      size={shipInfo.size}
                      horizontal={isHoriz}
                      opacity={isSunk ? 0.35 : 0.85}
                    />
                  </div>
                )}
                {/* Hit/miss markers */}
                {(isHit || isSunk) && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center text-[8px] leading-none">🔴</div>
                )}
                {isMiss && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center text-[7px] leading-none">⚪</div>
                )}
              </div>
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
