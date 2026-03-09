import { create } from 'zustand';
import type { PhaseState } from '@boredless/shared';

interface GameState {
  phase: PhaseState | null;
  privateState: Record<string, unknown> | null;
  timerRemainingMs: number | null;

  setPhase: (phase: PhaseState) => void;
  setPrivateState: (state: Record<string, unknown>) => void;
  setTimer: (ms: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>()((set) => ({
  phase: null,
  privateState: null,
  timerRemainingMs: null,

  setPhase: (phase) => set({ phase }),
  setPrivateState: (state) => set({ privateState: state }),
  setTimer: (ms) => set({ timerRemainingMs: ms }),
  reset: () => set({ phase: null, privateState: null, timerRemainingMs: null }),
}));
