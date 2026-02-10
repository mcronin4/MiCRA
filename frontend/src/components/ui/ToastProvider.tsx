'use client';

import Toast from '@/components/ui/Toast';
import { useToastStore } from '@/lib/stores/toastStore';

export function ToastProvider() {
  const toast = useToastStore((s) => s.toast);
  const dismissToast = useToastStore((s) => s.dismissToast);

  if (!toast) return null;

  return (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={dismissToast}
      action={toast.action}
      duration={4000}
    />
  );
}
