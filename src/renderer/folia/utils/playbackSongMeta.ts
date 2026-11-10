import type { SongResult } from '../types';
import { getProviderSongMetadata } from '../services/onlineMusic/songMetadata';

// Lab-trimmed copy of folia's src/utils/playbackSongMeta.ts.

export const resolvePlaybackSongArtist = (song: SongResult | null | undefined): string | null => {
  if (!song) return null;
  const names = getProviderSongMetadata(song).artists.map(artist => artist.name).filter(Boolean);
  return names.length > 0 ? names.join(', ') : song.album?.name ?? null;
};

export const resolvePlaybackSongCoverUrl = (song: SongResult | null | undefined): string | null => (
  getProviderSongMetadata(song).coverUrl || null
);
