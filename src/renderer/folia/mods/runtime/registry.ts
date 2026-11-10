// Lab stub for folia's src/mods/runtime/registry.ts.
// The lab runs no Folium mods, so every registry is permanently empty; the hook keeps the real
// signature so the copied playground files read as they do upstream.

import { useSyncExternalStore } from 'react';

export interface FoliumRegistryEntry<Stored> {
    id: string;
    modId: string;
    name: string;
    def: Stored;
}

export interface FoliumHostRegistry<Def, Stored = Def> {
    readonly name: string;
    list(): readonly FoliumRegistryEntry<Stored>[];
    subscribe(listener: () => void): () => void;
}

const EMPTY: readonly FoliumRegistryEntry<never>[] = Object.freeze([]);

const emptyRegistry = <Def, Stored = Def>(name: string): FoliumHostRegistry<Def, Stored> => ({
    name,
    list: () => EMPTY as readonly FoliumRegistryEntry<Stored>[],
    subscribe: () => () => {},
});

export const createFoliumRegistry = <Def extends { id: string }, Stored = Def>(
    name: string,
): FoliumHostRegistry<Def, Stored> => emptyRegistry<Def, Stored>(name);

export const foliumId = (modId: string, name: string): string => `${modId}:${name}`;

/** React view of a registry's entries; empty forever in the lab. */
export const useFoliumRegistryEntries = <Stored>(
    registry: Pick<FoliumHostRegistry<never, Stored>, 'list' | 'subscribe'>,
): readonly FoliumRegistryEntry<Stored>[] => useSyncExternalStore(registry.subscribe, registry.list, registry.list);
