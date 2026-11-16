"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ArrowRight, Plus, Users } from "lucide-react";
import { useMe } from "@/components/AppShell";
import { HangoutCard } from "@/components/HangoutCard";
import { AvatarStack, GroupTile, PageLoader, ErrorState } from "@/components/ui";
import { fetcher } from "@/lib/client/api";
import { firstName, when } from "@/lib/client/format";
import { useEvents } from "@/lib/client/useEvents";
import type { GroupSummary, HangoutListItem } from "@/lib/types";

type Home = { groups: GroupSummary[]; upcoming: HangoutListItem[] };

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Up late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  const me = useMe();
  const router = useRouter();
  const { data, error, mutate } = useSWR<Home>("/api/home", fetcher);
  const [code, setCode] = useState("");
  useEvents((e) => {
    if (e.type !== "ready" && e.type !== "location") mutate();
  });

  if (error) return <ErrorState message="Couldn't load your home." />;
  if (!data) return <PageLoader />;

  const live = data.upcoming.filter((h) => h.status === "live");
  const planning = data.upcoming.filter((h) => h.status === "planning");

  return (
    <div className="space-y-9">
      <section className="animate-rise">
        <p className="text-sm font-semibold text-muted">{greeting()},</p>
        <h1 className="font-display text-4xl font-extrabold">{firstName(me.name)} ✌️</h1>
      </section>

      {data.groups.length === 0 ? (
        <section className="card animate-rise overflow-hidden">
          <div className="bg-volt p-6">
            <div className="text-4xl">👯</div>
            <h2 className="font-display mt-3 text-2xl font-extrabold">Start your first crew</h2>
            <p className="mt-1 max-w-sm text-volt-ink">Make a group, invite your friends, and Where2 will find somewhere that works for all of you.</p>
          </div>
          <div className="flex flex-wrap gap-2 p-5">
            <Link href="/groups/new" className="btn btn-ink">
              <Plus className="h-4 w-4" /> Create a group
            </Link>
          </div>
        </section>
      ) : null}

      {live.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold">Happening now</h2>
          {live.map((h) => (
            <HangoutCard key={h.id} h={h} showGroup />
          ))}
        </section>
      )}

      {planning.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold">In the works</h2>
          {planning.map((h) => (
            <HangoutCard key={h.id} h={h} showGroup />
          ))}
        </section>
      )}

      {data.groups.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Your groups</h2>
            <Link href="/groups/new" className="btn btn-soft btn-sm">
              <Plus className="h-4 w-4" /> New
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.groups.map((g, i) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className="card animate-rise flex flex-col gap-4 p-4 transition-transform hover:-translate-y-0.5"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-3">
                  <GroupTile group={g} size={52} />
                  <div className="min-w-0 flex-1">
                    <div className="font-display truncate text-lg font-bold">{g.name}</div>
                    <div className="flex items-center gap-1 truncate whitespace-nowrap text-sm text-muted">
                      <Users className="h-3.5 w-3.5" /> {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                      {g.members.some((m) => m.online) && <span className="ml-1 text-mint">· {g.members.filter((m) => m.online).length} online</span>}
                    </div>
                  </div>
                  <AvatarStack users={g.members} size={28} max={3} />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-soft px-3 py-2.5 text-sm">
                  {g.nextHangout ? (
                    <span className="truncate">
                      <span className="font-bold">{g.nextHangout.status === "live" ? "● Live: " : "Next: "}</span>
                      {g.nextHangout.title} · <span className="text-muted">{when(g.nextHangout.startsAt)}</span>
                    </span>
                  ) : (
                    <span className="text-muted">Nothing planned yet</span>
                  )}
                  <ArrowRight className="h-4 w-4 shrink-0 text-faint" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="font-display font-bold">Got an invite code?</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim().replace(/.*\/join\//, "");
            if (c) router.push(`/join/${encodeURIComponent(c)}`);
          }}
        >
          <input className="input uppercase tracking-widest" placeholder="e.g. K7Q2M9PX" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn btn-ink">Join</button>
        </form>
      </section>
    </div>
  );
}
