import React from 'react';
import { DEFAULT_MONET_TUNING, type MonetTuning } from '../../../types';
import { defineVisualizer, type VisualizerQuickControlsProps } from '../definition';

const VisualizerMonet = React.lazy(() => import('./VisualizerMonet'));

// src/components/visualizer/monet/entry.tsx
// Registers the Monet poster visualizer and its mode-owned settings panel.
export default defineVisualizer({
    mode: 'monet',
    order: 90,
    labelKey: 'ui.visualizerMonet',
    labelFallback: 'Monet',
    previewSeed: 'monet',
    previewStartOffset: 0,
    // 莫奈：左侧关键字，右侧立绘
    glyph: (
        <>
            <path d="M3 9.5h7" />
            <path d="M3 13.5h5" opacity="0.55" />
            <rect x="14" y="5" width="7" height="14" rx="1.5" opacity="0.55" />
        </>
    ),
    command: {
        title: 'Visualizer: Monet',
        description: 'Switch to Monet visualizer',
        keywords: ['monet', '莫奈', '切换到可视化：莫奈', '切换到可视化莫奈'],
    },
    seeksOnLineClick: true,
    // 混音过渡时背景和封面随过渡换成下一首，文字和歌词在交叉点换（VisualizerMonet）
    followsSongHandoff: true,
    render: props => {
        const monetTuning = props.monetTuning ?? DEFAULT_MONET_TUNING;
        const lyricsFontScale = props.lyricsFontScale ?? 1;
        return (
            <VisualizerMonet
                {...props}
                monetTuning={{
                    ...monetTuning,
                    fontScale: monetTuning.fontScale * lyricsFontScale,
                }}
            />
        );
    },
});
