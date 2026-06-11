"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Spinner } from "./spinner";

type ToastType = "success" | "error" | "info" | "loading";
type ToastItem = { id: string; type: ToastType; message: string };

type ToastAPI = {
  success: (message: string) => string;
  error: (message: string) => string;
  info: (message: string) => string;
  loading: (message: string) => string;
  update: (id: string, patch: { type?: ToastType; message?: string }) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastAPI | null>(null);

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearTimer = useCallback((id: string) => {
    const t = timers.current[id];
    if (t) {
      clearTimeout(t);
      delete timers.current[id];
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const scheduleDismiss = useCallback(
    (id: string, type: ToastType) => {
      clearTimer(id);
      // loading toasts persist until they're updated or dismissed.
      if (type !== "loading") {
        timers.current[id] = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      }
    },
    [clearTimer, dismiss]
  );

  const push = useCallback(
    (type: ToastType, message: string) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, type, message }]);
      scheduleDismiss(id, type);
      return id;
    },
    [scheduleDismiss]
  );

  const update = useCallback(
    (id: string, patch: { type?: ToastType; message?: string }) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      if (patch.type) scheduleDismiss(id, patch.type);
    },
    [scheduleDismiss]
  );

  useEffect(() => {
    const t = timers.current;
    return () => {
      Object.values(t).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const api: ToastAPI = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
    loading: (m) => push("loading", m),
    update,
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const VARIANT: Record<ToastType, { accent: string; icon: React.ReactNode }> = {
  success: { accent: "bg-go", icon: <span className="text-go">✓</span> },
  error: { accent: "bg-decline", icon: <span className="text-decline">✕</span> },
  info: { accent: "bg-ink", icon: <span className="text-ink-soft">i</span> },
  loading: {
    accent: "bg-brand",
    icon: <Spinner className="h-3.5 w-3.5 text-brand" />,
  },
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [shown, setShown] = useState(false);

  // Trigger the enter transition on mount.
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const v = VARIANT[toast.type];

  return (
    <div
      role="status"
      className={[
        "pointer-events-auto flex w-full max-w-sm items-center gap-3 overflow-hidden",
        "rounded-card border border-line bg-surface pr-3 shadow-card transition-all duration-200",
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      ].join(" ")}
    >
      <div className={`h-full w-1 self-stretch ${v.accent}`} aria-hidden="true" />
      <div className="flex h-5 w-5 shrink-0 items-center justify-center text-sm font-semibold">
        {v.icon}
      </div>
      <p className="flex-1 py-3 text-sm text-ink">{toast.message}</p>
      {toast.type !== "loading" && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-ink-mute hover:text-ink"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}
