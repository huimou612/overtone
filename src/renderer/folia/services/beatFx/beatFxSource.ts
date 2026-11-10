import type { BeatFxEvent } from './clock';

// Lab shim for folia's src/services/beatFx/beatFxSource.ts.
// The real source loads/analyses a track's beat list through the audio pipeline.
// The simulated transport has no audio, so no beats are ever sourced; the type
// shapes the renderers read are kept.

export type BeatFxSourceKind = 'beat_this' | 'none';

export interface BeatFxTrackBeats {
    events: BeatFxEvent[];
    source: BeatFxSourceKind;
    /** Why there are no beats, when there are none. */
    note?: string;
    trackScale: number;
}

export const requestTrackBeats = async (_key: string | null): Promise<BeatFxTrackBeats> => ({
    events: [],
    source: 'none',
    note: 'lab: no audio analysis',
    trackScale: 1,
});

export const cancelTrackBeats = (_key: string | null): void => {};
