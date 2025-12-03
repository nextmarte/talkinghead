'use client';

import { create } from 'zustand';

interface CallState {
  status: 'idle' | 'connecting' | 'connected' | 'ended';
  duration: number;
  isMuted: boolean;
  isVideoOn: boolean;
}

interface CallStore extends CallState {
  setStatus: (status: CallState['status']) => void;
  incrementDuration: () => void;
  resetDuration: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  reset: () => void;
}

export const useCallStore = create<CallStore>((set) => ({
  status: 'idle',
  duration: 0,
  isMuted: false,
  isVideoOn: false,

  setStatus: (status) => set({ status }),
  
  incrementDuration: () => set((state) => ({ duration: state.duration + 1 })),
  
  resetDuration: () => set({ duration: 0 }),
  
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  
  toggleVideo: () => set((state) => ({ isVideoOn: !state.isVideoOn })),
  
  reset: () => set({ status: 'idle', duration: 0, isMuted: false, isVideoOn: false }),
}));
