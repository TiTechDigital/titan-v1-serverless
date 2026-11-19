import type { GenStatus } from "@/lib/types";
import type { EntitlementView } from "@/hooks/useEntitlement";

export function Header({ status, ent }: { status: GenStatus; ent: EntitlementView }) {
  const busy = status === "queued" || status === "generating";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between px-5">
      <div className="flex items-center gap-8">
        <span className="display text-[18px]">Titan</span>
        <nav aria-label="Sections" className="text-[14px] font-semibold">
          <span className="text-cobalt-ice" aria-current="page">Video</span>
        </nav>
      </div>
      <div className="flex items-center gap-4 text-[13px] text-mute">
      <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 font-semibold text-fg">
        {ent.limits.label}{ent.videosLeft !== null ? ` · ${ent.videosLeft} left` : ""}
      </span>
      <div className="flex items-center gap-2" role="status">
        <span className={`h-2 w-2 rounded-full ${busy ? "animate-tally bg-tally" : "bg-dim"}`} />
        <span className={busy ? "text-fg" : ""}>{status === "queued" ? "Waiting for GPU" : status === "generating" ? "Rendering" : "Idle"}</span>
      </div>
      </div>
    </header>
  );
}
