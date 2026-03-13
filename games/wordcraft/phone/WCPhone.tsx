import { useState, useCallback, useEffect } from 'react';
import type { WCPrivateState, WCPublicState, BoardCell } from '../types.js';
import { PhaseType } from '@boredless/shared';
import { WCPhase } from '../phases.js';
import { WC_BOARD_SIZE, PREMIUM_SQUARES } from '../constants.js';
import { Trophy, Monitor, RotateCcw, ArrowLeftRight, SkipForward, Send } from 'lucide-react';
import { PoweredByLogo } from '@phone/components/PoweredByLogo';
import type { PhoneProps } from '@phone/games/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PendingPlacement {
  row: number;
  col: number;
  letter: string;
  tileId: string;
}

// ── Timer Bar ─────────────────────────────────────────────────────────────────

function TimerBar({ ms, totalMs }: { ms: number; totalMs: number }) {
  const pct = totalMs > 0 ? Math.max(0, Math.min(100, (ms / totalMs) * 100)) : 0;
  const isUrgent = ms <= 10000;
  return (
    <div className="w-full h-[3px] bg-white/[0.06] overflow-hidden">
      <div
        className="h-full transition-all duration-1000 ease-linear"
        style={{ width: `${pct}%`, backgroundColor: isUrgent ? '#f87171' : 'rgba(251,191,36,0.6)' }}
      />
    </div>
  );
}

// ── Premium square background ─────────────────────────────────────────────────

function premiumBg(premium: string | null | undefined): string {
  switch (premium) {
    case 'TW': return 'rgba(239,68,68,0.35)';
    case 'DW': return 'rgba(251,113,133,0.25)';
    case 'TL': return 'rgba(59,130,246,0.35)';
    case 'DL': return 'rgba(96,165,250,0.25)';
    default:   return 'rgba(255,255,255,0.04)';
  }
}

// ── Mini Board ────────────────────────────────────────────────────────────────

interface MiniBoardProps {
  board: BoardCell[][];
  pending: PendingPlacement[];
  selectedTileId: string | null;
  interactive: boolean;
  onCellTap: (row: number, col: number) => void;
}

function MiniBoard({ board, pending, selectedTileId, interactive, onCellTap }: MiniBoardProps) {
  const pendingSet = new Map(pending.map(p => [`${p.row},${p.col}`, p]));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${WC_BOARD_SIZE}, 1fr)`,
        gap: '1px',
        width: '100%',
        maxWidth: 330,
        aspectRatio: '1',
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 6,
        overflow: 'hidden',
        padding: 1,
        margin: '0 auto',
      }}
    >
      {Array.from({ length: WC_BOARD_SIZE }, (_, row) =>
        Array.from({ length: WC_BOARD_SIZE }, (_, col) => {
          const cell = board[row]?.[col];
          const pendingHere = pendingSet.get(`${row},${col}`);
          const existingTile = cell?.tile;
          const premium = cell?.premium ?? PREMIUM_SQUARES.get(`${row},${col}`) ?? null;
          const isCenter = row === 7 && col === 7;

          let bg = premiumBg(existingTile ? null : premium);
          let textColor = 'rgba(255,255,255,0.85)';
          let cellContent: string | null = null;
          let borderStyle = 'none';

          if (existingTile) {
            bg = 'rgba(245,245,220,0.88)';
            textColor = '#1a1a1a';
            cellContent = existingTile.letter || '?';
          } else if (pendingHere) {
            bg = 'rgba(251,191,36,0.25)';
            borderStyle = '1px solid rgba(251,191,36,0.7)';
            textColor = '#fbbf24';
            cellContent = pendingHere.letter || '?';
          } else if (isCenter && !existingTile) {
            cellContent = '\u2605';
            textColor = 'rgba(251,191,36,0.5)';
          }

          const canTap = interactive && selectedTileId !== null && !existingTile && !pendingHere;

          return (
            <div
              key={`${row}-${col}`}
              onClick={canTap ? () => onCellTap(row, col) : undefined}
              style={{
                backgroundColor: bg,
                border: borderStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: canTap ? 'pointer' : 'default',
                fontSize: 8,
                fontWeight: 700,
                color: textColor,
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              {cellContent}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Tile Rack ─────────────────────────────────────────────────────────────────

interface TileRackProps {
  tiles: WCPrivateState['rack'];
  pending: PendingPlacement[];
  selectedTileId: string | null;
  swapMode: boolean;
  swapTileIds: string[];
  onTileTap: (tileId: string) => void;
  disabled?: boolean;
}

function TileRack({ tiles, pending, selectedTileId, swapMode, swapTileIds, onTileTap, disabled }: TileRackProps) {
  const pendingTileIds = new Set(pending.map(p => p.tileId));

  return (
    <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: 6, flexWrap: 'wrap', padding: '0 8px' }}>
      {tiles.map((tile) => {
        const isPlaced = pendingTileIds.has(tile.id);
        const isSelected = selectedTileId === tile.id;
        const isSwapSelected = swapTileIds.includes(tile.id);

        let borderColor = 'rgba(255,255,255,0.12)';
        let bg = 'rgba(245,245,220,0.9)';
        let textColor = '#1a1a1a';
        let opacity: number = 1;
        let shadow = 'none';

        if (isPlaced) {
          bg = 'rgba(245,245,220,0.2)';
          textColor = 'rgba(255,255,255,0.2)';
          borderColor = 'rgba(255,255,255,0.06)';
        } else if (isSelected) {
          borderColor = '#fbbf24';
          shadow = '0 0 0 2px rgba(251,191,36,0.4)';
          bg = 'rgba(255,255,190,1)';
        } else if (swapMode && isSwapSelected) {
          borderColor = '#f87171';
          shadow = '0 0 0 2px rgba(248,113,113,0.4)';
        } else if (disabled) {
          opacity = 0.5;
        }

        return (
          <button
            key={tile.id}
            onClick={() => !isPlaced && !disabled && onTileTap(tile.id)}
            disabled={isPlaced || disabled}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              border: `2px solid ${borderColor}`,
              backgroundColor: bg,
              color: textColor,
              opacity,
              boxShadow: shadow,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isPlaced || disabled ? 'default' : 'pointer',
              position: 'relative',
              padding: 0,
              transition: 'all 0.1s ease',
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>
              {tile.letter || (tile.isBlank ? '\u25A1' : '?')}
            </span>
            <span style={{ fontSize: 8, fontWeight: 600, opacity: 0.6, lineHeight: 1, marginTop: 1 }}>
              {tile.points}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function WCPhone({ phase, publicState, privateState, timerMs, submitInput, myPlayer, useGameEvent: _useGameEvent }: PhoneProps) {
  const pub = publicState as unknown as WCPublicState;
  const priv = privateState as unknown as WCPrivateState;

  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [placedTiles, setPlacedTiles] = useState<PendingPlacement[]>([]);
  const [swapMode, setSwapMode] = useState(false);
  const [swapTileIds, setSwapTileIds] = useState<string[]>([]);

  const timerMs2 = timerMs ?? null;
  const seconds = timerMs2 !== null ? Math.ceil(timerMs2 / 1000) : null;
  const totalMs = phase.timerTotalMs ?? 90000;
  const isUrgent = timerMs2 !== null && timerMs2 <= 10000;
  const playerColor = myPlayer?.playerColor ?? '#f59e0b';

  const isMyTurn = priv?.isMyTurn ?? false;
  const phaseType = phase.phaseType;

  // Reset local state on phase change
  useEffect(() => {
    setSelectedTileId(null);
    setPlacedTiles([]);
    setSwapMode(false);
    setSwapTileIds([]);
  }, [phaseType]);

  // Tile tap: rack interaction
  const handleTileTap = useCallback((tileId: string) => {
    if (swapMode) {
      setSwapTileIds(prev =>
        prev.includes(tileId) ? prev.filter(id => id !== tileId) : [...prev, tileId]
      );
      return;
    }
    setSelectedTileId(prev => prev === tileId ? null : tileId);
  }, [swapMode]);

  // Board cell tap: place selected tile
  const handleCellTap = useCallback((row: number, col: number) => {
    if (!selectedTileId) return;
    const rack = priv?.rack ?? [];
    const tile = rack.find(t => t.id === selectedTileId);
    if (!tile) return;

    setPlacedTiles(prev => [...prev, {
      row,
      col,
      letter: tile.letter,
      tileId: tile.id,
    }]);
    setSelectedTileId(null);
  }, [selectedTileId, priv?.rack]);

  // Undo last placement
  const handleUndo = useCallback(() => {
    setPlacedTiles(prev => prev.slice(0, -1));
    setSelectedTileId(null);
  }, []);

  // Clear all placements
  const handleClear = useCallback(() => {
    setPlacedTiles([]);
    setSelectedTileId(null);
  }, []);

  // Toggle swap mode
  const handleSwapToggle = useCallback(() => {
    setSwapMode(prev => !prev);
    setSwapTileIds([]);
    setSelectedTileId(null);
  }, []);

  // Submit placed word
  const handleSubmit = useCallback(() => {
    if (placedTiles.length === 0) return;
    submitInput('vote', { action: 'place', tiles: placedTiles });
    setPlacedTiles([]);
    setSelectedTileId(null);
  }, [placedTiles, submitInput]);

  // Confirm swap
  const handleSwapConfirm = useCallback(() => {
    if (swapTileIds.length === 0) return;
    submitInput('vote', { action: 'swap', tileIds: swapTileIds });
    setSwapMode(false);
    setSwapTileIds([]);
  }, [swapTileIds, submitInput]);

  // Pass turn
  const handlePass = useCallback(() => {
    submitInput('vote', { action: 'pass' });
  }, [submitInput]);

  const board = pub?.board ?? Array.from({ length: WC_BOARD_SIZE }, () =>
    Array.from({ length: WC_BOARD_SIZE }, () => ({ tile: null, premium: null, premiumUsed: false }))
  );

  const rack = priv?.rack ?? [];
  const currentPlayerName = pub?.players?.find(p => p.playerId === pub?.currentPlayerId)?.playerName ?? 'Someone';
  const myScore = pub?.players?.find(p => p.playerId === myPlayer?.playerId)?.score ?? 0;

  // ── INSTRUCTIONS ─────────────────────────────────────────────────────────────

  if (phaseType === PhaseType.INSTRUCTIONS) {
    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 items-center justify-center gap-6 px-8">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
          style={{ backgroundColor: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}>
          {'🔤'}
        </div>
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">WordCraft</h1>
          <p className="text-white/30 text-sm leading-relaxed max-w-xs">
            Place tiles to form words. Score big with premium squares. First to empty their rack wins!
          </p>
        </div>
        <div className="fixed bottom-0 inset-x-0 z-20">
          <PoweredByLogo />
        </div>
      </div>
    );
  }

  // ── GAME OVER ─────────────────────────────────────────────────────────────────

  if (phaseType === PhaseType.GAME_OVER) {
    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 items-center justify-center gap-6 px-8">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
          <Trophy size={24} className="text-amber-400" />
        </div>
        <div className="text-center">
          <p className="text-white text-xl font-semibold mb-1">Game Over</p>
          <p className="text-white/40 text-sm mb-4">Check the TV for final results</p>
          <div className="px-6 py-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
            <p className="text-white/30 text-xs mb-1">Your final score</p>
            <p className="text-3xl font-bold" style={{ color: '#fbbf24' }}>{myScore}</p>
          </div>
        </div>
        <div className="fixed bottom-0 inset-x-0 z-20">
          <PoweredByLogo />
        </div>
      </div>
    );
  }

  // ── WC_STARTING ───────────────────────────────────────────────────────────────

  if (phaseType === WCPhase.STARTING) {
    const turnOrder = pub?.turnOrder ?? [];
    const playerMap = new Map((pub?.players ?? []).map(p => [p.playerId, p.playerName]));
    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 items-center justify-center gap-6 px-8">
        <div className="text-center">
          <p className="text-white/30 text-xs tracking-widest uppercase mb-3">Get ready</p>
          <h2 className="text-2xl font-bold text-white">Game starting&hellip;</h2>
        </div>
        {turnOrder.length > 0 && (
          <div className="w-full max-w-xs">
            <p className="text-white/20 text-xs text-center mb-3">Turn order</p>
            <div className="flex flex-col gap-2">
              {turnOrder.map((pid, i) => (
                <div key={pid} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                  <span className="text-white/25 text-sm w-5">{i + 1}.</span>
                  <span className={`text-sm font-medium ${pid === myPlayer?.playerId ? 'text-amber-400' : 'text-white/70'}`}>
                    {playerMap.get(pid) ?? pid}
                    {pid === myPlayer?.playerId && ' (you)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="fixed bottom-0 inset-x-0 z-20">
          <PoweredByLogo />
        </div>
      </div>
    );
  }

  // ── WC_WORD_REVEAL ─────────────────────────────────────────────────────────────

  if (phaseType === WCPhase.WORD_REVEAL) {
    const lastWord = pub?.lastWord;
    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 items-center justify-center gap-5 px-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <Monitor size={24} className="text-amber-400" />
        </div>
        {lastWord ? (
          <div className="text-center">
            <p className="text-white/25 text-xs tracking-widest uppercase mb-2">Word played</p>
            <p className="text-4xl font-bold text-white tracking-widest mb-2">
              {lastWord.word}
            </p>
            <p className="text-amber-400 text-2xl font-bold">+{lastWord.score} pts</p>
            <p className="text-white/30 text-sm mt-1">by {lastWord.playerName}</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-white text-xl font-semibold">Look at the TV</p>
          </div>
        )}
        <div className="fixed bottom-0 inset-x-0 z-20">
          <PoweredByLogo />
        </div>
      </div>
    );
  }

  // ── WC_SCORES ─────────────────────────────────────────────────────────────────

  if (phaseType === WCPhase.SCORES) {
    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 items-center justify-center gap-5 px-8">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <Trophy size={24} className="text-amber-400" />
        </div>
        <div className="text-center">
          <p className="text-white/25 text-xs tracking-widest uppercase mb-2">Check the TV</p>
          <p className="text-white/60 text-sm mb-5">Scores are up</p>
          <div className="px-8 py-4 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
            <p className="text-white/30 text-xs mb-1">Your score</p>
            <p className="text-4xl font-bold" style={{ color: '#fbbf24' }}>{myScore}</p>
          </div>
        </div>
        <div className="fixed bottom-0 inset-x-0 z-20">
          <PoweredByLogo />
        </div>
      </div>
    );
  }

  // ── WC_PLAYING — not my turn ───────────────────────────────────────────────────

  if (phaseType === WCPhase.PLAYING && !isMyTurn) {
    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 overflow-y-auto">
        {timerMs2 !== null && (
          <TimerBar ms={timerMs2} totalMs={totalMs} />
        )}

        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: playerColor }} />
            <span className="text-white/40 text-sm">{myPlayer?.playerName ?? ''}</span>
          </div>
          {seconds !== null && (
            <span className={`text-sm font-semibold tabular-nums ${isUrgent ? 'text-red-400' : 'text-white/25'}`}>
              {seconds}s
            </span>
          )}
        </header>

        <div className="flex flex-col gap-4 px-4 pb-28">
          <div className="text-center py-2">
            <p className="text-white/25 text-xs tracking-widest uppercase mb-1">Waiting for</p>
            <p className="text-white/70 text-base font-medium">{currentPlayerName}</p>
          </div>

          <MiniBoard
            board={board}
            pending={[]}
            selectedTileId={null}
            interactive={false}
            onCellTap={() => {}}
          />

          <div style={{ opacity: 0.4, pointerEvents: 'none' }}>
            <TileRack
              tiles={rack}
              pending={[]}
              selectedTileId={null}
              swapMode={false}
              swapTileIds={[]}
              onTileTap={() => {}}
              disabled
            />
          </div>
        </div>

        <div className="fixed bottom-0 inset-x-0 z-20">
          <PoweredByLogo />
        </div>
      </div>
    );
  }

  // ── WC_PLAYING — my turn ───────────────────────────────────────────────────────

  if (phaseType === WCPhase.PLAYING && isMyTurn) {
    const canSwap = priv?.canSwap ?? false;

    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 overflow-y-auto" style={{ position: 'relative' }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 120% 30% at 50% 0%, ${playerColor}12 0%, transparent 100%)`
        }} />

        {timerMs2 !== null && (
          <TimerBar ms={timerMs2} totalMs={totalMs} />
        )}

        <header className="relative flex items-center justify-between px-5 pt-4 pb-2" style={{ zIndex: 10 }}>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: playerColor, animation: 'pulse 2s infinite' }} />
            <span className="text-white font-medium text-sm">{myPlayer?.playerName ?? ''}</span>
            <span className="text-amber-400 text-xs font-semibold ml-1">Your turn</span>
          </div>
          {seconds !== null && (
            <span className={`text-sm font-semibold tabular-nums ${isUrgent ? 'text-red-400' : 'text-amber-400/60'}`}>
              {seconds}s
            </span>
          )}
        </header>

        <div className="relative flex flex-col gap-3 px-4 pb-44" style={{ zIndex: 10 }}>
          {/* Swap mode banner */}
          {swapMode && (
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25">
              <p className="text-red-300 text-sm font-medium">Tap tiles to swap ({swapTileIds.length} selected)</p>
              <button onClick={handleSwapToggle} className="text-white/30 text-xs underline">Cancel</button>
            </div>
          )}

          {/* Instruction hint */}
          {!swapMode && selectedTileId && (
            <div className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
              <p className="text-amber-300/80 text-xs">Tap a cell on the board to place the tile</p>
            </div>
          )}
          {!swapMode && !selectedTileId && placedTiles.length === 0 && (
            <div className="px-4 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-center">
              <p className="text-white/25 text-xs">Tap a tile from your rack to select it</p>
            </div>
          )}

          {/* Board */}
          <MiniBoard
            board={board}
            pending={placedTiles}
            selectedTileId={selectedTileId}
            interactive={!swapMode}
            onCellTap={handleCellTap}
          />

          {/* Rack */}
          <div className="pt-1">
            <TileRack
              tiles={rack}
              pending={placedTiles}
              selectedTileId={selectedTileId}
              swapMode={swapMode}
              swapTileIds={swapTileIds}
              onTileTap={handleTileTap}
            />
          </div>
        </div>

        {/* Action bar (fixed bottom) */}
        <div className="fixed bottom-0 inset-x-0" style={{ zIndex: 30 }}>
          <div className="bg-gray-950 border-t border-white/[0.08] px-4 pt-3 pb-2" style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(3,7,18,0.95)' }}>
            {swapMode ? (
              <div className="flex gap-2 mb-2">
                <button
                  onClick={handleSwapToggle}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold text-white/60 bg-white/[0.06] border border-white/[0.08] active:scale-[0.97] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSwapConfirm}
                  disabled={swapTileIds.length === 0}
                  className="flex-[2] py-3 rounded-xl text-sm font-semibold text-white active:scale-[0.97] transition-all disabled:opacity-30"
                  style={{ backgroundColor: 'rgba(239,68,68,0.8)', border: '1px solid rgba(248,113,113,0.3)' }}
                >
                  Swap {swapTileIds.length > 0 ? `(${swapTileIds.length})` : ''}
                </button>
              </div>
            ) : (
              <>
                {/* Primary: SUBMIT */}
                <button
                  onClick={handleSubmit}
                  disabled={placedTiles.length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-base font-bold mb-2 transition-all active:scale-[0.97] disabled:opacity-25"
                  style={{
                    backgroundColor: placedTiles.length > 0 ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                    color: placedTiles.length > 0 ? '#1a1a1a' : 'rgba(255,255,255,0.3)',
                    border: placedTiles.length > 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Send size={16} />
                  Submit{placedTiles.length > 0 ? ` (${placedTiles.length} tile${placedTiles.length !== 1 ? 's' : ''})` : ''}
                </button>

                {/* Secondary row */}
                <div className="flex gap-2">
                  <button
                    onClick={handleUndo}
                    disabled={placedTiles.length === 0}
                    className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold text-white/50 bg-white/[0.05] border border-white/[0.07] active:scale-[0.97] transition-all disabled:opacity-25"
                  >
                    <RotateCcw size={13} /> Undo
                  </button>
                  <button
                    onClick={handleClear}
                    disabled={placedTiles.length === 0}
                    className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold text-white/50 bg-white/[0.05] border border-white/[0.07] active:scale-[0.97] transition-all disabled:opacity-25"
                  >
                    &#x2715; Clear
                  </button>
                  {canSwap && (
                    <button
                      onClick={handleSwapToggle}
                      className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold text-white/50 bg-white/[0.05] border border-white/[0.07] active:scale-[0.97] transition-all"
                    >
                      <ArrowLeftRight size={13} /> Swap
                    </button>
                  )}
                  <button
                    onClick={handlePass}
                    className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl text-xs font-semibold text-white/50 bg-white/[0.05] border border-white/[0.07] active:scale-[0.97] transition-all"
                  >
                    <SkipForward size={13} /> Pass
                  </button>
                </div>
              </>
            )}
          </div>
          <PoweredByLogo />
        </div>
      </div>
    );
  }

  // ── Fallback ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 items-center justify-center gap-4 px-8">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
        <Monitor size={24} className="text-amber-400/50" />
      </div>
      <p className="text-white/30 text-sm">Look at the TV</p>
      <div className="fixed bottom-0 inset-x-0 z-20">
        <PoweredByLogo />
      </div>
    </div>
  );
}

export default WCPhone;
