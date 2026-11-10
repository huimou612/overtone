/// <reference types="vite/client" />

// The lyric parser reads Node's Buffer when it runs in Electron's main process;
// in the browser it falls back to TextDecoder/atob behind a `typeof` guard.
// Declared here so the shared parser type-checks without pulling in @types/node.

// Lab-trimmed from folia's vite-env.d.ts: only the Electron bridge members the copied settings
// files read. In the browser none of these exist, so the availability hooks answer "desktop only".
declare global {
    const Buffer: {
        from(input: string, encoding?: string): { toString(encoding?: string): string };
    };

    interface Window {
    electron?: {
      webUtils?: {
        /** Resolves the OS path of a dropped File (File.path was removed in modern Electron). */
        getPathForFile: (file: File) => string;
      };
      /** The WebGPU export of Beat This! (fp16 tensors + manifest), read by the main process. Null when absent. */
      getBeatThisGpuWeights?: () => Promise<{ weights: Uint8Array<ArrayBuffer>; manifest: unknown } | null>;
      /** Which automix model weights are on disk (desktop answers from electron/analysis/modelPaths.cjs). */
      getAutomixModelsPresent?: () => Promise<{ beat_this: boolean; htdemucs: boolean; htdemucs_gpu: boolean } | null>;
      /** Opens a URL in the OS browser instead of a new app window. */
      openExternalUrl?: (url: string) => void;
      /** Persists a chrome setting through the desktop shell. */
      saveSettings: (key: string, value: unknown) => Promise<unknown>;
    };
  }
}

export {};

