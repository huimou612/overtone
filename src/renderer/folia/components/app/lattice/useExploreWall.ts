import { useMemo } from 'react';
import type { LatticeTile } from './latticeModel';
import type { WallSection } from './wallLayout';

// Lab stub for folia's src/components/app/lattice/useExploreWall.ts.
// The lab runs the queue wall only (`latticeSource: 'queue'`), so the explore
// feed is never mounted. The hook keeps the shape Lattice.tsx consumes.

export type ExploreWall = {
  tiles: LatticeTile[];
  sections: WallSection[] | undefined;
  canRefresh: boolean;
  isRefreshing: boolean;
  refresh: () => void;
  emptyText: string | null;
};

export function useExploreWall(_options: {
  isOn: boolean;
  currentSong: unknown;
  providerId?: string;
  accountId?: string;
}): ExploreWall {
  return useMemo(() => ({
    tiles: [] as LatticeTile[],
    sections: undefined,
    canRefresh: false,
    isRefreshing: false,
    refresh: () => {},
    emptyText: null,
  }), []);
}
