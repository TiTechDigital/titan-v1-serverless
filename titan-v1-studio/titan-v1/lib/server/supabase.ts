import type { NextRequest } from "next/server";

/**
 * Server-only Supabase access. SUPABASE_SERVICE_ROLE_KEY never reaches the browser; every call that
 * uses it is scoped to a user id that was first proven by verifying the caller's JWT.
 */
const url = () => (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
const anon = () => process.env.SUPABASE_ANON_KEY ?? "";
const service = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabaseConfigured = () => Boolean(url() && anon() && service());

export interface AuthedUser { id: string; email: string }

export async function authenticate(req: NextRequest): Promise<AuthedUser | null> {
  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token || !supabaseConfigured()) return null;
  const r = await fetch(`${url()}/auth/v1/user`, { headers: { apikey: anon(), Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!r.ok) return null;
  const u = (await r.json().catch(() => null)) as { id?: string; email?: string } | null;
  return u?.id ? { id: u.id, email: u.email ?? "" } : null;
}

export class DbError extends Error {
  constructor(public status: number, public body: string) { super(`Supabase ${status}`); }
}

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const r = await fetch(`${url()}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: service(), Authorization: `Bearer ${service()}`, "Content-Type": "application/json" },
  });
  const text = await r.text();
  if (!r.ok) throw new DbError(r.status, text);
  return (text ? JSON.parse(text) : null) as T;
}

export const rpc = <T>(fn: string, args: Record<string, unknown>) =>
  call<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
export const select = <T>(path: string) => call<T>(path, { method: "GET" });
