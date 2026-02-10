'use client';

import { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}

export default function Toast({
  message,
  type = 'info',
  duration = 5000,
  onClose,
  action,
}: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(onClose, 200);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 200);
  };

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const styles: Record<ToastType, { bg: string; accent: string; text: string; icon: string }> = {
    success: {
      bg: 'bg-white',
      accent: 'bg-emerald-500',
      text: 'text-gray-700',
      icon: 'text-emerald-500',
    },
    error: {
      bg: 'bg-white',
      accent: 'bg-red-500',
      text: 'text-gray-700',
      icon: 'text-red-500',
    },
    warning: {
      bg: 'bg-white',
      accent: 'bg-amber-500',
      text: 'text-gray-700',
      icon: 'text-amber-500',
    },
    info: {
      bg: 'bg-white',
      accent: 'bg-blue-500',
      text: 'text-gray-700',
      icon: 'text-blue-500',
    },
  };

  const Icon = icons[type];
  const s = styles[type];

  return (
    <div
      className={`
        fixed bottom-[72px] left-1/2 z-50
        flex items-center gap-2.5
        ${s.bg} rounded-xl
        shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)]
        max-w-sm overflow-hidden
        ${isExiting ? 'animate-toast-exit' : 'animate-toast-enter'}
      `}
      role="alert"
    >
      {/* Color accent bar */}
      <div className={`w-1 self-stretch ${s.accent} rounded-l-xl shrink-0`} />

      <Icon className={`w-4 h-4 shrink-0 ${s.icon}`} />

      <p className={`flex-1 text-[13px] font-medium ${s.text} py-2.5 pr-1 leading-snug`}>
        {message}
      </p>

      {action && (
        <button
          type="button"
          onClick={() => {
            action.onClick();
            handleClose();
          }}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
        >
          {action.label}
        </button>
      )}

      <button
        onClick={handleClose}
        className="shrink-0 p-1.5 mr-2 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
