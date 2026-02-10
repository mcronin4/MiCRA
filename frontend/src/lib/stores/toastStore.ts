import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastState {
  toast: {
    message: string;
    type: ToastType;
    action?: { label: string; onClick: () => void };
  } | null;
  showToast: (
    message: string,
    type?: ToastType,
    action?: { label: string; onClick: () => void }
  ) => void;
  dismissToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  showToast: (message, type = 'info', action) =>
    set({ toast: { message, type, action } }),
  dismissToast: () => set({ toast: null }),
}));

/** Call from anywhere (including outside React) to show a toast */
export function showToast(
  message: string,
  type?: ToastType,
  action?: { label: string; onClick: () => void }
) {
  useToastStore.getState().showToast(message, type ?? 'info', action);
}
