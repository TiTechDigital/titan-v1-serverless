"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BGM_TRACKS, RESOLUTIONS, STAGES, estimateMs } from "@/lib/constants";
import type { AspectId, GenStatus, HistoryItem, SavedItem, StudioParams, TitanResult } from "@/lib/types";
import { authFetch } from "@/lib/supabaseClient";
import { saveToLibrary } from "@/lib/titanposting";
import { useToasts } from "./useToasts";

/**
 * Talks to RunPod Serverless through the Next.js proxy at /api/titan:
 *   POST -> /run, GET ?id= -> /status/{id}, DELETE ?id= -> /cancel/{id}
 * so the API key never reaches the browser.
 *
 * Queue / in-progress state is real (from RunPod). The progress bar and stage names are ESTIMATES
 * derived from the settings, because the worker does not stream stage events.
 */

const POLL_MS = 3000;
const MAX_WAIT_MS = 30 * 60_000;
const MAX_POLL_FAILS = 6;
const JOB_KEY = "titan:job";

interface JobMeta { id: string; t0: number; prompt: string; aspect: StudioParams["aspect"]; etaMs: number; parts: Record<string, number> }

/** Maps UI params to the worker's `job["input"]` (see handler.py). */
export function buildPayload(p: StudioParams) {
  const res = RESOLUTIONS.find((r) => r.id === p.resolution)!;
  const music = BGM_TRACKS.find((t) => t.id === p.music);
  const input: Record<string, unknown> = {
    prompt: p.prompt.trim(),
    wan_prompt: p.prompt.trim(),
    aspect: p.aspect,
    enable_4k: res.enable4k,
    true_4k: res.true4k,
    wan_steps: p.steps,
    wan_strength: p.strength,
    voice: p.voice,
    tts: p.ttsEngine,
  };
  if (!p.autoDuration || !p.narration.trim()) input.duration = p.durationSec;
  if (p.narration.trim()) input.narration = p.narration.trim();
  if (music?.prompt) input.music_prompt = music.prompt;
  return { input };
}

async function http(url: string, init?: RequestInit, signal?: AbortSignal) {
  const r = await authFetch(url, { ...init, signal });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || data?.message || `HTTP ${r.status}`);
  return data;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clip = (s: unknown) => String(s ?? "").slice(0, 400);

async function parseOutput(res: any, elapsedMs: number): Promise<TitanResult> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const o = res?.output ?? res;
  if (o?.error) throw new Error(clip(o.error));
  const src: string | undefined = o?.video_base64 ?? o?.video_url;
  if (!src) throw new Error("Worker returned no video in `output`");
  // data: URI -> blob: URL (cheaper for <video>, and downloads work)
  const blob = await (await fetch(src)).blob();
  return {
    videoUrl: URL.createObjectURL(blob),
    duration: o?.duration,
    resolution: o?.resolution,
    voiceUsed: o?.voice_used,
    wanUsed: o?.wan_used,
    esrganUsed: o?.esrgan_used,
    workerSeconds: o?.seconds_taken,
    elapsedMs,
  };
}

export function useTitanAPI() {
  const { push } = useToasts();
  const [status, setStatus] = useState<GenStatus>("idle");
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [etaMs, setEtaMs] = useState(0);
  const [parts, setParts] = useState<Record<string, number>>({});
  const [job, setJob] = useState<{ aspect: StudioParams["aspect"]; prompt: string } | null>(null);
  const [result, setResult] = useState<TitanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);

  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [saving, setSaving] = useState<number | null>(null);
  const saveRef = useRef<(item: HistoryItem) => Promise<void>>(async () => {});

  const abort = useRef<AbortController | null>(null);
  const meta = useRef<JobMeta | null>(null);
  const runStart = useRef<number | null>(null); // when RunPod first reported IN_PROGRESS
  const live = useRef(false);

  // ticker: elapsed time + estimated progress/stage
  useEffect(() => {
    if (status !== "queued" && status !== "generating") return;
    const id = setInterval(() => {
      const m = meta.current;
      if (!m) return;
      setElapsedMs(Date.now() - m.t0);
      if (!runStart.current) return;
      const t = Date.now() - runStart.current;
      setProgress(Math.max(2, 95 * (1 - Math.exp((-2.2 * t) / m.etaMs))));
      let acc = 0, idx = 0;
      for (let i = 0; i < STAGES.length; i++) {
        acc += m.parts[STAGES[i].key] ?? 0;
        idx = i;
        if (t < acc) break;
      }
      setStage(idx);
    }, 400);
    return () => clearInterval(id);
  }, [status]);

  const finish = useCallback(async (res: unknown, m: JobMeta) => {
    const parsed = await parseOutput(res, Date.now() - m.t0);
    const id = Date.now();
    const item: HistoryItem = { id, jobId: m.id, prompt: m.prompt, aspect: m.aspect, result: parsed };
    setHistory((h) => {
      const next = [item, ...h];
      next.slice(12).forEach((x) => URL.revokeObjectURL(x.result.videoUrl));
      return next.slice(0, 12);
    });
    setActiveId(id);
    setResult(parsed);
    setProgress(100);
    setStatus("completed");
    try { localStorage.removeItem(JOB_KEY); } catch {}
    push({ kind: "success", title: "Render complete", message: `Finished in ${Math.round(parsed.elapsedMs / 1000)}s` });
    void saveRef.current(item);
  }, [push]);

  const track = useCallback(async (m: JobMeta, ac: AbortController) => {
    let fails = 0;
    try {
      for (;;) {
        if (ac.signal.aborted) return;
        if (Date.now() - m.t0 > MAX_WAIT_MS) throw new Error("Generation timed out");
        let res;
        try {
          res = await http(`/api/titan?id=${encodeURIComponent(m.id)}`, undefined, ac.signal);
          fails = 0;
        } catch (e) {
          if (ac.signal.aborted) return;
          if (++fails >= MAX_POLL_FAILS) throw e;
          await sleep(POLL_MS);
          continue;
        }
        if (res.status === "IN_QUEUE") setStatus("queued");
        else if (res.status === "IN_PROGRESS") {
          if (!runStart.current) runStart.current = Date.now();
          setStatus("generating");
        } else if (res.status === "COMPLETED") {
          await finish(res, m);
          return;
        } else if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(res.status)) {
          throw new Error(clip(res.error) || `Job ${String(res.status).toLowerCase().replace("_", " ")}`);
        }
        await sleep(POLL_MS);
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "Unknown error";
      try { localStorage.removeItem(JOB_KEY); } catch {}
      setError(msg);
      setStatus("error");
      push({ kind: "error", title: "Generation failed", message: msg });
    }
  }, [finish, push]);

  const begin = useCallback((m: JobMeta) => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    meta.current = m;
    runStart.current = null;
    live.current = true;
    setEtaMs(m.etaMs);
    setParts(m.parts);
    setJob({ aspect: m.aspect, prompt: m.prompt });
    setElapsedMs(Date.now() - m.t0);
    setProgress(2);
    setStage(0);
    setError(null);
    setResult(null);
    setStatus("queued");
    try { localStorage.setItem(JOB_KEY, JSON.stringify(m)); } catch {}
    void track(m, ac);
  }, [track]);

  /** Uploads a finished render into the Titanposting media library (auto after render, retryable). */
  const save = useCallback(async (item: HistoryItem) => {
    if (item.mediaId || !item.jobId) return;
    setSaving(item.id);
    try {
      const blob = await (await fetch(item.result.videoUrl)).blob();
      const mediaId = await saveToLibrary(blob, `titan-${item.id}.mp4`, item.jobId);
      setHistory((h) => h.map((x) => (x.id === item.id ? { ...x, mediaId } : x)));
      push({ kind: "success", title: "Saved to Titanposting", message: "Ready to schedule from your library." });
    } catch (e) {
      push({ kind: "error", title: "Not saved to Titanposting", message: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setSaving(null);
    }
  }, [push]);
  saveRef.current = save;

  // real, persisted history (renders already in the library)
  const loadSaved = useCallback(async () => {
    try {
      const r = await authFetch("/api/history", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { items: Array<{ id: string; prompt: string; aspect: AspectId; media_asset_id: string | null; created_at: string }> };
      setSaved(d.items.filter((x) => x.media_asset_id).map((x) => ({ id: x.id, prompt: x.prompt, aspect: x.aspect, mediaId: x.media_asset_id!, createdAt: x.created_at })));
    } catch {}
  }, []);
  useEffect(() => { void loadSaved(); }, [loadSaved]);
  useEffect(() => { if (history.some((h) => h.mediaId)) void loadSaved(); }, [history, loadSaved]);

  // resume a job after a page refresh (RunPod keeps results ~30 min)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOB_KEY);
      if (!raw) return;
      const m = JSON.parse(raw) as JobMeta;
      if (!m?.id || Date.now() - m.t0 > MAX_WAIT_MS) { localStorage.removeItem(JOB_KEY); return; }
      begin(m);
    } catch {}
    return () => abort.current?.abort();
  }, [begin]);

  const generate = useCallback(async (params: StudioParams) => {
    if (!params.prompt.trim()) {
      push({ kind: "error", title: "Prompt required", message: "Describe your shot first." });
      return;
    }
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setStatus("queued");
    setError(null);
    setResult(null);
    setProgress(0);
    setElapsedMs(0);
    try {
      const res = await http("/api/titan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(params)),
      }, ac.signal);
      if (!res.id) throw new Error(clip(res.error) || "RunPod did not return a job id");
      const est = estimateMs(params);
      begin({ id: res.id, t0: Date.now(), prompt: params.prompt.trim(), aspect: params.aspect, etaMs: est.total, parts: est.parts });
    } catch (e) {
      if (ac.signal.aborted) return;
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setStatus("error");
      push({ kind: "error", title: "Could not start render", message: msg });
    }
  }, [begin, push]);

  const cancel = useCallback(() => {
    const id = meta.current?.id;
    abort.current?.abort();
    try { localStorage.removeItem(JOB_KEY); } catch {}
    if (id) void authFetch(`/api/titan?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setStatus("idle");
    setProgress(0);
    push({ kind: "info", title: "Render cancelled" });
  }, [push]);

  const show = useCallback((item: HistoryItem) => {
    if (live.current && (status === "queued" || status === "generating")) return; // don't clobber a running job
    setError(null); setResult(item.result); setActiveId(item.id); setStatus("completed");
  }, [status]);

  const reset = useCallback(() => {
    setStatus("idle"); setResult(null); setError(null); setProgress(0); setStage(0);
  }, []);

  return { status, stage, progress, elapsedMs, etaMs, parts, job, result, error, history, saved, saving, save, activeId, show, generate, cancel, reset };
}

