"use client";
import { useRef } from "react";
import { Play, RotateCcw, X } from "lucide-react";
import { ASPECTS, EXAMPLES, STAGES } from "@/lib/constants";
import type { AspectId, GenStatus, HistoryItem } from "@/lib/types";

const ratioOf = (a: AspectId) => ASPECTS.find((x) => x.id === a)!.ratio;
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// SMPTE test pattern, the picture a monitor shows with no signal.
const BARS = [
  "linear-gradient(to right,#c0c0c0 0 14.28%,#c0c000 0 28.57%,#00c0c0 0 42.85%,#00c000 0 57.14%,#c000c0 0 71.43%,#c00000 0 85.71%,#0000c0 0 100%) top/100% 68% no-repeat",
  "linear-gradient(to right,#0000c0 0 14.28%,#131313 0 28.57%,#c000c0 0 42.85%,#131313 0 57.14%,#00c0c0 0 71.43%,#131313 0 85.71%,#c0c0c0 0 100%) 0 74%/100% 8% no-repeat",
  "#0a0a0a",
].join(",");

export function Hero({ onPick }: { onPick: (prompt: string, aspect: AspectId) => void }) {
  return (
    <div className="relative flex h-full min-h-[52vh] flex-col items-center justify-center overflow-hidden rounded-xl bg-black px-6 py-14 text-center">
      <div aria-hidden className="absolute inset-0 opacity-[0.16] blur-[1px] saturate-[.8]" style={{ background: BARS }} />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black" />
      <div className="relative">
        <h1 className="display text-[clamp(34px,7vw,84px)]">
          Prompt in.<br />Finished video out.
        </h1>
        <p className="mx-auto mt-5 max-w-[460px] text-[15px] text-mute">
          One render gives you the motion, the cinema pass, the voice-over and the music.
        </p>
        <div className="mx-auto mt-7 flex max-w-[760px] flex-wrap justify-center gap-2">
          {EXAMPLES.map((e) => (
            <button key={e.prompt} type="button" onClick={() => onPick(e.prompt, e.aspect)}
              className="max-w-[340px] truncate rounded-full border border-white/15 bg-black/50 px-4 py-2 text-[13px] text-fg backdrop-blur transition-colors hover:border-white/40">
              {e.prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function JobCard({
  status, stage, elapsedMs, aspect, prompt, error, onCancel, onRetry, onDismiss,
}: {
  status: GenStatus; stage: number; elapsedMs: number; aspect: AspectId; prompt: string; error: string | null;
  onCancel: () => void; onRetry: () => void; onDismiss: () => void;
}) {
  const failed = status === "error";
  return (
    <div className="mb-4 break-inside-avoid">
      <div style={{ aspectRatio: String(ratioOf(aspect)) }}
        className={`relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border bg-surface p-5 text-center ${failed ? "border-danger/40" : "border-white/10"} ${failed ? "" : "shimmer"}`}>
        {failed ? (
          <>
            <p className="text-[15px] font-bold text-danger">Render failed</p>
            <p className="max-w-[300px] break-words text-[12.5px] text-mute">{error}</p>
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={onRetry}><RotateCcw size={14} /> Retry</button>
              <button type="button" className="btn" onClick={onDismiss}>Dismiss</button>
            </div>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2 text-[12.5px] text-mute">
              <span className="h-2 w-2 animate-tally rounded-full bg-tally" />
              {status === "queued" ? "Queued" : "Rendering"}
            </span>
            <p className="num text-[40px] font-medium leading-none">{clock(elapsedMs)}</p>
            <p className="text-[13.5px] font-semibold">{status === "queued" ? "Waiting for a GPU worker" : STAGES[stage].label}</p>
            <p className="max-w-[230px] text-[12px] text-dim">
              {status === "queued" ? "A cold start can take a few minutes." : "The stage is an estimate based on your settings."}
            </p>
            <button type="button" className="btn mt-1" onClick={onCancel}><X size={14} /> Cancel</button>
          </>
        )}
      </div>
      <p className="mt-2 line-clamp-2 px-1 text-[12.5px] text-mute">{prompt}</p>
    </div>
  );
}

export function TakeCard({ item, n, onOpen }: { item: HistoryItem; n: number; onOpen: (i: HistoryItem) => void }) {
  const v = useRef<HTMLVideoElement>(null);
  const r = item.result;
  return (
    <div className="mb-4 break-inside-avoid">
      <button type="button" onClick={() => onOpen(item)} aria-label={`Open take ${n}`}
        onMouseEnter={() => v.current?.play().catch(() => {})} onMouseLeave={() => { v.current?.pause(); }}
        style={{ aspectRatio: String(ratioOf(item.aspect)) }}
        className="group relative block w-full overflow-hidden rounded-2xl border border-white/10 bg-black text-left">
        <video ref={v} src={`${r.videoUrl}#t=0.1`} muted loop playsInline preload="metadata" className="h-full w-full object-cover" />
        <span className="absolute left-2.5 top-2.5 rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold backdrop-blur">Take {n}</span>
        <span className="num absolute right-2.5 top-2.5 rounded-md bg-black/60 px-2 py-1 text-[11px] backdrop-blur">
          {[r.resolution, r.duration && `${r.duration}s`].filter(Boolean).join("  ")}
        </span>
        <span className="absolute inset-0 grid place-items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-black"><Play size={18} fill="currentColor" /></span>
        </span>
      </button>
      <p className="mt-2 line-clamp-2 px-1 text-[12.5px] text-mute">{item.prompt}</p>
    </div>
  );
}
