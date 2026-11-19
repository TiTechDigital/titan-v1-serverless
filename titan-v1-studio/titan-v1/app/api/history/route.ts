import { NextRequest, NextResponse } from "next/server";
import { authenticate, select } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";

/** The signed-in user's real render history (survives refresh and device changes). */
export async function GET(req: NextRequest) {
  const user = await authenticate(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rows = await select<Array<{ id: string; prompt: string; aspect: string; media_asset_id: string | null; created_at: string; runpod_job_id: string | null }>>(
    `studio_generations?owner_id=eq.${user.id}&status=eq.completed&select=id,prompt,aspect,media_asset_id,created_at,runpod_job_id&order=created_at.desc&limit=30`,
  );
  return NextResponse.json({ items: rows });
}
