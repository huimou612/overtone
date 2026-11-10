// Lab-trimmed navidrome song (appPlaybackGuards only reads the carrier fields).

import type { LyricData, SongResult } from '../types';

export interface NavidromeSong extends SongResult {
  isNavidrome: true;
  navidromeData?: NavidromeSong | unknown;
  matchedLyrics?: LyricData;
}

// OpenSubsonic structured lyrics, verbatim from folia's src/types/navidrome.ts.
export interface StructuredLyricLine {
  start: number;
  value: string;
}

export interface StructuredLyricCue {
  start?: number;
  end?: number;
  value: string;
  byteStart?: number;
  byteEnd?: number;
}

export interface StructuredLyricCueLine {
  index: number;
  start?: number;
  end?: number;
  value: string;
  agentId?: string;
  cue?: StructuredLyricCue[];
}

export interface StructuredLyricAgent {
  id: string;
  role?: string;
  name?: string;
}

export interface StructuredLyric {
  displayArtist?: string;
  displayTitle?: string;
  lang?: string;
  kind?: 'main' | 'translation' | 'pronunciation' | string;
  line: StructuredLyricLine[];
  cueLine?: StructuredLyricCueLine[];
  agents?: StructuredLyricAgent[];
  offset?: number;
  synced?: boolean;
}
