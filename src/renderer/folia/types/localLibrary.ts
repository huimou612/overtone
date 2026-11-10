// Lab-trimmed local song reference (appPlaybackGuards only reads `songId`).

export interface LocalSongReference {
  songId: string;
  [key: string]: unknown;
}
