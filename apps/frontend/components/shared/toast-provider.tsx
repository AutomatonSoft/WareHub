"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant, durationMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function toastStyleByVariant(variant: ToastVariant): string {
  if (variant === "success") {
    return "ui-status-banner ui-status-success";
  }
  if (variant === "error") {
    return "ui-status-banner ui-status-danger";
  }
  return "ui-status-banner ui-status-info";
}

function toastIconByVariant(variant: ToastVariant) {
  if (variant === "success") {
    return <CheckCircle2 size={16} aria-hidden="true" />;
  }
  if (variant === "error") {
    return <AlertCircle size={16} aria-hidden="true" />;
  }
  return <Info size={16} aria-hidden="true" />;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = "info", durationMs = 5000) => {
    const id = nextIdRef.current++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      removeToast(id);
    }, durationMs);
  }, [removeToast]);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(92vw,24rem)] flex-col gap-2 sm:right-6 sm:top-6">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`ui-toast ui-enter-fade-up pointer-events-auto shadow-ghost ${toastStyleByVariant(toast.variant)}`}
            role={toast.variant === "error" ? "alert" : "status"}
            aria-live={toast.variant === "error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            <span className="mt-0.5">{toastIconByVariant(toast.variant)}</span>
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button
              type="button"
              className="rounded-xl p-1 text-[color:var(--text-secondary)] hover:bg-black/5"
              onClick={() => removeToast(toast.id)}
              aria-label="Close notification"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return value;
}
