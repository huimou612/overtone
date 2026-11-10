import type { SongResult } from '../../types';

// Lab shim for folia's src/components/command-palette/types.ts.
// LatticePlaybackActions picks a handful of fields off the command palette's
// playback context; the lab reproduces exactly those.

export type CommandPalettePlaybackContext = {
  volume: number;
  isMuted: boolean;
  setVolume: (volume: number) => void;
  stepVolume: (delta: number) => void;
  previewVolume: (volume: number) => void;
  togglePlay: () => void;
  toggleLoop: () => void;
  next: () => void;
  prev: () => void;
  queue: SongResult[];
  playSong: (song: SongResult, queue?: SongResult[]) => void | Promise<void>;
  shuffleQueue: () => void;
  clearQueue: () => void;
  toggleSongLike: () => void | Promise<void>;
  isSongLiked: boolean;
  isFmMode: boolean;
};
