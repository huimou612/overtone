import { useEffect, useRef, useState } from 'react';
import type { MotionValue } from 'framer-motion';
import type { Line } from '../types';
import { findLatestActiveLineIndex } from '../utils/appPlaybackHelpers';

// Subscribes to the transport clock and returns the active lyric line index.
// State only moves when the index actually changes (about once per line), so
// the wall tree re-renders per line — never per frame.

export function useActiveLineIndex(currentTime: MotionValue<number>, lines: Line[]): number {
  const [index, setIndex] = useState(-1);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  useEffect(() => {
    const update = (time: number) => {
      const next = findLatestActiveLineIndex(linesRef.current, time);
      setIndex(previous => (previous === next ? previous : next));
    };
    update(currentTime.get());
    const unsubscribe = currentTime.on('change', update);
    return () => { unsubscribe(); };
  }, [currentTime]);

  return index;
}
