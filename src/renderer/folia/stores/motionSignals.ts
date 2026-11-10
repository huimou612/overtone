import { motionValue } from 'framer-motion';
import type { AudioBands } from '../types';

// Lab version of folia's src/stores/motionSignals.ts.
// The real store is fed by the audio analyser; the lab has no audio, so the
// spectrum signals are static zeros. The two clocks are real: the simulated
// transport (lab/transport.ts) drives `currentTime` and `lyricCurrentTime`,
// which every visualizer mode reads exactly as it reads the app's.

export const currentTime = motionValue(0);
export const lyricCurrentTime = motionValue(0);

export const audioPower = motionValue(0);

const zero = () => motionValue(0);
export const audioBands: AudioBands = {
  bass: zero(),
  lowMid: zero(),
  mid: zero(),
  vocal: zero(),
  treble: zero(),
  spectrum: motionValue(new Uint8Array(1024)),
};

export const beatImpact = motionValue(0);
export const downbeatImpact = motionValue(0);

// Automix blend signals: no blending in the lab.
export const handoffProgress = motionValue(0);
export const handoffLyricCurrentTime = motionValue(0);
