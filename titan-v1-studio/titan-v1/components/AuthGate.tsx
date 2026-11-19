"use client";
import { useEffect, useState, type ReactNode } from "react";
import { consumeLaunchFragment, supabase } from "@/lib/supabaseClient";
import { loginUrl } from "@/lib/titanposting";

/** Studio needs a real Titanposting (Supabase) session; there is no anonymous mode. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        await consumeLaunchFragment();
        const sb = supabase();
        const { data } = await sb.auth.getSession();
        if (live) setState(data.session ? "in" : "out");
        const sub = sb.auth.onAuthStateChange((_e, s) => { if (live) setState(s ? "in" : "out"); });
        unsub = () => sub.data.subscription.unsubscribe();
      } catch (e) {
        if (live) { setError(e instanceof Error ? e.message : "Sign-in failed"); setState("out"); }
      }
    })();
    return () => { live = false; unsub?.(); };
  }, []);

  if (state === "in") return <>{children}</>;
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-[420px] text-center">
        <h1 className="display text-[22px]">Titan Studio</h1>
        {state === "loading" ? (
          <p className="mt-3 text-[14px] text-mute">Signing you in…</p>
        ) : (
          <>
            <p className="mt-3 text-[14px] text-mute">{error ?? "Open Titan Studio from your Titanposting workspace to sign in."}</p>
            <a href={loginUrl} className="btn-solid mt-5 inline-flex">Go to Titanposting</a>
          </>
        )}
      </div>
    </main>
  );
}
