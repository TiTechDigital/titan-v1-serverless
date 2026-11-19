export type GenStatus = "idle" | "queued" | "generating" | "completed" | "error";
export type ModelId = "turbo" | "cinema" | "ultra";
export type AspectId = "9:16" | "16:9";
export type ResolutionId = "draft" | "hd" | "uhd";
export type TtsEngine = "chattts" | "kokoro";

export interface StudioParams {
  prompt: string;
  model: ModelId;
  durationSec: number; // 2..20 (plan cap)
  autoDuration: boolean; // let the worker size the clip from the narration
  aspect: AspectId;
  resolution: ResolutionId;
  strength: number; // Wan V2V strength 0.3..0.9
  steps: number; // Wan steps 8..30
  narration: string;
  voice: string;
  ttsEngine: TtsEngine;
  music: string; // BGM track id ("none" = no music)
}

export type SetParam = <K extends keyof StudioParams>(key: K, value: StudioParams[K]) => void;
export type PatchParams = (patch: Partial<StudioParams>) => void;
export interface StudioProps {
  p: StudioParams;
  set: SetParam;
  patch: PatchParams;
}

export interface TitanResult {
  videoUrl: string; // blob: URL
  duration?: number;
  resolution?: string;
  voiceUsed?: string;
  wanUsed?: boolean;
  esrganUsed?: boolean;
  workerSeconds?: number;
  elapsedMs: number;
}

export interface HistoryItem {
  id: number;
  jobId?: string;
  mediaId?: string; // Titanposting media library asset once saved
  prompt: string;
  aspect: AspectId;
  result: TitanResult;
}

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  message?: string;
}

/** A finished render already stored in the user's Titanposting library (from the database). */
export interface SavedItem {
  id: string;
  prompt: string;
  aspect: AspectId;
  mediaId: string;
  createdAt: string;
  url?: string; // signed playback link (1 h), fetched from Titanposting
}
