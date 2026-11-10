import { useMemo, useState } from 'react';
import { House, Lightbulb, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePlaybackStore } from '../../../stores/usePlaybackStore';
import { usePlayingSongLocatorStore } from '../../../stores/usePlayingSongLocatorStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import { useLatticeSettingsStore } from '../../../stores/useLatticeSettingsStore';
import { GridLocateButton } from '../playing-song-locator/GridLocateButton';
import type { LatticeTile } from './latticeModel';
import { locatePlayingSongOnWall, useWallPageKey } from './wallLocate';

// Lab version of folia's src/components/app/lattice/LatticeFocusButton.tsx.
// The original mounts the shared WallToolsButton (a large dependency tree:
// UnifiedPanel surfaces, command palette, player bar layout...). The lab keeps
// the corner's three real jobs — locate the playing song, go home, and the
// wall's own look switches — without that tree. The switches write the very
// same useLatticeSettingsStore the wall reads.

export default function LatticeFocusButton({ isDaylight, tiles, onGoHome }: { isDaylight: boolean; tiles: LatticeTile[]; onGoHome?: () => void }) {
  const { t } = useTranslation();
  const [panelOpen, setPanelOpen] = useState(false);
  const playingSongKey = usePlaybackStore(state => (state.currentSong ? getPlaybackSongKey(state.currentSong) : null));
  const pageKey = useWallPageKey();
  const isLocateAsked = usePlayingSongLocatorStore(state => state.request?.collectionKey === pageKey);
  const isPlayingSongHere = useMemo(() => (
    playingSongKey !== null && tiles.some(tile => tile.id === playingSongKey)
  ), [playingSongKey, tiles]);

  const vignette = useLatticeSettingsStore(state => state.latticeVignette);
  const lightsOn = useLatticeSettingsStore(state => state.latticeLightsOn);
  const posterTintEnabled = useLatticeSettingsStore(state => state.latticePosterTintEnabled);
  const handleToggleLatticeVignette = useLatticeSettingsStore(state => state.handleToggleLatticeVignette);
  const handleToggleLatticeLights = useLatticeSettingsStore(state => state.handleToggleLatticeLights);
  const handleToggleLatticePosterTint = useLatticeSettingsStore(state => state.handleToggleLatticePosterTint);

  return (
    <div className="lattice-focus-lab">
      {playingSongKey !== null && (
        <GridLocateButton
          isDaylight={isDaylight}
          accentColor="var(--text-accent, #f7f4ee)"
          isHere={isPlayingSongHere}
          isSeeking={isLocateAsked}
          title={t('playlist.locatePlaying')}
          onLocate={locatePlayingSongOnWall}
        />
      )}
      <button
        type="button"
        className={`lattice-focus-lab-button ${panelOpen ? 'is-open' : ''}`}
        aria-label={t('home.latticeTools')}
        title={t('home.latticeTools')}
        aria-expanded={panelOpen}
        onClick={() => setPanelOpen(open => !open)}
      >
        <SlidersHorizontal size={18} />
      </button>
      {onGoHome && (
        <button
          type="button"
          className="lattice-focus-lab-button"
          aria-label={t('wallTools.goHome')}
          title={t('wallTools.goHome')}
          onClick={onGoHome}
        >
          <House size={18} />
        </button>
      )}
      {panelOpen && (
        <div className="lattice-focus-lab-panel" role="group" aria-label={t('home.latticeTools')}>
          <span className="lattice-focus-lab-title"><Lightbulb size={14} /> {t('home.latticeTools')}</span>
          <label>
            <input type="checkbox" checked={lightsOn} onChange={event => handleToggleLatticeLights(event.target.checked)} />
            <span>{t('home.latticeLights')}</span>
          </label>
          <label>
            <input type="checkbox" checked={vignette} onChange={event => handleToggleLatticeVignette(event.target.checked)} />
            <span>{t('home.latticeVignette')}</span>
          </label>
          <label>
            <input type="checkbox" checked={posterTintEnabled} onChange={event => handleToggleLatticePosterTint(event.target.checked)} />
            <span>{t('home.latticePosterTint')}</span>
          </label>
        </div>
      )}
    </div>
  );
}
