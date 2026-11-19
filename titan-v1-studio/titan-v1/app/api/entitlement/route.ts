import { NextRequest, NextResponse } from "next/server";
import { getEntitlement } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const e = await getEntitlement(req);
  if (!e) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ plan: e.plan, limits: e.limits, videosLeft: e.videosLeft });
}
