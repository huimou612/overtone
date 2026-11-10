import React from 'react';
import type { Theme } from '../../../types';

// Lab shim for folia's src/mods/folium/registries/stageLayers.tsx — no mods,
// so every slot is empty. The props mirror the real component's.

export type FoliumStageSlot = 'player.stage.back' | 'player.stage.front' | (string & {});

export const FoliumStageLayerSlot: React.FC<{
    slot: FoliumStageSlot;
    theme: Theme;
    isDaylight: boolean;
    paused: boolean;
    className?: string;
}> = () => null;

export const useStageLayerSlots = (): unknown[] => [];
