// Lab shim for folia's src/mods/folium/registries/tunings.ts — no mods, empty bundle.
// Keeps the exports the copied playground files read; nothing renders without entries.
import React from 'react';
import type { Theme } from '../../../types';
import { createFoliumRegistry, type FoliumHostRegistry } from '@/mods/runtime/registry';

export const useFoliumTunings = (_mode?: string): Record<string, never> => ({});

export interface FoliumTuningDef {
    id: string;
    /** The visualizer mode the tuning belongs to. */
    target: string;
}

export const tuningsRegistry: FoliumHostRegistry<FoliumTuningDef> = createFoliumRegistry<FoliumTuningDef>('tunings');

/** Cards of mod-registered tunings for a mode; empty forever in the lab. */
export const FoliumTuningCards: React.FC<{
    mode: string;
    theme?: Theme;
    isDaylight: boolean;
    controlCardBg: string;
    rangeInputClass: string;
    description?: string;
}> = () => null;
