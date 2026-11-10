import type { TemperaLayerImage } from '../types';

// Lab shim for folia's src/services/temperaLayerImages.ts — the user image pool
// is empty in the lab, so every lookup resolves to no blob.

export const loadTemperaLayerImageBlobs = async (
    _placements: Pick<TemperaLayerImage, 'id'>[],
): Promise<Map<string, Blob>> => new Map();

export const loadTemperaLayerImageThumbnails = async (
    _placements: Pick<TemperaLayerImage, 'id'>[],
): Promise<Map<string, Blob>> => new Map();

export const createTemperaImageArchive = async (): Promise<Blob> => {
  throw new Error('[lab] tempera image archive is unavailable');
};
export const importTemperaImageArchive = async (): Promise<number> => 0;
export const deleteTemperaLayerImage = async (_id?: string): Promise<void> => {};
