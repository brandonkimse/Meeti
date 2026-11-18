"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { HangoutScreen } from "@/components/hangout/HangoutScreen";
import { PlaceCover } from "@/components/PlaceCover";
import { LegalLinks } from "@/components/LegalLinks";
import { AvatarStack, Logo, PageLoader, Spinner } from "@/components/ui";
import { api, fetcher } from "@/lib/client/api";
import { when } from "@/lib/client/format";
import { MODES, type Category, type HangoutStatus, type Mode, type PublicUser } from "@/lib/types";

type Preview = {
  hangoutId: string;
  title: string;
  startsAt: number;
  status: HangoutStatus;
  mode: Mode;
  category: Category | null;
  destName: string | null;
  hostName: string;
  people: PublicUser[];
  joined: boolean;
  me: { id: string; name: string; isGuest: boolean } | null;
};

/** The page friends land on from a plan's link. No account needed. */
export default function JoinPlan() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data: p, error, mutate } = useSWR<Preview>(`/api/p/${encodeURIComponent(code)}`, fetcher);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // People with an account use the full app.
  const memberView = p?.joined && p.me && !p.me.isGuest;
  useEffect(() => {
    if (memberView && p) router.replace(`/hangouts/${p.hangoutId}`);
  }, [memberView, p, router]);

  async function join() {
    setBusy(true);
    setJoinError(null);
    try {
      const r = await api<{ hangoutId: string; isGuest: boolean }>(`/api/p/${encodeURIComponent(code)}/join`, { body: { name } });
      if (!r.isGuest) router.replace(`/hangouts/${r.hangoutId}`);
      else await mutate();
    } catch (e) {
      setJoinError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error)
    return (
      <Shell>
        <div className="card p-6 text-center">
          <div className="text-4xl">🔗</div>
          <h1 className="font-display mt-2 text-xl font-bold">{error.message}</h1>
          <p className="mt-1 text-sm text-muted">Ask whoever sent it for a new link.</p>
        </div>
      </Shell>
    );
  if (!p || memberView) return <PageLoader />;

  // A guest who has joined sees the plan itself.
  if (p.joined && p.me?.isGuest)
    return (
      <div>
        <div className="sticky top-0 z-[700] flex items-center justify-between gap-2 border-b border-line/60 bg-paper/90 px-4 py-2 backdrop-blur">
          <Link href="/">
            <Logo className="!text-lg" />
          </Link>
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="truncate text-muted">
              Joined as <span className="font-semibold text-ink">{p.me.name}</span>
            </span>
            <Link href={`/signup?next=${encodeURIComponent(`/p/${code}`)}`} className="btn btn-ink btn-sm shrink-0">
              Save with an account
            </Link>
          </div>
        </div>
        <HangoutScreen id={p.hangoutId} guest />
      </div>
    );

  const over = p.status === "completed" || p.status === "cancelled";
  const mode = MODES.find((m) => m.id === p.mode);
  return (
    <Shell>
      <div className="card w-full animate-rise overflow-hidden">
        <div className="relative h-32">
          <PlaceCover imageUrl={null} category={p.category} seed={p.hangoutId} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <div className="text-xs font-bold uppercase tracking-wider text-volt">{p.hostName} invited you</div>
            <h1 className="font-display text-2xl font-extrabold leading-tight">{p.title}</h1>
          </div>
        </div>
        <div className="p-5">
          <p className="text-sm font-semibold text-muted">
            {when(p.startsAt)} · {mode?.emoji} {mode?.label}
            {p.destName ? ` · ${p.destName}` : ""}
          </p>
          {p.people.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted">
              <AvatarStack users={p.people} size={28} />
              <span>
                {p.people.length} {p.people.length === 1 ? "person" : "people"} in so far
              </span>
            </div>
          )}

          {over ? (
            <p className="mt-5 rounded-xl bg-soft p-3 text-center text-sm font-semibold">This hangout has already happened.</p>
          ) : p.me ? (
            <button className="btn btn-volt btn-lg mt-5 w-full" onClick={join} disabled={busy}>
              {busy ? <Spinner /> : `Join as ${p.me.name}`}
            </button>
          ) : (
            <form
              className="mt-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <div>
                <label className="label" htmlFor="guest-name">
                  Your name
                </label>
                <input
                  id="guest-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="So your friends know it's you"
                  maxLength={40}
                  autoComplete="given-name"
                  autoFocus
                  required
                />
              </div>
              <button className="btn btn-volt btn-lg w-full" disabled={busy || !name.trim()}>
                {busy ? <Spinner /> : "Join the plan"}
              </button>
              <p className="text-center text-xs text-muted">No account needed. You&apos;ll add where you&apos;re coming from next.</p>
              <p className="text-center text-[11px] text-faint">
                By joining you agree to the{" "}
                <Link href="/terms" target="_blank" className="underline underline-offset-2">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="underline underline-offset-2">
                  Privacy policy
                </Link>
                .
              </p>
            </form>
          )}
          {joinError && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{joinError}</p>}
          {!p.me && !over && (
            <p className="mt-4 text-center text-sm text-muted">
              Have an account?{" "}
              <Link href={`/login?next=${encodeURIComponent(`/p/${code}`)}`} className="font-bold text-ink underline decoration-volt decoration-[3px] underline-offset-4">
                Log in
              </Link>
            </p>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <Link href="/">
        <Logo />
      </Link>
      <div className="flex flex-1 items-center py-8">{children}</div>
      <LegalLinks />
    </div>
  );
}
