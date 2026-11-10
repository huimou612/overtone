import { create } from 'zustand';
import { PlayerState, type LyricData, type SongResult, type StageLoopMode } from '../types';
import { getPlaybackSongKey } from '../utils/appPlaybackGuards';

// Lab playback store: the mirror of the simulated transport that store-readers
// (LatticeFocusButton, the locator, VideoLayer) consult. The lab host writes it
// whenever the simulated clock changes song or transport state.

type PlaybackState = {
  currentSong: SongResult | null;
  queue: SongResult[];
  lyrics: LyricData | null;
  playerState: PlayerState;
  loopMode: StageLoopMode;
  currentLineIndex: number;
  likedSongKeys: string[];
  /** A blend's held picture (automix hand-off). The lab never blends, so this is always null. */
  transitionDisplay: { song: SongResult | null } | null;
  /** The line the incoming song's hand-off starts on; -1 when no blend runs. */
  handoffLineIndex: number;
  setCurrentSong: (song: SongResult | null, queue: SongResult[], lyrics: LyricData | null) => void;
  setPlayerState: (state: PlayerState) => void;
  setLoopMode: (mode: StageLoopMode) => void;
  setCurrentLineIndex: (index: number) => void;
  toggleSongLike: (song: SongResult) => void;
  isSongLiked: (song: SongResult) => boolean;
};

export const usePlaybackStore = create<PlaybackState>((set, get) => ({
  currentSong: null,
  queue: [],
  lyrics: null,
  playerState: PlayerState.PAUSED,
  loopMode: 'all',
  currentLineIndex: -1,
  likedSongKeys: [],
  transitionDisplay: null,
  handoffLineIndex: -1,
  setCurrentSong: (song, queue, lyrics) => set({ currentSong: song, queue, lyrics }),
  setPlayerState: state => set({ playerState: state }),
  setLoopMode: mode => set({ loopMode: mode }),
  setCurrentLineIndex: index => set(state => (state.currentLineIndex === index ? state : { currentLineIndex: index })),
  toggleSongLike: song => set(state => {
    const key = getPlaybackSongKey(song);
    const liked = state.likedSongKeys.includes(key);
    return {
      likedSongKeys: liked
        ? state.likedSongKeys.filter(item => item !== key)
        : [...state.likedSongKeys, key],
    };
  }),
  isSongLiked: song => get().likedSongKeys.includes(getPlaybackSongKey(song)),
}));

// Display selectors (lab versions of folia's): with no automix blend, the
// displayed song is simply the current one.

export const selectDisplaySong = (state: PlaybackState) => state.currentSong;
export const selectDisplayLyrics = (state: PlaybackState) => state.lyrics;
export const selectDisplayPlayerState = (state: PlaybackState) => state.playerState;
export const selectDisplayCoverUrl = (state: PlaybackState) => state.currentSong?.album?.coverUrl ?? null;
export const selectDisplayDuration = (state: PlaybackState) => (
  state.currentSong ? state.currentSong.durationMs / 1000 : 0
);
export const selectIsShowingTail = (_state: PlaybackState) => false;

/** The live song's cover, as the visualizer reads it (folia's selectCoverUrl). */
export const selectCoverUrl = (state: PlaybackState): string | null => (
  state.currentSong?.album?.coverUrl ?? null
);
