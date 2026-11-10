// WebGL capability probe + the list of styles that cannot run without it.
//
// Chromium can be started with WebGL disabled ("disabled by enterprise policy
// or commandline switch"). In that case three.js / pixi / paper-shaders throw
// while React is rendering, which used to tear down the whole island and leave
// an empty full-screen div that swallowed every click. We detect it once and
// fall back to a DOM-only style, and an ErrorBoundary covers anything else.

import type { VisualizerMode, VisualizerBackgroundMode } from '@/types';

let cached: boolean | null = null;

export const hasWebGL = (): boolean => {
    if (cached !== null) return cached;
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        cached = Boolean(gl);
        // Release the probe context so it does not count against the browser cap.
        const lose = gl?.getExtension('WEBGL_lose_context');
        lose?.loseContext();
    } catch {
        cached = false;
    }
    return cached;
};

/** Modes that instantiate a WebGL context (three.js / pixi / paper-shaders). */
export const WEBGL_MODES: ReadonlySet<string> = new Set([
    'sonnet',
    'tempera',
    'pendolo',
    'diorama',
    'lumiere',
    'hanabi',
]);

/** Backgrounds that use shaders. `common` is a plain CSS/DOM backdrop. */
export const WEBGL_BACKGROUNDS: ReadonlySet<string> = new Set([
    'latent',
    'monet',
    'nomand',
    'sora',
    'url',
]);

export const SAFE_VISUALIZER_MODE: VisualizerMode = 'classic';
export const SAFE_BACKGROUND_MODE: VisualizerBackgroundMode = 'common';

export const isModeAvailable = (mode: string): boolean => hasWebGL() || !WEBGL_MODES.has(mode);
export const resolveMode = (mode: VisualizerMode): VisualizerMode =>
    isModeAvailable(mode) ? mode : SAFE_VISUALIZER_MODE;
export const resolveBackgroundMode = (mode: VisualizerBackgroundMode): VisualizerBackgroundMode =>
    hasWebGL() || !WEBGL_BACKGROUNDS.has(mode) ? mode : SAFE_BACKGROUND_MODE;
