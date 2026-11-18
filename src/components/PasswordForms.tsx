"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Logo, Spinner } from "./ui";

function Frame({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <Link href="/" className="self-start">
        <Logo />
      </Link>
      <div className="flex flex-1 flex-col justify-center py-10">
        <h1 className="font-display animate-rise text-4xl font-extrabold leading-[1.05]">{title}</h1>
        <p className="mt-3 text-muted">{intro}</p>
        {children}
      </div>
    </div>
  );
}

/** Ask for a reset email. */
export function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const linkError = params.get("error") === "link";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/forgot", { body: { email } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame title="Forgot your password?" intro="Enter your email and we'll send you a link to choose a new one.">
      {linkError && (
        <p className="mt-6 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">
          That reset link has expired or was already used. Request a new one below.
        </p>
      )}
      {sent ? (
        <div className="card mt-8 animate-rise p-6 text-center">
          <div className="text-4xl">📬</div>
          <h2 className="font-display mt-2 text-xl font-bold">Check your email</h2>
          <p className="mt-1 text-sm text-muted">
            If <span className="font-semibold text-ink">{email}</span> has a Meeti account, a reset link is on its way. It can take a minute, so check spam too.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
          </div>
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
          <button className="btn btn-ink btn-lg w-full" disabled={busy}>
            {busy ? <Spinner /> : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-bold text-ink underline decoration-volt decoration-[3px] underline-offset-4">
          Log in
        </Link>
      </p>
    </Frame>
  );
}

/** Choose a new password (the reset link has already signed you in). */
export function ResetPasswordForm({ email }: { email: string | null }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/password", { body: { password } });
      router.replace("/home");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Frame title="Choose a new password" intro={email ? `For ${email}.` : "Pick something you'll remember."}>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="password">
            New password
          </label>
          <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" minLength={8} required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            Type it again
          </label>
          <input id="confirm" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        <button className="btn btn-ink btn-lg w-full" disabled={busy}>
          {busy ? <Spinner /> : "Save new password"}
        </button>
      </form>
    </Frame>
  );
}
