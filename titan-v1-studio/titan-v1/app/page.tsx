"use client";
import { useCallback, useState } from "react";
import { BookOpen, FolderClosed } from "lucide-react";
import { ControlPanel } from "@/components/ControlPanel";
import { Hero, JobCard, TakeCard } from "@/components/Feed";
import { AuthGate } from "@/components/AuthGate";
import { Header } from "@/components/Header";
import { Lightbox } from "@/components/Lightbox";
import { useEntitlement } from "@/hooks/useEntitlement";
import { useTitanAPI } from "@/hooks/useTitanAPI";
import { DEFAULT_PARAMS } from "@/lib/constants";
import { composerUrl } from "@/lib/titanposting";
import type { AspectId, HistoryItem, PatchParams, SetParam, StudioParams } from "@/lib/types";

const STEPS = [
  ["Describe the shot", "Write what happens, how the camera moves and how it is lit. Use Camera and light to add common moves."],
  ["Choose quality, length and format", "Fast takes about 2 minutes, Detailed about 6. Vertical 9:16 is for Shorts, Reels and TikTok."],
  ["Add voice and music", "Optional. Write a script and pick a voice, and pick a music track. Both are mixed into the final file."],
  ["Generate", "A worker may need a few minutes to start before it renders. Finished videos stay here until you refresh the page."],
] as const;

export default function Page() {
  return <AuthGate><Studio /></AuthGate>;
}

function Studio() {
  const [p, setP] = useState<StudioParams>(DEFAULT_PARAMS);
  const [open, setOpen] = useState<HistoryItem | null>(null);
  const [view, setView] = useState<"history" | "how">("history");
  const api = useTitanAPI();
  const ent = useEntitlement(api.status === "completed");
  const busy = api.status === "queued" || api.status === "generating";
  const failed = api.status === "error";

  const set: SetParam = useCallback((k, v) => setP((prev) => ({ ...prev, [k]: v })), []);
  const patch: PatchParams = useCallback((x) => setP((prev) => ({ ...prev, ...x })), []);
  const generate = () => {
    setView("history");
    api.generate({ ...p, durationSec: Math.min(p.durationSec, ent.limits.maxSeconds), autoDuration: p.autoDuration && ent.limits.maxSeconds > 5 });
  };
  const savedOnly = api.saved.filter((x) => !api.history.some((h) => h.mediaId === x.mediaId));
  const empty = api.history.length === 0 && savedOnly.length === 0 && !busy && !failed;

  const tab = (id: "history" | "how", label: string, icon: React.ReactNode) => (
    <button type="button" aria-pressed={view === id} onClick={() => setView(id)}
      className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[13.5px] font-semibold transition-colors ${view === id ? "bg-white/[0.12]" : "bg-white/[0.05] text-mute hover:text-fg"}`}>
      {icon}{label}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <Header status={api.status} ent={ent} />
      <main className="grid min-h-0 flex-1 gap-3 px-3 pb-3 lg:grid-cols-[330px_minmax(0,1fr)]">
        <ControlPanel p={p} set={set} patch={patch} busy={busy} limits={ent.limits} onGenerate={generate} className="h-[640px] lg:h-auto" />
        <section aria-label="Canvas" className="flex min-h-[60vh] min-w-0 flex-col rounded-2xl border border-white/[0.06] bg-surface lg:min-h-0">
          <div className="flex shrink-0 gap-2 p-3">
            {tab("history", "History", <FolderClosed size={15} />)}
            {tab("how", "How it works", <BookOpen size={15} />)}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {view === "how" ? (
              <ol className="mx-auto max-w-[560px] space-y-6 py-8">
                {STEPS.map(([title, text], i) => (
                  <li key={title} className="flex gap-4">
                    <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[13px]">{i + 1}</span>
                    <div>
                      <h3 className="text-[16px] font-bold">{title}</h3>
                      <p className="mt-1 text-[14px] leading-relaxed text-mute">{text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : empty ? (
              <Hero onPick={(prompt: string, aspect: AspectId) => patch({ prompt, aspect })} />
            ) : (
              <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
                {(busy || failed) && (
                  <JobCard
                    status={api.status} stage={api.stage} elapsedMs={api.elapsedMs}
                    aspect={api.job?.aspect ?? p.aspect} prompt={api.job?.prompt ?? p.prompt} error={api.error}
                    onCancel={api.cancel} onRetry={generate} onDismiss={api.reset}
                  />
                )}
                {api.history.map((it, i) => (
                  <TakeCard key={it.id} item={it} n={api.history.length - i} onOpen={setOpen} />
                ))}
                {savedOnly.map((it) => (
                  <div key={it.id} className="mb-4 break-inside-avoid rounded-2xl border border-white/10 bg-black/30 p-3">
                    <p className="line-clamp-3 text-[12.5px] text-mute">{it.prompt}</p>
                    <div className="mt-2 flex items-center justify-between text-[11.5px] text-dim">
                      <span>{new Date(it.createdAt).toLocaleDateString()} · in library</span>
                      <a href={composerUrl(it.mediaId)} target="_blank" rel="noopener noreferrer" className="font-semibold text-cobalt-ice">Schedule</a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
      {open && (
        <Lightbox
          item={open} onClose={() => setOpen(null)}
          onReuse={(it) => { patch({ prompt: it.prompt, aspect: it.aspect }); setOpen(null); }}
          onSave={api.save} saving={api.saving === open.id}
        />
      )}
    </div>
  );
}
