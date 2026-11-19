"use client";
import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { ASPECTS, BGM_TRACKS, DIRECTOR_PILLS, MODELS, RESOLUTIONS, VOICE_CATALOG, estimateMs } from "@/lib/constants";
import type { StudioProps } from "@/lib/types";
import type { PlanLimits } from "@/lib/plans";
import { Row, Segmented, Slider } from "./ui/Controls";

interface Props extends StudioProps {
  busy: boolean;
  limits: PlanLimits;
  onGenerate: () => void;
  className?: string;
}

type Sheet = null | "model" | "duration" | "aspect" | "resolution" | "tune" | "add";
const SHEET_TITLE: Record<Exclude<Sheet, null>, string> = {
  model: "Quality", duration: "Duration", aspect: "Aspect ratio", resolution: "Resolution", tune: "Fine-tune", add: "Add to prompt",
};
const SUB: Record<string, string> = { "9:16": "Shorts, Reels, TikTok", "16:9": "YouTube, cinema" };
const RES_PX: Record<string, string> = { draft: "704p", hd: "1080p", uhd: "2160p, slowest" };
const RES_SHORT: Record<string, string> = { draft: "704p", hd: "1080p", uhd: "4K" };

// SMPTE test pattern as the preset card's picture.
const BARS = [
  "linear-gradient(to right,#c0c0c0 0 14.28%,#c0c000 0 28.57%,#00c0c0 0 42.85%,#00c000 0 57.14%,#c000c0 0 71.43%,#c00000 0 85.71%,#0000c0 0 100%) top/100% 68% no-repeat",
  "linear-gradient(to right,#0000c0 0 14.28%,#131313 0 28.57%,#c000c0 0 42.85%,#131313 0 57.14%,#00c0c0 0 71.43%,#131313 0 85.71%,#c0c0c0 0 100%) 0 74%/100% 8% no-repeat",
  "#0a0a0a",
].join(",");

function Tile({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center justify-between gap-2 rounded-xl bg-raised px-3 py-2.5 text-left transition-colors hover:bg-[#222]">
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold text-mute">{label}</span>
        <span className="block truncate text-[14.5px] font-bold">{value}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-dim" />
    </button>
  );
}

const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`rounded-xl bg-raised p-3 ${className}`}>{children}</div>
);

export function ControlPanel({ p, set, patch, busy, limits, onGenerate, className = "" }: Props) {
  const [tab, setTab] = useState<"video" | "audio">("video");
  const [sheet, setSheet] = useState<Sheet>(null);
  const model = MODELS.find((m) => m.id === p.model)!;
  const hasVoice = !!p.narration.trim();
  const words = hasVoice ? p.narration.trim().split(/\s+/).length : 0;
  const voiceSec = words / 2.5;
  const clipSec = p.autoDuration ? voiceSec : p.durationSec;
  const overrun = words > 0 && voiceSec > clipSec + 0.3;
  const audioOn = hasVoice || p.music !== "none";
  const mins = Math.max(1, Math.round((estimateMs(p, limits.wan).total - 45_000) / 60_000));
  const canGo = !busy && !!p.prompt.trim();
  const append = (text: string) => set("prompt", p.prompt.trim() ? `${p.prompt.trim().replace(/[,.\s]+$/, "")}, ${text}` : text);
  const pick = (patchObj: Parameters<typeof patch>[0]) => { patch(patchObj); setSheet(null); };

  let body: ReactNode;
  if (sheet) {
    body = (
      <div>
        <button type="button" onClick={() => setSheet(null)} className="mb-2 flex items-center gap-1 rounded-lg px-1.5 py-1 text-[13.5px] font-bold hover:bg-white/[0.06]">
          <ChevronLeft size={17} /> {SHEET_TITLE[sheet]}
        </button>
        {sheet === "model" && MODELS.map((m) => (
          <Row key={m.id} active={m.id === p.model} title={m.name} sub={m.desc} right={m.tag}
            onClick={() => pick({ model: m.id, steps: m.steps, strength: m.strength })} />
        ))}
        {sheet === "duration" && (
          <div className="p-1">
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: limits.maxSeconds - 1 }, (_, i) => i + 2).map((s) => {
                const on = !p.autoDuration && s === p.durationSec;
                return (
                  <button key={s} type="button" aria-pressed={on} onClick={() => pick({ durationSec: s, autoDuration: false })}
                    className={`rounded-lg py-2.5 text-[13.5px] font-bold transition-colors ${on ? "bg-white text-black" : "bg-white/[0.06] hover:bg-white/[0.14]"}`}>{s}s</button>
                );
              })}
            </div>
            <button type="button" disabled={!hasVoice} onClick={() => pick({ autoDuration: true })}
              className={`mt-2 w-full rounded-lg py-2.5 text-[13px] font-bold transition-colors disabled:opacity-40 ${p.autoDuration && hasVoice ? "bg-white text-black" : "bg-white/[0.06] hover:bg-white/[0.14]"}`}>
              Match the voice-over length
            </button>
          </div>
        )}
        {sheet === "aspect" && ASPECTS.map((a) => (
          <Row key={a.id} active={a.id === p.aspect} title={a.label} sub={SUB[a.id]} onClick={() => pick({ aspect: a.id })} />
        ))}
        {sheet === "resolution" && RESOLUTIONS.map((r) => (
          <Row key={r.id} active={r.id === p.resolution} title={r.label} sub={RES_PX[r.id]} onClick={() => pick({ resolution: r.id })} />
        ))}
        {sheet === "tune" && (
          <div className="space-y-5 p-2">
            <Slider label="Cinema strength" value={p.strength} min={0.3} max={0.9} step={0.05} onChange={(v) => set("strength", v)}
              format={(v) => v.toFixed(2)} hint="How far the cinema pass restyles the base motion. Higher looks more stylised." />
            <Slider label="Cinema steps" value={p.steps} min={8} max={30} onChange={(v) => set("steps", v)}
              hint="More steps add detail and render time, about 8 s per step." />
          </div>
        )}
        {sheet === "add" && (
          <div className="space-y-4 p-2">
            {Object.entries(DIRECTOR_PILLS).map(([group, items]) => (
              <div key={group}>
                <p className="mb-2 text-[12.5px] font-semibold text-mute">{group}</p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((it) => (
                    <button key={it.label} type="button" onClick={() => { append(it.text); setSheet(null); }}
                      className="rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-white/[0.15]">{it.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } else if (tab === "video") {
    body = (
      <div className="space-y-3">
        <div className="relative h-[116px] overflow-hidden rounded-xl bg-black">
          <div aria-hidden className="absolute inset-0 opacity-30 saturate-[.7]" style={{ background: BARS }} />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <button type="button" onClick={() => limits.wan && setSheet("model")}
            className="absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-2.5 py-1.5 text-[12.5px] font-semibold backdrop-blur transition-colors hover:bg-black/80">
            <Pencil size={13} /> {limits.wan ? "Change" : "Upgrade"}
          </button>
          <div className="absolute bottom-3 left-3.5">
            <p className="display text-[22px] text-cobalt-ice">{model.name}</p>
            <p className="text-[12.5px] text-mute">{limits.wan ? model.desc : "Trial: fast motion pass only. Upgrade for the cinema pass."}</p>
          </div>
        </div>

        <Card>
          <label htmlFor="prompt" className="block text-[14px] font-bold">Prompt</label>
          <textarea
            id="prompt" value={p.prompt} rows={5} maxLength={1000}
            onChange={(e) => set("prompt", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canGo) onGenerate(); }}
            placeholder="Describe the scene in full sentences: who or what, how it moves, the camera, the light and mood."
            className="mt-1.5 w-full resize-none bg-transparent text-[14px] leading-snug text-fg outline-none placeholder:text-dim"
          />
          <div className="mt-1 flex items-center gap-1.5">
            <button type="button" onClick={() => setSheet("add")} className="rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-white/[0.15]">+ Camera and light</button>
            <button type="button" onClick={() => setTab("audio")} className="rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-white/[0.15]">Audio {audioOn ? "On" : "Off"}</button>
            <span className="num ml-auto text-[11px] text-dim">{p.prompt.length}/1000</span>
          </div>
          <details className="mt-2 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[12.5px] text-mute">
            <summary className="cursor-pointer font-semibold text-fg">Tips for a better video</summary>
            <div className="mt-2 space-y-2 leading-snug">
              <p><strong className="text-fg">Write 2 to 4 full sentences.</strong> Short prompts like &ldquo;a car&rdquo; give plain results.</p>
              <p><strong className="text-fg">Say what moves</strong> (walking, steam rising, waves) and <strong className="text-fg">what the camera does</strong> (follows from behind, slow push-in, glides forward).</p>
              <p><strong className="text-fg">Add light and look:</strong> golden hour, neon at night, soft window light, shallow depth of field.</p>
              <p><strong className="text-fg">Keep it simple:</strong> one subject and one camera move work best. Fast action, crowds, close-up hands and faces, and text in the picture are still hard for TITAN V1.</p>
              <p className="text-dim">Example: A woman in a long red coat walks slowly away from the camera down a rainy city street at night. Neon signs reflect on the wet asphalt. The camera follows smoothly from behind. Cinematic lighting, shallow depth of field.</p>
              <button type="button" onClick={() => set("prompt", "A woman in a long red coat walks slowly away from the camera down a rainy city street at night. Neon signs in pink and blue reflect on the wet asphalt. The camera follows smoothly from behind at waist height. Light mist, soft glow, cinematic lighting, shallow depth of field, realistic.")}
                className="rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[12.5px] font-bold text-fg transition-colors hover:bg-white/[0.15]">Use this example</button>
            </div>
          </details>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Tile label="Duration" value={p.autoDuration && hasVoice ? "Auto" : `${p.durationSec}s`} onClick={() => setSheet("duration")} />
          <Tile label="Aspect Ratio" value={p.aspect} onClick={() => setSheet("aspect")} />
          <Tile label="Resolution" value={RES_SHORT[p.resolution]} onClick={() => setSheet("resolution")} />
          <Tile label="Fine-tune" value={limits.wan ? `${p.steps} steps` : "Paid plans"} onClick={() => limits.wan && setSheet("tune")} />
        </div>
      </div>
    );
  } else {
    body = (
      <div className="space-y-3">
        <Card>
          <label htmlFor="narration" className="flex items-baseline justify-between text-[14px] font-bold">
            Voice-over <span className="num text-[11.5px] font-normal text-dim">{words} words</span>
          </label>
          <textarea id="narration" rows={5} value={p.narration} onChange={(e) => set("narration", e.target.value)}
            placeholder="Script for the narrator. Leave empty for a clip without voice."
            className="mt-1.5 w-full resize-none bg-transparent text-[14px] leading-snug outline-none placeholder:text-dim" />
          {words > 0 && (
            <p className={`num text-[12px] ${overrun ? "text-tally" : "text-dim"}`}>
              {overrun ? `About ${voiceSec.toFixed(1)} s of voice in a ${clipSec} s clip. The last frame is held until it ends.` : `About ${voiceSec.toFixed(1)} s of voice`}
            </p>
          )}
        </Card>
        <div>
          <label htmlFor="voice" className="mb-1.5 block text-[12.5px] font-semibold text-mute">Voice</label>
          <select id="voice" className="field" value={p.voice} onChange={(e) => set("voice", e.target.value)}>
            {VOICE_CATALOG.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.voices.map((v) => <option key={v.id} value={v.id}>{v.name}, {v.note}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-mute">Voice engine</p>
          <Segmented label="Voice engine" value={p.ttsEngine} onChange={(v) => set("ttsEngine", v)}
            options={[{ value: "chattts", label: "ChatTTS" }, { value: "kokoro", label: "Kokoro" }]} />
          {(p.voice === "albanian" || p.voice === "anila") && <p className="mt-2 text-[12px] text-dim">Albanian voices always use Edge TTS.</p>}
        </div>
        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-mute">Music <span className="font-normal text-dim">adds about 25 s</span></p>
          <div className="grid grid-cols-2 gap-1.5">
            {BGM_TRACKS.map((t) => (
              <button key={t.id} type="button" aria-pressed={p.music === t.id} onClick={() => set("music", t.id)}
                className={`rounded-lg px-3 py-2.5 text-left text-[13px] font-bold transition-colors ${p.music === t.id ? "bg-white text-black" : "bg-raised hover:bg-[#222]"}`}>{t.name}</button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside aria-label="Settings" className={`flex min-h-0 flex-col rounded-2xl border border-white/[0.06] bg-surface ${className}`}>
      <div role="tablist" className="flex shrink-0 gap-5 border-b border-white/[0.06] px-4 pt-3.5">
        {([["video", "Create Video"], ["audio", "Voice and music"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id && !sheet} onClick={() => { setTab(id); setSheet(null); }}
            className={`-mb-px border-b-2 pb-2.5 text-[14.5px] font-bold transition-colors ${tab === id ? "border-white text-fg" : "border-transparent text-mute hover:text-fg"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{body}</div>
      <div className="shrink-0 p-3 pt-1">
        <button type="button" className="generate h-12 w-full flex-row gap-2 text-[15px]" disabled={!canGo} onClick={onGenerate}>
          {busy ? "Rendering" : "Generate"}
          {!busy && <span className="num text-[11.5px] font-medium normal-case tracking-normal opacity-80">~{mins} min</span>}
        </button>
      </div>
    </aside>
  );
}
