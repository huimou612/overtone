import type { SongResult } from '../types';

// Lab-trimmed copy of folia's src/utils/playerLikeAvailability.ts.
// Online providers are gone, so "like" is available whenever a song is loaded
// and playback controls are not disabled.

export type LikeAvailability = {
  disabled: boolean;
  reason: { key: string; params?: Record<string, string> } | null;
};

export const resolveLikeAvailability = (
  currentSong: SongResult | null,
  playbackControlsDisabled: boolean,
  _isStage: boolean,
): LikeAvailability => {
  if (!currentSong) {
    return { disabled: true, reason: null };
  }
  if (playbackControlsDisabled) {
    return { disabled: true, reason: { key: 'status.stageLikeUnavailable' } };
  }
  return { disabled: false, reason: null };
};
