import React from 'react';
import type { FumeTuning } from '../../../types';
import { defineVisualizer, type VisualizerQuickControlsProps } from '../definition';
import { fumeBackgroundConfig } from './backgroundConfig';

const VisualizerFume = React.lazy(() => import('./VisualizerFume'));

// src/components/visualizer/fume/entry.tsx
// Registers Fume and its preview tuning panel.
const CAMERA_TRACKING_MODES: FumeTuning['cameraTrackingMode'][] = ['stepped', 'smooth'];
const CAMERA_TRACKING_LABEL_KEYS: Record<FumeTuning['cameraTrackingMode'], string> = {
    stepped: 'options.fumeCameraTrackingStepped',
    smooth: 'options.fumeCameraTrackingSmooth',
};

export default defineVisualizer({
    mode: 'fume',
    order: 60,
    labelKey: 'ui.visualizerFume',
    labelFallback: 'Fume',
    previewSeed: 'fume',
    previewStartOffset: 18.4,
    // 浮名：主歌词超出画面边界，背后叠着淡化的上下文
    glyph: (
        <>
            <path d="M6 7.5h9" opacity="0.3" />
            <path d="M1 12h22" />
            <path d="M9 16.5h9" opacity="0.3" />
        </>
    ),
    command: {
        title: 'Visualizer: Fume',
        description: 'Switch to fume visualizer',
        keywords: ['fume', '浮名'],
    },
    background: fumeBackgroundConfig,
    render: props => <VisualizerFume {...props} />,
});
