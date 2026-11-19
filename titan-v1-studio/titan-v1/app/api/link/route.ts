import { NextRequest, NextResponse } from "next/server";
import { authenticate, DbError, rpc } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_RE = /^[\w-]{1,100}$/;

/** Records which Titanposting library asset holds a finished render. */
export async function POST(req: NextRequest) {
  const user = await authenticate(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { jobId?: unknown; mediaId?: unknown } | null;
  if (typeof b?.jobId !== "string" || !ID_RE.test(b.jobId) || typeof b.mediaId !== "string" || !UUID.test(b.mediaId)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    await rpc("studio_link_media", { p_owner_id: user.id, p_job_id: b.jobId, p_media_id: b.mediaId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Could not link media" }, { status: e instanceof DbError && e.status === 404 ? 404 : 502 });
  }
}
