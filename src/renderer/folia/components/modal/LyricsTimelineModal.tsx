import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValueEvent, type MotionValue } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LyricData, Theme } from '../../types';
import { formatTime } from '../../utils/appPlaybackHelpers';

// Lab version of folia's src/components/modal/LyricsTimelineModal.tsx.
// Same contract as the original (props below), simplified body: a scrolling
// list of lyric lines that highlights the active one and seeks on click.

type Props = {
  isOpen: boolean;
  onClose: () => void;
  lyrics: LyricData | null;
  currentTime: MotionValue<number>;
  duration: number;
  onSeek: (time: number) => void;
  isDaylight?: boolean;
  disabled?: boolean;
};

export default function LyricsTimelineModal({ isOpen, onClose, lyrics, currentTime, duration, onSeek, isDaylight = false, disabled = false }: Props) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => currentTime.get());
  const listRef = useRef<HTMLDivElement>(null);
  useMotionValueEvent(currentTime, 'change', setNow);

  const activeIndex = useMemo(() => {
    const lines = lyrics?.lines ?? [];
    let index = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (now >= lines[i].startTime && now <= (lines[i].renderHints?.renderEndTime ?? lines[i].endTime)) index = i;
    }
    return index;
  }, [lyrics, now]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-line-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'center' });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const lines = lyrics?.lines ?? [];

  return (
    <motion.div
      className={`lab-timeline-overlay ${isDaylight ? 'is-daylight' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div
        className="lab-timeline"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        <header>
          <strong>{t('home.latticeTimeline')}</strong>
          <span className="lab-timeline-meta">{formatTime(now)} / {formatTime(duration)}</span>
          <button type="button" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}>
            <X size={18} />
          </button>
        </header>
        <div className="lab-timeline-list" ref={listRef}>
          {lines.length === 0 && <p className="lab-timeline-empty">{t('home.latticeNoLyrics')}</p>}
          {lines.map((line, index) => (
            <button
              key={`${line.startTime}-${index}`}
              type="button"
              data-line-index={index}
              className={`lab-timeline-line ${index === activeIndex ? 'is-active' : ''} ${line.isChorus ? 'is-chorus' : ''}`}
              disabled={disabled}
              onClick={() => onSeek(line.startTime)}
            >
              <span className="lab-timeline-time">{formatTime(line.startTime)}</span>
              <span className="lab-timeline-text">{line.fullText}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
