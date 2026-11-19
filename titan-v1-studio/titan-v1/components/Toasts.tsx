"use client";
import { X } from "lucide-react";
import { useToasts } from "@/hooks/useToasts";

const BAR = { success: "bg-cobalt", error: "bg-danger", info: "bg-dim" } as const;

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,340px)] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex overflow-hidden rounded-md border border-line-strong bg-raised shadow-lg shadow-black/40">
          <span className={`w-1 shrink-0 ${BAR[t.kind]}`} />
          <div className="min-w-0 flex-1 px-3 py-2.5">
            <p className="text-[13px] font-medium text-fg">{t.title}</p>
            {t.message && <p className="mt-0.5 break-words text-[12px] text-mute">{t.message}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="px-2.5 text-dim transition-colors hover:text-fg"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
