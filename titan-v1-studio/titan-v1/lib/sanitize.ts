import type { PlanLimits, PlanId } from "./plans";

const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};
const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

const VOICES = new Set(["adam", "george", "bella", "sarah", "michael", "albanian", "anila", "auto"]);
const BGM_MAX = 300;

/**
 * Builds the worker `input` from untrusted browser input. Whitelist only, so the browser can never
 * set `plan`, `music_url` (SSRF/arbitrary download in the worker), or exceed plan limits.
 */
export function buildWorkerInput(raw: Record<string, unknown>, plan: PlanId, lim: PlanLimits) {
  const prompt = str(raw.prompt, 1000);
  if (!prompt) return null;
  const input: Record<string, unknown> = {
    plan,
    prompt,
    wan_prompt: str(raw.wan_prompt, 1000) || prompt,
    aspect: raw.aspect === "16:9" ? "16:9" : "9:16",
    enable_4k: lim.enable4k && raw.enable_4k !== false,
    true_4k: lim.true4k && raw.true_4k === true,
    wan_steps: Math.round(clamp(raw.wan_steps, 8, 30, 18)),
    wan_strength: clamp(raw.wan_strength, 0.3, 0.9, 0.6),
    voice: VOICES.has(String(raw.voice)) ? raw.voice : "adam",
    tts: raw.tts === "kokoro" ? "kokoro" : "chattts",
  };
  if (raw.duration !== undefined) input.duration = clamp(raw.duration, 2, lim.maxSeconds, 5);
  const narration = str(raw.narration, 2000);
  if (narration) input.narration = narration;
  const music = str(raw.music_prompt, BGM_MAX);
  if (music) input.music_prompt = music;
  return input;
}
