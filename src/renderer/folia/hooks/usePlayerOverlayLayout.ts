import type { RefObject } from 'react';
import type { FoliumLayoutRect, FoliumPlayerObstacle } from '../mods/folium/contract';

// Lab shim for folia's src/hooks/usePlayerOverlayLayout.ts.
// The app reserves the player chrome's reveal hot areas with the OS-level
// overlay; the lab draws in the page, so the reservation is a no-op that keeps
// the real call signature.

export const usePlayerOverlayReservation = (
    _key: string,
    _role: FoliumPlayerObstacle['role'],
    _read: (bounds: FoliumLayoutRect) => FoliumLayoutRect,
    _enabled = true,
    _observedRef?: RefObject<HTMLElement | null>,
): void => {};
