import type { WallSection } from './wallLayout';

// Lab-trimmed copy of folia's src/components/app/lattice/exploreWall.ts.
// Only `summaryOfSection` survives: it is read by LatticeHeading and
// LatticeSectionFinder, which the queue wall never draws.

const KIND_LABEL_KEYS: Record<string, string> = {
  album: 'home.exploreKindAlbum',
  playlist: 'home.exploreKindPlaylist',
  mix: 'home.exploreKindMix',
  artist: 'home.exploreKindArtist',
  song: 'home.exploreKindSong',
};

const KINDS = ['album', 'playlist', 'mix', 'artist', 'song'] as const;

export const summaryOfSection = (section: WallSection, t: (key: string) => string): string => [
  String(section.entries.length),
  ...KINDS.filter(kind => section.entries.some(entry => entry.kind === kind)).map(kind => t(KIND_LABEL_KEYS[kind])),
].join(' · ');
