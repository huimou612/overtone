import React from 'react';
import type { TemperaColorMode, TemperaTuning } from '../../../types';
import { defineVisualizer, type VisualizerQuickControlsProps } from '../definition';

const VisualizerTempera = React.lazy(() => import('./VisualizerTempera'));

// src/components/visualizer/tempera/entry.tsx
// Registers 凝彩, the deterministic block-composition lyric-PV director.
const COLOR_MODES: TemperaColorMode[] = ['duo', 'mono', 'gradient'];
const COLOR_MODE_LABEL_KEYS: Record<TemperaColorMode, string> = {
    duo: 'options.temperaColorModeDuo',
    mono: 'options.temperaColorModeMono',
    gradient: 'options.temperaColorModeGradient',
};

export default defineVisualizer({
    mode: 'tempera',
    order: 20,
    labelKey: 'ui.visualizerTempera',
    labelFallback: 'Tempera',
    previewSeed: 'tempera',
    previewStartOffset: 0,
    // 凝彩：上下色块分割与分割线
    glyph: (
        <>
            <rect x="4" y="4" width="16" height="6.5" rx="1" />
            <rect x="4" y="13.5" width="16" height="6.5" rx="1" opacity="0.45" />
            <path d="M4 12h16" opacity="0.7" />
        </>
    ),
    command: {
        title: 'Visualizer: Tempera',
        description: 'Switch to Tempera visualizer',
        keywords: ['tempera', '凝彩', 'dancai', 'dc', '色块 pv', 'block pv'],
    },
    usesWordSegmentation: true,
    // Deliberately unkeyed on the seed: the runtime hands a track change over in place
    // (see songHandover.ts / pixiRuntimeHost.ts). Remounting here would throw the WebGL
    // context away mid-transition and leave the frame empty for the whole rebuild.
    render: props => <VisualizerTempera {...props} />,
    ownFontSizeNoticeKey: 'options.temperaFontSizeAutoNotice',
});
