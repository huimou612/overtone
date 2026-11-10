import { create } from 'zustand';
import type { SongResult } from '../../../types';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { usePlaybackStore } from '../../../stores/usePlaybackStore';
import { usePlayingSongLocatorStore } from '../../../stores/usePlayingSongLocatorStore';

// Lab-trimmed copy of folia's src/components/app/playing-song-locator/playingSongLocator.ts.
// In the lab the only "page" that can answer a locate request is the poster
// wall itself (wallLocate.ts), so the collection-page machinery is gone.

export interface LocateRequestLike {
  nonce: number;
  collectionKey: string;
  songKey: string;
}

let nextNonce = 1;

/** Asks `pageKey` to show the playing song. The wall answers for its own key. */
export const locatePlayingSongOnPage = (pageKey: string): void => {
  const song = usePlaybackStore.getState().currentSong;
  const songKey = song ? getPlaybackSongKey(song) : null;
  if (!songKey) return;
  usePlayingSongLocatorStore.getState().setRequest({ nonce: nextNonce++, collectionKey: pageKey, songKey });
};

/** A page's answer: it has the song, or it does not. */
export const answerLocateRequest = (nonce: number, isHere: boolean): void => {
  const store = usePlayingSongLocatorStore.getState();
  if (store.request?.nonce !== nonce) return;
  store.setRequest(null);
  console.log(`[Locate] answered nonce=${nonce} isHere=${isHere}`);
};
