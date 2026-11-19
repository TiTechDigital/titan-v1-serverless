import { NextRequest, NextResponse } from "next/server";
import { getEntitlement, reserveVideo, settleGeneration } from "@/lib/entitlements";
import { authenticate, select } from "@/lib/server/supabase";
import { buildWorkerInput } from "@/lib/sanitize";

// Server-side proxy: keeps RUNPOD_API_KEY off the browser.
//   POST        -> /run              (async job, returns { id, status })
//   GET ?id=    -> /status/{id}      (poll)
//   DELETE ?id= -> /cancel/{id}
// /run + polling (instead of /runsync) because a render takes minutes, far longer than one HTTP request should block.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ID_RE = /^[\w-]{1,100}$/;

const cfg = () => {
  const id = process.env.RUNPOD_ENDPOINT_ID;
  const key = process.env.RUNPOD_API_KEY;
  if (!id || !key) return null;
  return { url: `https://api.runpod.ai/v2/${id}`, key };
};

const notConfigured = () =>
  NextResponse.json({ error: "RUNPOD_ENDPOINT_ID / RUNPOD_API_KEY not configured on the server" }, { status: 500 });

const upstreamError = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "Upstream failure" }, { status: 502 });

async function relay(url: string, key: string, init: RequestInit = {}) {
  const r = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function POST(req: NextRequest) {
  const c = cfg();
  if (!c) return notConfigured();
  const ent = await getEntitlement(req);
  if (!ent) return NextResponse.json({ error: "Sign in to generate videos" }, { status: 401 });
  if (ent.videosLeft <= 0) {
    return NextResponse.json({ error: "No videos left on your plan. Upgrade or wait for the next billing period." }, { status: 402 });
  }
  let generationId: string | null = null;
  try {
    const body = await req.json();
    if (!body || typeof body.input !== "object" || body.input === null) {
      return NextResponse.json({ error: "Body must be { input: {...} }" }, { status: 400 });
    }
    // Never forward browser input as-is: rebuild it from the user's plan.
    const input = buildWorkerInput(body.input as Record<string, unknown>, ent.plan, ent.limits);
    if (!input) return NextResponse.json({ error: "Prompt required" }, { status: 400 });
    const reserved = await reserveVideo(ent, String(input.prompt), String(input.aspect));
    if (!reserved.ok) {
      return NextResponse.json(
        { error: reserved.reason === "quota" ? "No videos left on your plan." : "Your trial or subscription is not active." },
        { status: 402 },
      );
    }
    generationId = reserved.id;
    const res = await relay(`${c.url}/run`, c.key, { method: "POST", body: JSON.stringify({ input }) });
    const data = (await res.clone().json().catch(() => ({}))) as { id?: string };
    if (!res.ok || !data.id) {
      await settleGeneration(ent.user.id, generationId, "refunded");
      return res.ok ? NextResponse.json({ error: "RunPod did not return a job id" }, { status: 502 }) : res;
    }
    await settleGeneration(ent.user.id, generationId, "running", data.id);
    return res;
  } catch (e) {
    if (generationId) await settleGeneration(ent.user.id, generationId, "refunded").catch(() => {});
    return upstreamError(e);
  }
}

/** Only the user who started a job may poll or cancel it. */
async function ownedGeneration(req: NextRequest, jobId: string) {
  const user = await authenticate(req);
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  const rows = await select<Array<{ id: string; status: string }>>(
    `studio_generations?runpod_job_id=eq.${encodeURIComponent(jobId)}&owner_id=eq.${user.id}&select=id,status&limit=1`,
  );
  if (!rows[0]) return { error: NextResponse.json({ error: "Job not found" }, { status: 404 }) } as const;
  return { user, gen: rows[0] } as const;
}

export async function GET(req: NextRequest) {
  const c = cfg();
  if (!c) return notConfigured();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    const own = await ownedGeneration(req, id);
    if ("error" in own) return own.error;
    const res = await relay(`${c.url}/status/${id}`, c.key);
    const data = (await res.clone().json().catch(() => ({}))) as { status?: string };
    // A render that never produced a video does not count against the quota.
    if (data.status === "COMPLETED") await settleGeneration(own.user.id, own.gen.id, "completed");
    else if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(data.status ?? "")) await settleGeneration(own.user.id, own.gen.id, "refunded");
    return res;
  } catch (e) {
    return upstreamError(e);
  }
}

export async function DELETE(req: NextRequest) {
  const c = cfg();
  if (!c) return notConfigured();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!ID_RE.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    const own = await ownedGeneration(req, id);
    if ("error" in own) return own.error;
    // Refund only if the GPU never started: cancelling a running render still burned compute.
    const before = (await (await relay(`${c.url}/status/${id}`, c.key)).json().catch(() => ({}))) as { status?: string };
    const res = await relay(`${c.url}/cancel/${id}`, c.key, { method: "POST" });
    if (res.ok && before.status === "IN_QUEUE") await settleGeneration(own.user.id, own.gen.id, "refunded");
    return res;
  } catch (e) {
    return upstreamError(e);
  }
}
