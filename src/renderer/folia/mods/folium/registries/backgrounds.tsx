// Lab stub for folia's src/mods/folium/registries/backgrounds.tsx.
// The real file registers mod-supplied background modes through the Folium runtime; the lab runs
// no mods, so the registry is empty and the mode helper keeps folia's exact name prefix.

import { createFoliumRegistry } from '@/mods/runtime/registry';

export const foliumBackgroundMode = (id: string): string => `mod:${id}`;

export const backgroundsRegistry = createFoliumRegistry<{ id: string }>('backgrounds');
