import { create } from 'zustand';

// Lab-trimmed copy of folia's src/stores/useAppViewStore.ts.
// The lab has exactly one view (the poster wall), so the view machine is a
// constant; the lattice fields keep the shape the wall modules read.

export type LatticeSource = 'queue' | 'explore';
export type AppView = 'home' | 'lattice';

type AppViewState = {
  view: AppView;
  latticeSource: LatticeSource;
  latticeReturnTileId: string | null;
  isLatticeLeftForPage: boolean;
  /** Read by wallTripLog; the lab has no separate home wall to hide. */
  isHomeFullyHidden: boolean;
  setView: (view: AppView) => void;
  setLatticeSource: (source: LatticeSource) => void;
  setLatticeReturnTileId: (tileId: string | null) => void;
  setIsLatticeLeftForPage: (isLeft: boolean) => void;
};

export const useAppViewStore = create<AppViewState>(set => ({
  view: 'lattice',
  latticeSource: 'queue',
  latticeReturnTileId: null,
  isLatticeLeftForPage: false,
  isHomeFullyHidden: true,
  setView: view => set({ view }),
  setLatticeSource: source => set({ latticeSource: source }),
  setLatticeReturnTileId: tileId => set({ latticeReturnTileId: tileId }),
  setIsLatticeLeftForPage: isLeft => set({ isLatticeLeftForPage: isLeft }),
}));
