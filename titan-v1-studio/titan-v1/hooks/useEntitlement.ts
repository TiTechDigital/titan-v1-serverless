"use client";
import { useEffect, useState } from "react";
import { PLANS, type PlanId, type PlanLimits } from "@/lib/plans";
import { authFetch } from "@/lib/supabaseClient";

export interface EntitlementView { plan: PlanId; limits: PlanLimits; videosLeft: number | null }

/** Strictest limits until the server answers, so the UI never offers more than the plan allows. */
const FALLBACK: EntitlementView = { plan: "free", limits: PLANS.free, videosLeft: null };

export function useEntitlement(refreshKey?: unknown) {
  const [ent, setEnt] = useState<EntitlementView>(FALLBACK);
  useEffect(() => {
    let live = true;
    authFetch("/api/entitlement", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.limits) setEnt(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [refreshKey]);
  return ent;
}
