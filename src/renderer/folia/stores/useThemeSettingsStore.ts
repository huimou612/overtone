import { create } from 'zustand';

// Lab version of folia's src/stores/useThemeSettingsStore.ts (the three fields
// the visualizer layer reads).

type ThemeSettingsState = {
  isDaylight: boolean;
  staticMode: boolean;
  useCoverColorBg: boolean;
  setIsDaylight: (value: boolean) => void;
  setStaticMode: (value: boolean) => void;
  setUseCoverColorBg: (value: boolean) => void;
};

export const useThemeSettingsStore = create<ThemeSettingsState>(set => ({
  isDaylight: false,
  staticMode: false,
  // The lab's common background starts cover-tinted: without it the geometric
  // layer reads as flat grey, which is the "monotonous" look the demo avoids.
  useCoverColorBg: true,
  setIsDaylight: value => set({ isDaylight: value }),
  setStaticMode: value => set({ staticMode: value }),
  setUseCoverColorBg: value => set({ useCoverColorBg: value }),
}));
