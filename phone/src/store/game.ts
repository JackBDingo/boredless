import { create } from 'zustand';
import type { PhaseState, ScoreEntry } from '@boredless/shared';

interface GameState {
  phase: PhaseState | null;
  privateState: Record<string, unknown> | null;
  publicState: Record<string, unknown> | null;
  timerRemainingMs: number | null;
  scores: ScoreEntry[];

  setPhase: (phase: PhaseState) => void;
  setPrivateState: (state: Record<string, unknown>) => void;
  setPublicState: (state: Record<string, unknown>) => void;
  setTimer: (ms: number) => void;
  setScores: (scores: ScoreEntry[]) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>()((set) => ({
  phase: null,
  privateState: null,
  publicState: null,
  timerRemainingMs: null,
  scores: [],

  setPhase: (phase) => set({ phase }),
  setPrivateState: (state) => set({ privateState: state }),
  setPublicState: (state) => set({ publicState: state }),
  setTimer: (ms) => set({ timerRemainingMs: ms }),
  setScores: (scores) => set({ scores }),
  reset: () => set({ phase: null, privateState: null, publicState: null, timerRemainingMs: null, scores: [] }),
}));
