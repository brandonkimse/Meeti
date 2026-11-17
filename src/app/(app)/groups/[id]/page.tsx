"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { ArrowLeft, Check, Copy, Crown, LogOut, MoreHorizontal, Pencil, RefreshCw, Share2, UserMinus, UserPlus } from "lucide-react";
import { useMe } from "@/components/AppShell";
import { useIsOnline } from "@/components/Online";
import { GroupForm } from "@/components/GroupForm";
import { HangoutCard } from "@/components/HangoutCard";
import { Avatar, ErrorState, GroupTile, PageLoader, Sheet, useToast } from "@/components/ui";
import { api, fetcher } from "@/lib/client/api";
import { ago } from "@/lib/client/format";
import { useEvents } from "@/lib/client/useEvents";
import type { GroupDetail, PublicUser } from "@/lib/types";

type Member = PublicUser & { role: string; joinedAt: number };

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const me = useMe();
  const router = useRouter();
  const toast = useToast();
  const { data: g, error, mutate } = useSWR<GroupDetail>(`/api/groups/${id}`, fetcher);
  const [invite, setInvite] = useState(search.get("invite") === "1");
  const [edit, setEdit] = useState(false);
  const [manage, setManage] = useState<Member | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  useEvents((e) => {
    if (e.type === "group.removed" && e.groupId === id) {
      toast("You were removed from this group.");
      router.replace("/home");
      return;
    }
    if ((e as { groupId?: string }).groupId === id || e.type === "resync") mutate();
  }, [`group:${id}`, `user:${me.id}`]);
  const isOnline = useIsOnline();

  if (error) return <ErrorState message="This group doesn't exist or you're not in it." action={<Link href="/home" className="btn btn-ink">Go home</Link>} />;
  if (!g) return <PageLoader />;

  const members = g.members as Member[];
  const isOwner = g.role === "owner";
  const link = `${origin}/join/${g.inviteCode}`;
  const upcoming = g.hangouts.filter((h) => h.status === "planning" || h.status === "live");
  const history = g.hangouts.filter((h) => h.status === "completed");
  const online = members.filter(isOnline).length;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href="/home" className="btn btn-ghost btn-sm -ml-3 mb-3">
          <ArrowLeft className="h-4 w-4" /> Home
        </Link>
        <div className="flex animate-rise items-start gap-4">
          <GroupTile group={g} size={76} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-extrabold leading-tight break-words sm:text-3xl">{g.name}</h1>
            {g.description && <p className="mt-0.5 text-muted">{g.description}</p>}
            <p className="mt-1 text-sm font-semibold text-muted">
              {members.length} members{online ? <span className="text-mint"> · {online} online</span> : null}
            </p>
          </div>
          {isOwner && (
            <button className="btn btn-soft p-2.5" onClick={() => setEdit(true)} aria-label="Edit group">
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <Link href={`/groups/${g.id}/plan`} className="btn btn-volt btn-lg flex-1 sm:flex-none">
            ✨ Start a hangout
          </Link>
          <button className="btn btn-outline btn-lg" onClick={() => setInvite(true)}>
            <UserPlus className="h-5 w-5" /> <span className="hidden sm:inline">Invite</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold">Upcoming</h2>
            {upcoming.length ? (
              upcoming.map((h) => <HangoutCard key={h.id} h={h} onChanged={() => mutate()} />)
            ) : (
              <div className="card p-6 text-center">
                <div className="text-3xl">🗓️</div>
                <p className="mt-2 font-semibold">Nothing planned yet</p>
                <p className="text-sm text-muted">Start a hangout, and Meeti will find a spot that&apos;s fair for everyone.</p>
              </div>
            )}
          </section>
          {history.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold">Hangout history</h2>
              {history.map((h) => (
                <HangoutCard key={h.id} h={h} onChanged={() => mutate()} />
              ))}
            </section>
          )}
        </div>

        <section>
          <h2 className="font-display mb-3 text-lg font-bold">Members</h2>
          <div className="card divide-y divide-line/70">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-3">
                <Avatar user={m} size={40} showOnline />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate font-semibold">
                    {m.name}
                    {m.id === me.id && <span className="text-xs font-semibold text-muted">(you)</span>}
                    {m.role === "owner" && <Crown className="h-3.5 w-3.5 text-amber" aria-label="Owner" />}
                  </div>
                  <div className="text-xs text-muted">{isOnline(m) ? "Online now" : `Joined ${ago(m.joinedAt)}`}</div>
                </div>
                {isOwner && m.id !== me.id && (
                  <button className="btn btn-ghost p-2" onClick={() => setManage(m)} aria-label={`Manage ${m.name}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm mt-3 text-danger" onClick={() => setConfirmLeave(true)}>
            <LogOut className="h-4 w-4" /> Leave group
          </button>
        </section>
      </div>

      <Sheet open={invite} onClose={() => setInvite(false)} title="Invite friends">
        <p className="text-sm text-muted">Anyone with this link can join {g.name}. Only share it with people you trust.</p>
        <div className="mt-4 rounded-2xl bg-white p-4 text-center shadow-card">
          <div className="text-xs font-bold uppercase tracking-wider text-muted">Invite code</div>
          <div className="font-display mt-1 text-3xl font-extrabold tracking-[0.2em]">{g.inviteCode}</div>
          <div className="mt-2 truncate text-xs text-muted">{link}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn btn-ink" onClick={copy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            className="btn btn-volt"
            onClick={() =>
              navigator.share
                ? navigator.share({ title: `Join ${g.name} on Meeti`, text: `Join ${g.name} on Meeti so we can plan hangouts together`, url: link }).catch(() => {})
                : copy()
            }
          >
            <Share2 className="h-4 w-4" /> Share
          </button>
        </div>
        {isOwner && (
          <button
            className="btn btn-ghost btn-sm mt-3 w-full text-muted"
            onClick={async () => {
              await api(`/api/groups/${g.id}/invite`, { body: {} });
              mutate();
              toast("Invite link reset. The old link no longer works.");
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reset link
          </button>
        )}
      </Sheet>

      <Sheet open={edit} onClose={() => setEdit(false)} title="Edit group">
        <GroupForm
          initial={{ name: g.name, description: g.description ?? "", emoji: g.emoji ?? "✨", imageUrl: g.imageUrl }}
          submitLabel="Save changes"
          onSubmit={async (v) => {
            await api(`/api/groups/${g.id}`, { method: "PATCH", body: v });
            await mutate();
            setEdit(false);
          }}
        />
      </Sheet>

      <Sheet open={!!manage} onClose={() => setManage(null)} title={manage?.name}>
        <p className="text-sm text-muted">If you remove them, they lose access to this group and any plans that are still open.</p>
        <button
          className="btn btn-danger mt-4 w-full"
          onClick={async () => {
            await api(`/api/groups/${g.id}/members/${manage!.id}`, { method: "DELETE" });
            setManage(null);
            mutate();
          }}
        >
          <UserMinus className="h-4 w-4" /> Remove from group
        </button>
      </Sheet>

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title={`Leave ${g.name}?`}>
        <p className="text-sm text-muted">
          You&apos;ll be taken out of any plans that are still open.
          {isOwner && members.length > 1 ? " Ownership passes to the member who's been in the group longest." : ""}
          {members.length === 1 ? " You're the last member, so the group will be deleted." : ""}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="btn btn-soft" onClick={() => setConfirmLeave(false)}>
            Stay
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await api(`/api/groups/${g.id}/leave`, { body: {} });
              router.replace("/home");
              router.refresh();
            }}
          >
            Leave
          </button>
        </div>
      </Sheet>
    </div>
  );
}
