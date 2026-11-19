"use client";
import { useEffect } from "react";
import { CalendarClock, CloudUpload, Download, RotateCcw, X } from "lucide-react";
import { composerUrl } from "@/lib/titanposting";
import type { HistoryItem } from "@/lib/types";

export function Lightbox({ item, onClose, onReuse, onSave, saving }: { item: HistoryItem; onClose: () => void; onReuse: (i: HistoryItem) => void; onSave: (i: HistoryItem) => void; saving: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = prev; };
  }, [onClose]);

  const r = item.result;
  return (
    <div role="dialog" aria-modal="true" aria-label="Take" className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"><X size={18} /></button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center py-2" onClick={(e) => e.stopPropagation()}>
        <video src={r.videoUrl} controls autoPlay loop playsInline className="max-h-full max-w-full rounded-2xl bg-black" />
      </div>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 pt-3" onClick={(e) => e.stopPropagation()}>
        <p className="line-clamp-2 text-[13.5px] text-mute">{item.prompt}</p>
        {r.wanUsed === false && <p className="text-[12.5px] text-tally">The cinema pass failed on the worker. This clip is the base motion only.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="num text-[12px] text-dim">
            {[r.resolution, r.duration && `${r.duration} s`, r.voiceUsed && r.voiceUsed !== "none" && r.voiceUsed, `${Math.round(r.elapsedMs / 1000)} s render`].filter(Boolean).join("   ")}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => onReuse(item)}><RotateCcw size={14} /> Reuse prompt</button>
            {item.mediaId ? (
              <a href={composerUrl(item.mediaId)} target="_blank" rel="noopener noreferrer" className="btn"><CalendarClock size={14} /> Schedule</a>
            ) : (
              <button type="button" className="btn" disabled={saving} onClick={() => onSave(item)}><CloudUpload size={14} /> {saving ? "Saving…" : "Save to Titanposting"}</button>
            )}
            <a href={r.videoUrl} download={`titan-${item.id}.mp4`} className="btn-solid"><Download size={14} /> Download</a>
          </div>
        </div>
      </div>
    </div>
  );
}
