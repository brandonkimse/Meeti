"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Logo, Spinner } from "./ui";

export function AuthForm({ mode, demoMode }: { mode: "login" | "signup"; demoMode: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/home";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/home";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"form" | "demo" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy("form");
    try {
      await api(`/api/auth/${mode}`, { body: mode === "signup" ? { name, email, password } : { email, password } });
      router.replace(safeNext);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function demo() {
    setBusy("demo");
    try {
      await api("/api/auth/demo", { body: {} });
      router.replace("/home");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  const other = mode === "login" ? "/signup" : "/login";
  const otherHref = next !== "/home" ? `${other}?next=${encodeURIComponent(next)}` : other;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <Link href="/" className="self-start">
        <Logo />
      </Link>
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="font-display animate-rise text-4xl font-extrabold leading-[1.05]">
          {mode === "signup" ? (
            <>
              Make plans
              <br />
              that work for everyone.
            </>
          ) : (
            <>Welcome back 👋</>
          )}
        </h1>
        <p className="mt-3 text-muted">{mode === "signup" ? "Create your account. It takes about ten seconds." : "Log in to see what your crew is up to."}</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="label" htmlFor="name">
                Your name
              </label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jamie Lee" autoComplete="name" required maxLength={40} />
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </div>
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
          <button className="btn btn-ink btn-lg w-full" disabled={!!busy}>
            {busy === "form" ? <Spinner /> : mode === "signup" ? "Create account" : "Log in"}
          </button>
        </form>

        {demoMode && (
          <button onClick={demo} className="btn btn-volt btn-lg mt-3 w-full" disabled={!!busy}>
            {busy === "demo" ? <Spinner /> : "✨ Explore the demo instead"}
          </button>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          {mode === "signup" ? "Already have an account? " : "New to Where2? "}
          <Link href={otherHref} className="font-bold text-ink underline decoration-volt decoration-[3px] underline-offset-4">
            {mode === "signup" ? "Log in" : "Create one"}
          </Link>
        </p>
      </div>
    </div>
  );
}
