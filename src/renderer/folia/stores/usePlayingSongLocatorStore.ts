import { create } from 'zustand';

// Lab-trimmed copy of folia's src/stores/usePlayingSongLocatorStore.ts.

export interface LocateRequest {
  nonce: number;
  collectionKey: string;
  songKey: string;
}

type PlayingSongLocatorState = {
  request: LocateRequest | null;
  setRequest: (request: LocateRequest | null) => void;
};

export const usePlayingSongLocatorStore = create<PlayingSongLocatorState>(set => ({
  request: null,
  setRequest: request => set({ request }),
}));
