// Lab shim for folia's src/services/analysis/beatAccents.ts.
// Accents are measured from a mel spectrogram of the real audio; the simulated
// transport has no audio, so only the shape the clock and visualizers read is
// kept here.

/** Bumped when the measurement changes; a stored list of another version is recomputed. */
export const BEAT_ACCENTS_VERSION = 10;

/** Below 1 lifts the middle of the range: most beats of a driving track read as real hits. */
export const TRACK_SCALE_MIN = 0.45;

export interface BeatAccents {
    v: number;
    /** One entry per beat of the grid, in the grid's order. */
    impact: number[];
    low: number[];
    mid: number[];
    high: number[];
    /** 1 when the beat's bar has rhythm, 0 when it is sustained sound only (no beat FX there). */
    rhythmic: number[];
    /** 1 when the beat is a felt beat, 0 for one the model counted between them. */
    pulse: number[];
    trackScale: number;
}
