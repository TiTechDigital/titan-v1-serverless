"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Browser Supabase client (public anon key only). Same project as Titanposting, so the same user. */
export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set");
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  return client;
}

/**
 * Titanposting opens Studio as `/#access_token=…&refresh_token=…`. Fragments never reach a server.
 * Hand the tokens to Supabase once, then wipe them from the address bar / history.
 */
export async function consumeLaunchFragment(): Promise<void> {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.includes("access_token=")) return;
  const q = new URLSearchParams(hash);
  const access_token = q.get("access_token");
  const refresh_token = q.get("refresh_token");
  history.replaceState(null, "", window.location.pathname + window.location.search);
  if (access_token && refresh_token) await supabase().auth.setSession({ access_token, refresh_token });
}

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase().auth.getSession();
  return data.session?.access_token ?? null;
}

/** fetch() with the signed-in user's JWT. */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  return fetch(input, { ...init, headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
}
