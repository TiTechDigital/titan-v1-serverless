"use client";
import { genUploader } from "uploadthing/client";
import { accessToken, authFetch } from "./supabaseClient";

const API = process.env.NEXT_PUBLIC_TITANPOSTING_API_URL ?? "http://127.0.0.1:8787";
const APP = (process.env.NEXT_PUBLIC_TITANPOSTING_APP_URL ?? "http://localhost:5173").replace(/\/$/, "");

export const loginUrl = `${APP}/login`;
export const composerUrl = (mediaId: string) => `${APP}/composer?media=${encodeURIComponent(mediaId)}`;

interface MediaUploader {
  uploadFiles(endpoint: "media", options: { files: File[]; input: Record<string, unknown>; headers: HeadersInit }): Promise<unknown[]>;
}
// The router type lives in the worker; the shape used here mirrors apps/web/src/lib/api.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const uploader = genUploader<any>({ url: new URL("/api/uploadthing", API) }) as unknown as MediaUploader;

function inspectVideo(file: File): Promise<{ width: number; height: number; durationSeconds: number }> {
  const src = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    const t = window.setTimeout(() => reject(new Error("Video metadata inspection timed out.")), 10_000);
    v.preload = "metadata";
    v.onloadedmetadata = () => { window.clearTimeout(t); resolve({ width: v.videoWidth, height: v.videoHeight, durationSeconds: v.duration }); };
    v.onerror = () => { window.clearTimeout(t); reject(new Error("The browser could not read this video.")); };
    v.src = src;
  }).finally(() => URL.revokeObjectURL(src)) as Promise<{ width: number; height: number; durationSeconds: number }>;
}

/**
 * Uploads a finished render into the Titanposting media library (same UploadThing route the
 * scheduler uses: owner JWT, quota reservation, verified callback) and returns the media id.
 * If `jobId` is given, the asset is recorded against that render in Studio's database.
 */
export async function saveToLibrary(blob: Blob, name: string, jobId?: string): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("Not signed in");
  const file = new File([blob], name, { type: blob.type || "video/mp4" });
  const meta = await inspectVideo(file);
  const result = (await uploader.uploadFiles("media", {
    files: [file],
    input: { filename: file.name, mimeType: file.type, sizeBytes: file.size, ...meta },
    headers: { Authorization: `Bearer ${token}` },
  })) as Array<{ key: string | null; serverData?: { mediaId?: string; uploadStatus?: string } | null }>;
  const up = result[0];
  if (!up?.key || !up.serverData?.mediaId || up.serverData.uploadStatus !== "complete") {
    throw new Error("Titanposting did not confirm the upload.");
  }
  const mediaId = up.serverData.mediaId;
  if (jobId) {
    const r = await authFetch("/api/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, mediaId }) });
    if (!r.ok) throw new Error("Uploaded, but could not link the render to your library.");
  }
  return mediaId;
}
