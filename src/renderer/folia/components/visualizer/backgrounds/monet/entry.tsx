
import { DEFAULT_MONET_BACKGROUND_TUNING, type MonetBackgroundSource, type MonetBackgroundTuning } from '../../../../types';
import MonetBackgroundLayer, { resolveMonetSourceUrl } from './MonetBackgroundLayer';
import { defineVisualizerBackground } from '../definition';

// src/components/visualizer/backgrounds/monet/entry.tsx
// Registers the Monet image-treatment shell background.

const SOURCE_LABEL_KEYS: Record<MonetBackgroundSource, string> = {
    'cover-derived': 'options.monetBackgroundSourceCover',
    'uploaded-global': 'options.monetBackgroundSourceUploaded',
};

export default defineVisualizerBackground({
    mode: 'monet',
    order: 20,
    labelKey: 'options.visualizerBackgroundModeMonet',
    labelFallback: 'Monet',
    // 莫奈：整幅画面被一条斜线分成两种处理
    glyph: (
        <>
            <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
            <path d="M20.5 8.5L8 19.5" opacity="0.55" />
        </>
    ),
    // The picture is made from the cover, or from the uploaded image where that comes first. The theme
    // colours change in place, with the picture's own crossfade.
    song: ({ config, coverUrl }) => [
        resolveMonetSourceUrl(coverUrl, config?.customImage, config?.monet?.tuning ?? DEFAULT_MONET_BACKGROUND_TUNING),
    ],
    render: ({ config, coverUrl, theme, isDaylight, staticMode }) => (
        <MonetBackgroundLayer
            coverUrl={coverUrl}
            monetBackgroundImage={config?.customImage}
            theme={theme}
            isDaylight={isDaylight}
            tuning={config?.monet?.tuning}
            transparentBackground={config?.transparent}
            staticMode={staticMode}
        />
    ),
    resetSettings: actions => actions?.monet?.onResetTuning?.(),
});
