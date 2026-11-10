import React from 'react';
import { defineVisualizer, type VisualizerQuickControlsProps } from '../definition';

const VisualizerCladdagh = React.lazy(() => import('./VisualizerCladdagh'));

// src/components/visualizer/claddagh/entry.tsx

export default defineVisualizer({
    mode: 'claddagh',
    order: 80,
    labelKey: 'ui.visualizerCladdagh',
    labelFallback: 'Claddagh',
    previewSeed: 'claddagh',
    previewStartOffset: 0,
    // 回环：倾斜的椭圆轨道
    glyph: (
        <>
            <ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-18 12 12)" />
            <circle cx="18" cy="9" r="1.5" fill="currentColor" stroke="none" />
        </>
    ),
    command: {
        title: 'Visualizer: Claddagh',
        description: 'Switch to Claddagh visualizer',
        keywords: ['claddagh', '回环'],
    },
    render: props => <VisualizerCladdagh {...props} />,
});
