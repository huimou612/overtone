import React from 'react';
import { defineVisualizer, type VisualizerQuickControlsProps } from '../definition';

const Visualizer = React.lazy(() => import('./Visualizer'));

// src/components/visualizer/classic/entry.tsx
// Registers the classic visualizer mode.
export default defineVisualizer({
    mode: 'classic',
    order: 30,
    labelKey: 'ui.visualizerClassic',
    labelFallback: 'Luminous',
    previewSeed: 'classic',
    previewStartOffset: 0,
    // 流光：单行居中歌词，逐字点亮
    glyph: (
        <>
            <path d="M3 12h18" opacity="0.35" />
            <path d="M3 12h8" />
        </>
    ),
    command: {
        title: 'Visualizer: Luminous',
        description: 'Switch to classic visualizer',
        keywords: ['visualizer classic', 'classic', '流光'],
    },
    usesWordSegmentation: true,
    render: props => <Visualizer {...props} />,
});
