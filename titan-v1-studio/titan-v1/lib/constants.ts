import type { AspectId, ModelId, ResolutionId, StudioParams } from "./types";

export const DIRECTOR_PILLS = {
  "Camera movement": [
    { label: "Drone flyover", text: "high aerial drone flyover shot" },
    { label: "Dolly push-in", text: "slow cinematic dolly push-in" },
    { label: "Tracking shot", text: "fast smooth tracking shot following the subject" },
    { label: "360° orbit", text: "360-degree orbit around the subject" },
    { label: "Macro zoom", text: "extreme macro zoom, shallow depth of field" },
  ],
  "Light & style": [
    { label: "Golden hour", text: "golden hour sunlight, warm rim light" },
    { label: "Neon rain", text: "cyberpunk neon rain, wet reflective streets" },
    { label: "35mm film", text: "shot on 35mm film, organic film grain" },
    { label: "Film noir", text: "moody film noir, hard shadows, low-key lighting" },
  ],
} as const;

/** Presets drive the worker's second-stage settings (`wan_steps`, `wan_strength`). */
export const MODELS: { id: ModelId; name: string; tag: string; desc: string; steps: number; strength: number }[] = [
  { id: "turbo", name: "Fast", tag: "~2 min", desc: "Quick preview, light cinema pass", steps: 10, strength: 0.45 },
  { id: "cinema", name: "Balanced", tag: "~4 min", desc: "Recommended look and speed", steps: 18, strength: 0.6 },
  { id: "ultra", name: "Detailed", tag: "~6 min", desc: "Maximum detail, slowest", steps: 28, strength: 0.7 },
];

export const ASPECTS: { id: AspectId; label: string; sub: string; ratio: number }[] = [
  { id: "9:16", label: "9:16", sub: "TikTok · Reels · Shorts", ratio: 9 / 16 },
  { id: "16:9", label: "16:9", sub: "Cinema · YouTube", ratio: 16 / 9 },
];

export const RESOLUTIONS: { id: ResolutionId; label: string; sub: string; enable4k: boolean; true4k: boolean }[] = [
  { id: "draft", label: "Draft", sub: "704p", enable4k: false, true4k: false },
  { id: "hd", label: "Full HD", sub: "1080p", enable4k: true, true4k: false },
  { id: "uhd", label: "4K", sub: "2160p · slowest", enable4k: true, true4k: true },
];

export interface Voice { id: string; name: string; note: string }
/** IDs match the worker's VOICE_MAP / CHATTTS_SEEDS keys. */
export const VOICE_CATALOG: { group: string; voices: Voice[] }[] = [
  {
    group: "Male",
    voices: [
      { id: "adam", name: "Adam", note: "Hollywood deep baritone" },
      { id: "george", name: "George", note: "British documentary" },
      { id: "michael", name: "Michael", note: "Storyteller" },
    ],
  },
  {
    group: "Female",
    voices: [
      { id: "bella", name: "Bella", note: "Cinematic" },
      { id: "sarah", name: "Sarah", note: "Warm" },
    ],
  },
  {
    group: "Albanian",
    voices: [
      { id: "albanian", name: "Ilir", note: "Shqip · male" },
      { id: "anila", name: "Anila", note: "Shqip · female" },
    ],
  },
];

/** `prompt` is sent to the worker as `music_prompt` (MusicGen). `none` sends nothing. */
export const BGM_TRACKS: { id: string; name: string; prompt: string }[] = [
  { id: "none", name: "None", prompt: "" },
  { id: "epic", name: "Epic cinematic", prompt: "epic cinematic orchestral score, deep drones, powerful drums, trailer music" },
  { id: "suspense", name: "Dark suspense", prompt: "dark suspense cello, tense atmospheric underscore, slow build" },
  { id: "synthwave", name: "Synthwave", prompt: "cyberpunk synthwave, pulsing analog bass, neon night drive" },
  { id: "piano", name: "Emotional piano", prompt: "emotional solo piano, soft, cinematic, melancholic" },
  { id: "ambient", name: "Ambient", prompt: "calm ambient pads, slow evolving texture, spacious" },
];

export const EXAMPLES: { prompt: string; aspect: AspectId }[] = [
  { prompt: "A woman in a long red coat walks slowly away from the camera down a rainy city street at night. Neon signs in pink and blue reflect on the wet asphalt. The camera follows smoothly from behind at waist height. Light mist, soft glow, cinematic lighting, shallow depth of field, realistic.", aspect: "9:16" },
  { prompt: "A slow aerial shot gliding forward over a calm turquoise lake surrounded by pine-covered mountains at sunrise. Golden light hits the mountain peaks, thin mist floats over the water. Gentle camera movement, soft warm colours, ultra realistic landscape, natural light.", aspect: "16:9" },
  { prompt: "Extreme close-up of a coffee cup on a wooden table by a window in the morning. Steam rises slowly from the coffee, soft sunlight comes through the window and lights the steam. The camera pushes in very slowly. Warm tones, shallow depth of field, realistic, calm mood.", aspect: "9:16" },
];

export const DEFAULT_PARAMS: StudioParams = {
  prompt: "",
  model: "cinema",
  durationSec: 5,
  autoDuration: false,
  aspect: "9:16",
  resolution: "hd",
  strength: 0.6,
  steps: 18,
  narration: "",
  voice: "adam",
  ttsEngine: "chattts",
  music: "none",
};

export const resLabel = (id: ResolutionId) => RESOLUTIONS.find((r) => r.id === id)!.label;

/**
 * Rough wall-clock estimate in ms, used only for the progress bar.
 * Constants come from worker logs: LTX ~15s, Wan ~8.5s per effective step (steps × strength), ESRGAN ~30s, all per 5s of video.
 */
export function estimateMs(p: StudioParams, wan = true) {
  const k = (p.autoDuration ? 5 : p.durationSec) / 5;
  const parts = {
    load: 45_000, // model loading inside the job (drops to ~0 once models are preloaded at worker start)
    motion: 15_000 * k,
    cinema: wan ? p.steps * p.strength * 8_500 * k : 0,
    upscale: p.resolution === "draft" ? 0 : (p.resolution === "uhd" ? 70_000 : 35_000) * k,
    audio: (p.narration.trim() ? 8_000 : 0) + (p.music !== "none" ? 25_000 : 0) + 10_000,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { parts, total };
}

export const STAGES = [
  { key: "load", label: "Loading TITAN V1" },
  { key: "motion", label: "TITAN V1 is generating" },
  { key: "cinema", label: "TITAN V1 is generating" },
  { key: "upscale", label: "TITAN V1 is finishing" },
  { key: "audio", label: "TITAN V1 · voice & music" },
] as const;
