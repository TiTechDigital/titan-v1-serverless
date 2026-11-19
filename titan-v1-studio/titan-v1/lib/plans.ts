/**
 * Plan capabilities. MUST match PLANS in handler.py (the worker enforces them again).
 * Monthly video quotas + trial expiry are counted by the platform (billing layer), not here.
 */
export type PlanId = "free" | "basic" | "pro" | "ultra";

export interface PlanLimits {
  label: string;
  priceUsd: number;
  videosPerPeriod: number; // free = total for the 3-day trial, others = per month
  wan: boolean;
  enable4k: boolean;
  true4k: boolean;
  maxSeconds: number;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free:  { label: "Trial", priceUsd: 0,     videosPerPeriod: 1,  wan: false, enable4k: true, true4k: true, maxSeconds: 5 },
  basic: { label: "Basic", priceUsd: 9.99,  videosPerPeriod: 2,  wan: true,  enable4k: true, true4k: true, maxSeconds: 20 },
  pro:   { label: "Pro",   priceUsd: 19.99, videosPerPeriod: 5,  wan: true,  enable4k: true, true4k: true, maxSeconds: 20 },
  ultra: { label: "Ultra", priceUsd: 49.99, videosPerPeriod: 15, wan: true,  enable4k: true, true4k: true, maxSeconds: 20 },
};

export const isPlanId = (x: unknown): x is PlanId => typeof x === "string" && x in PLANS;
