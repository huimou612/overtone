// Lab version of folia's src/stores/useStatusMessageStore.ts: status toasts
// are not part of the experiment, so a set is a console line.

export const setStatusMessage = (message: { type: string; text: string; note?: string }): void => {
  console.log(`[lab:status:${message.type}] ${message.text}`);
};

type StatusMessageState = {
  setStatusMessage: typeof setStatusMessage;
};

export const useStatusMessageStore = create<StatusMessageState>(() => ({ setStatusMessage }));

import { create } from 'zustand';
