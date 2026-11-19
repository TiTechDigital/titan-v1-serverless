"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Toast } from "@/lib/types";

interface Ctx {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
}
const ToastCtx = createContext<Ctx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++n.current;
      setToasts((p) => [...p, { ...t, id }]);
      setTimeout(() => dismiss(id), 6000);
    },
    [dismiss]
  );
  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);
  return <ToastCtx.Provider value={value}>{children}</ToastCtx.Provider>;
}

export function useToasts() {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("useToasts must be used inside <ToastProvider>");
  return c;
}
