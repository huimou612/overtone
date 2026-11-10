// Lab stub for folia's src/mods/runtime/missingEntries.ts.
// Without the mods runtime there are never any missing mod selections to warn about.

import { useSyncExternalStore } from 'react';

export interface MissingFoliumSelection {
    kind: string;
    modId: string;
    name: string;
}

const EMPTY: readonly MissingFoliumSelection[] = Object.freeze([]);
const subscribe = (_listener: () => void) => () => {};
const readMissing = () => EMPTY;

export const restoreSavedFoliumSelections = () => {};

export const useMissingFoliumSelections = (): readonly MissingFoliumSelection[] =>
    useSyncExternalStore(subscribe, readMissing, readMissing);
