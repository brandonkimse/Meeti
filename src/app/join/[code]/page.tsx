"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { AvatarStack, GroupTile, Logo, PageLoader, Spinner } from "@/components/ui";
import { api, fetcher } from "@/lib/client/api";
import type { PublicUser } from "@/lib/types";

type Preview = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  emoji: string | null;
  memberCount: number;
  members: PublicUser[];
  alreadyMember: boolean;
  signedIn: boolean;
};

export default function Join() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { data, error } = useSWR<Preview>(`/api/invites/${encodeURIComponent(code)}`, fetcher);
  const [busy, setBusy] = useState(false);
  const next = `/join/${code}`;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
      <Link href="/">
        <Logo />
      </Link>
      <div className="flex flex-1 items-center">
        {error ? (
          <div className="card w-full p-6 text-center">
            <div className="text-4xl">🔗</div>
            <h1 className="font-display mt-2 text-xl font-bold">{error.message}</h1>
            <p className="mt-1 text-sm text-muted">Ask your friend for a fresh invite link.</p>
          </div>
        ) : !data ? (
          <PageLoader />
        ) : (
          <div className="card w-full animate-rise p-6 text-center">
            <div className="flex justify-center">
              <GroupTile group={data} size={96} />
            </div>
            <p className="mt-4 text-sm font-semibold text-muted">You&apos;re invited to join</p>
            <h1 className="font-display text-3xl font-extrabold">{data.name}</h1>
            {data.description && <p className="mt-1 text-muted">{data.description}</p>}
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
              <AvatarStack users={data.members} size={30} />
              <span>{data.memberCount} members</span>
            </div>
            <div className="mt-6">
              {data.alreadyMember ? (
                <Link href={`/groups/${data.id}`} className="btn btn-ink btn-lg w-full">
                  You&apos;re already in. Open group
                </Link>
              ) : data.signedIn ? (
                <button
                  className="btn btn-volt btn-lg w-full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const r = await api<{ groupId: string }>(`/api/invites/${encodeURIComponent(code)}`, { body: {} });
                    router.push(`/groups/${r.groupId}`);
                    router.refresh();
                  }}
                >
                  {busy ? <Spinner /> : `Join ${data.name}`}
                </button>
              ) : (
                <div className="space-y-2">
                  <Link href={`/signup?next=${encodeURIComponent(next)}`} className="btn btn-volt btn-lg w-full">
                    Sign up to join
                  </Link>
                  <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-ghost w-full">
                    I already have an account
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
