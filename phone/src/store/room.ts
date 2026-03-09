import { create } from 'zustand';
import type { PublicRoomState } from '@boredless/shared';

interface RoomState {
  room: PublicRoomState | null;
  setRoom: (room: PublicRoomState) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>()((set) => ({
  room: null,
  setRoom: (room) => set({ room }),
  reset: () => set({ room: null }),
}));
