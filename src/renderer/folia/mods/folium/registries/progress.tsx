import React from 'react';
import type { MotionValue } from 'framer-motion';

// Lab shim for folia's src/mods/folium/registries/progress.tsx.
// The Folium mod system lets mods inject progress-bar buttons and layers; the
// lab runs with no mods, so every part renders nothing.

type FoliumProgressContextValue = {
  currentTime: MotionValue<number>;
  duration: number;
  onSeek: (time: number) => void;
  disabled: boolean;
  colors: { fill: string; track: string; text: string };
};

export const useFoliumProgressContext = (value: FoliumProgressContextValue): FoliumProgressContextValue => value;

export const FoliumProgressButtons: React.FC<{ slot: string; ctx: FoliumProgressContextValue; collapsed?: boolean }> = () => null;

export const FoliumProgressLayers: React.FC<{ ctx: FoliumProgressContextValue }> = () => null;
