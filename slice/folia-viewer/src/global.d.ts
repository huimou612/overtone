import type { FoliaBridge } from './bridge';

declare global {
  interface Window {
    foliaBridge?: FoliaBridge;
  }
}

export {};
