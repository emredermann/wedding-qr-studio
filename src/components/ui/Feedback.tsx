"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/provider";

export type ToastVariant = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  title: string;
  variant: ToastVariant;
}

export function useToastQueue() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (title: string, variant: ToastVariant = "success", durationMs = 3800) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, variant }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    },
    [],
  );

  return { toasts, pushToast, dismissToast };
}

export function ToastRegion({
  toasts,
  onDismiss,
}: {
  toasts: ReadonlyArray<ToastMessage>;
  onDismiss: (id: string) => void;
}) {
  const t = useT();
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="eqr-safe-bottom pointer-events-none fixed right-4 bottom-4 left-4 z-[70] flex flex-col items-end gap-2 sm:left-auto sm:w-96"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`pointer-events-auto flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-medium shadow-xl backdrop-blur-md transition-all ${
            toast.variant === "error"
              ? "border-rose-300 bg-rose-950/95 text-rose-100"
              : toast.variant === "info"
                ? "border-stone-700 bg-stone-900/95 text-stone-100"
                : "border-emerald-600/50 bg-stone-950/95 text-emerald-100"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {toast.variant === "error" ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            ) : toast.variant === "info" ? (
              <Info className="h-4 w-4 shrink-0 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <span className="break-words leading-snug">{toast.title}</span>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label={t("Bildirimi kapat")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function FieldError({
  id,
  message,
  dark = false,
}: {
  id?: string;
  message?: string | null;
  dark?: boolean;
}) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className={`mt-1.5 flex items-start gap-1.5 text-xs font-medium ${
        dark ? "text-rose-300" : "text-rose-600"
      }`}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/**
 * Enforces ESC key dismissal, body scroll lock with clean unmount restoration,
 * and keyboard Tab focus trapping inside an open modal dialog.
 */
export function useModalAccessibility({
  isOpen,
  onClose,
  containerRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  containerRef?: RefObject<HTMLElement | null>;
}): void {
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === "Tab" && containerRef?.current) {
        const focusable = containerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (!active || active === first || !containerRef.current.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (!active || active === last || !containerRef.current.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [containerRef, isOpen, onClose]);
}
