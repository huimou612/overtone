import { motionValue, type MotionValue } from 'framer-motion';

// Lab shim for folia's src/hooks/usePlayerBottomBarBottomPx.ts.
// The floating bottom bar is not part of the lab, so the shared offset is a
// constant zero. The subtitle's bottom is real, though: the lab's player chrome
// (mode strip + transport) is taller than Folia's bottom bar, so the subtitles
// sit above it instead of behind it — 32px when the chrome is hidden, matching
// Folia's baseline.

const ZERO = motionValue(0);
const SUBTITLE_ABOVE_CHROME = motionValue(170);
const SUBTITLE_BASELINE = motionValue(32);

export const usePlayerBottomBarBottomPx = (_componentBaseBottomPx?: number): MotionValue<number> => ZERO;

export const useSidePanelBottomPx = (): MotionValue<number> => ZERO;

export const usePlayerSubtitleBottomPx = (isPlayerChromeHidden: boolean): MotionValue<number> => (
    isPlayerChromeHidden ? SUBTITLE_BASELINE : SUBTITLE_ABOVE_CHROME
);
