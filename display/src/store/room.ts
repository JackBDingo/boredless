import { create } from 'zustand';
import type {
  PublicRoomState,
  PhaseState,
  ScoreEntry,
  GameOverState,
} from '@boredless/shared';

interface RoomState {
  room: PublicRoomState | null;
  phase: PhaseState | null;
  gamePublicState: Record<string, unknown> | null;
  scores: ScoreEntry[];
  gameOverResult: GameOverState | null;
  timerRemainingMs: number | null;

  setRoom: (room: PublicRoomState) => void;
  setPhase: (phase: PhaseState) => void;
  setGamePublicState: (state: Record<string, unknown>) => void;
  setScores: (scores: ScoreEntry[]) => void;
  setGameOver: (result: GameOverState) => void;
  setTimer: (remainingMs: number) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  phase: null,
  gamePublicState: null,
  scores: [],
  gameOverResult: null,
  timerRemainingMs: null,

  setRoom: (room) => set({ room }),
  setPhase: (phase) => set({ phase }),
  setGamePublicState: (state) => set({ gamePublicState: state }),
  setScores: (scores) => set({ scores }),
  setGameOver: (result) => set({ gameOverResult: result }),
  setTimer: (remainingMs) => set({ timerRemainingMs: remainingMs }),
  reset: () => set({
    room: null,
    phase: null,
    gamePublicState: null,
    scores: [],
    gameOverResult: null,
    timerRemainingMs: null,
  }),
}));
