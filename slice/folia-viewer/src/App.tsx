// 宿主舞台：把 PlayerStore 的状态组装成切片入口需要的形状并渲染。
//
// 切片契约（slice/lattice-lyrics，不要改切片）：
//   <LatticeLyricsProvider source songKey keywordColoringEnabled>
//     <LatticeLyrics tile={{ id: songKey, title, artist }} reducedMotion />
//   source: { currentTime: MotionValue<秒>, currentLineIndex, lines: Line[],
//             theme, subtitleTheme?, showSubtitleTranslation,
//             hideTranslationSubtitle, subtitleContentMode, paused, staticMode }
//   且 provider 里的 songKey 必须与 tile.id 相等，切片才肯渲染。

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import LatticeLyrics from '../../lattice-lyrics/src/components/app/lattice/lyrics/LatticeLyrics';
import LatticeLyricsProvider from '../../lattice-lyrics/src/components/app/lattice/lyrics/LatticeLyricsProvider';
import type { LatticeLyricSource } from '../../lattice-lyrics/src/components/app/lattice/lyrics/types';
import type { LatticeTile } from '../../lattice-lyrics/src/components/app/lattice/latticeModel';
import { PlayerStore } from './playerStore';
import { findCurrentLineIndex } from './lyricAdapter';
import './stage.css';

export default function App() {
  const storeRef = useRef<PlayerStore | null>(null);
  if (!storeRef.current) storeRef.current = new PlayerStore();
  const store = storeRef.current;

  useSyncExternalStore(store.subscribe, store.getVersion);
  useEffect(() => store.attach(), [store]);

  const data = store.getData();
  const lines = store.getLines();
  const theme = store.getTheme();
  const songKey = store.getSongKey();

  // 当前行：订阅时钟 MotionValue，仅在行号变化时触发 React 更新
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  useEffect(() => {
    const update = (t: number) => {
      const idx = findCurrentLineIndex(lines, t);
      setCurrentLineIndex((prev) => (prev === idx ? prev : idx));
    };
    update(store.clock.time.get());
    return store.clock.time.on('change', update);
  }, [store, lines]);

  const [reducedMotion, setReducedMotion] = useState<boolean>(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const source = useMemo<LatticeLyricSource>(() => ({
    currentTime: store.clock.time,
    currentLineIndex,
    lines,
    theme,
    showSubtitleTranslation: true,
    hideTranslationSubtitle: false,
    subtitleContentMode: 'translation',
    paused: data.status !== 'playing',
    staticMode: false,
  }), [store, currentLineIndex, lines, theme, data.status]);

  const tile = useMemo<LatticeTile>(() => ({
    id: songKey,
    queueIndex: 0,
    title: data.name || 'Folia Lattice',
    artist: data.singer || '',
    coverUrl: data.pic || undefined,
    section: 'now',
  }), [songKey, data.name, data.singer, data.pic]);

  const bridge = window.foliaBridge;

  return (
    <div className="folia-stage" style={{ backgroundColor: theme.backgroundColor }}>
      {data.pic
        ? <div className="folia-backdrop" style={{ backgroundImage: `url("${data.pic}")` }} aria-hidden="true" />
        : null}
      <div className="folia-backdrop-shade" aria-hidden="true" />
      <LatticeLyricsProvider source={source} songKey={songKey} keywordColoringEnabled={false}>
        <LatticeLyrics tile={tile} reducedMotion={reducedMotion} />
      </LatticeLyricsProvider>
      {bridge
        ? (
          <button
            type="button"
            className="folia-close"
            aria-label="关闭 Folia 窗口"
            title="关闭"
            onClick={() => bridge.close()}
          >
            ×
          </button>
          )
        : <div className="folia-mock-badge">MOCK · 无宿主桥，演示模式</div>}
    </div>
  );
}
