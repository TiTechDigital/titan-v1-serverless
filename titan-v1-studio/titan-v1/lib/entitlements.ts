import type { NextRequest } from "next/server";
import { isPlanId, PLANS, type PlanId, type PlanLimits } from "./plans";
import { authenticate, DbError, rpc, type AuthedUser } from "./server/supabase";

export interface Entitlement {
  user: AuthedUser;
  plan: PlanId;
  status: string;
  limits: PlanLimits;
  videosLeft: number;
}

interface EntRow { plan: string; status: string; videos_used: number; videos_limit: number }

/** Real plan + remaining quota for the signed-in user (Titanposting's Supabase, table studio_subscriptions). */
export async function getEntitlement(req: NextRequest): Promise<Entitlement | null> {
  const user = await authenticate(req);
  if (!user) return null;
  const rows = await rpc<EntRow[]>("studio_entitlement", { p_owner_id: user.id }).catch((e) => {
    if (e instanceof DbError && e.status === 403) return null; // not the workspace owner
    throw e;
  });
  const row = rows?.[0];
  if (!row) return null;
  const plan: PlanId = isPlanId(row.plan) ? row.plan : "free";
  return { user, plan, status: row.status, limits: PLANS[plan], videosLeft: Math.max(0, row.videos_limit - row.videos_used) };
}

export type ReserveResult = { ok: true; id: string } | { ok: false; reason: "quota" | "inactive" };

/** Atomically counts one video against the quota (DB-side lock). */
export async function reserveVideo(e: Entitlement, prompt: string, aspect: string): Promise<ReserveResult> {
  try {
    const id = await rpc<string>("studio_reserve_generation", { p_owner_id: e.user.id, p_prompt: prompt, p_aspect: aspect });
    return { ok: true, id };
  } catch (err) {
    if (err instanceof DbError && err.body.includes("STUDIO_QUOTA_EXCEEDED")) return { ok: false, reason: "quota" };
    if (err instanceof DbError && err.body.includes("STUDIO_SUBSCRIPTION_INACTIVE")) return { ok: false, reason: "inactive" };
    throw err;
  }
}

export const settleGeneration = (userId: string, generationId: string, status: "running" | "completed" | "refunded", jobId?: string) =>
  rpc<string>("studio_update_generation", { p_owner_id: userId, p_generation_id: generationId, p_status: status, p_job_id: jobId ?? null, p_media_id: null });
