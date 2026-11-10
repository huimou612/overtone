// Lab shim for folia's src/services/visualizerImageAsset.ts — user-uploaded
// visualizer images (IndexedDB in the app) do not exist in the lab.

interface StoredVisualizerImageAsset {
  id: string;
  name: string;
  mimeType: string;
  blob: Blob;
}

export const getStoredVisualizerImageAsset = async <T extends StoredVisualizerImageAsset>(_key: string): Promise<T | null> => null;
export const saveStoredVisualizerImageAsset = async <T extends StoredVisualizerImageAsset>(_key: string, _asset: T): Promise<void> => {};
export const clearStoredVisualizerImageAsset = async (_key: string): Promise<void> => {};
export const isSupportedVisualizerImageFile = (_file: File): boolean => false;
export const buildStoredVisualizerImageAsset = <T extends StoredVisualizerImageAsset>(_file: File): T => {
  throw new Error('[lab] visualizer image assets are unavailable');
};
