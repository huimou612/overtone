// Lab shim for folia's src/mods/folium/registries/visualizers.ts — builtins only.
import { createFoliumRegistry, type FoliumHostRegistry } from '@/mods/runtime/registry';

export const useFoliumVisualizerSettings = (_mode?: string): Record<string, never> => ({});

export interface FoliumVisualizerDef {
    id: string;
}

export const visualizersRegistry: FoliumHostRegistry<FoliumVisualizerDef> = createFoliumRegistry<FoliumVisualizerDef>('visualizers');
