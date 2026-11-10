// Lab shim for folia's src/mods/folium/contract.ts — the layout rect mods may reserve.
export interface FoliumLayoutRect {
    /** Left edge. */
    readonly left: number;
    /** Top edge. */
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

export type FoliumPlayerObstacle = {
    key: string;
    role: string;
    kind: 'reveal-area' | 'chrome';
    rect: FoliumLayoutRect;
};
