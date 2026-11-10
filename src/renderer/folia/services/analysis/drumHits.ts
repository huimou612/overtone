// Lab shim for folia's src/services/analysis/drumHits.ts.
// Drum-hit detection runs htdemucs' drum stem on the GPU in the app; the lab
// has no audio, so there are no hits. The type and constants keep exactly the
// shape the renderers and beat effects read.

export type DrumHitKind = 0 | 1 | 2;
export const DRUM_KICK: DrumHitKind = 0;
export const DRUM_SNARE: DrumHitKind = 1;
export const DRUM_HAT: DrumHitKind = 2;

export interface DrumHits {
    times: Float64Array;
    strengths: Float32Array;
    kinds: Uint8Array;
    /** While the track is still separating: the time (s) the hits reach, none after it known yet. */
    until?: number;
}

/** What one separation leaves behind: the hits, and the stem's and the mix's energy per hop. */
export interface DrumAnalysis {
    hits: DrumHits;
    drumEnergy: Float32Array;
    mixEnergy: Float32Array;
}

export const setWantedDrumTrack = (_key: string | null): void => {};

/** The hits for a track if they are already in; synchronous, as the real one. */
export const getDrumHits = (_key: string | null): DrumHits | null => null;

export const clearDrumHits = (_key?: string | null): void => {};

export const loadStoredDrumHits = async (_key: string): Promise<DrumAnalysis | null> => null;

export const loadTrackDrumHits = async (
    _key: string,
    _readBytes: () => Promise<ArrayBuffer | null>,
): Promise<DrumAnalysis | null> => null;
