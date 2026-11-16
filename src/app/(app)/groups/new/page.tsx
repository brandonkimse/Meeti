"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GroupForm } from "@/components/GroupForm";
import { api } from "@/lib/client/api";

export default function NewGroup() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-lg">
      <Link href="/home" className="btn btn-ghost btn-sm -ml-3 mb-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="font-display text-3xl font-extrabold">New group</h1>
      <p className="mb-6 mt-1 text-muted">Once it&apos;s made, you&apos;ll get a link to invite people.</p>
      <div className="card p-5">
        <GroupForm
          submitLabel="Create group"
          onSubmit={async (v) => {
            const { id } = await api<{ id: string }>("/api/groups", { body: v });
            router.push(`/groups/${id}?invite=1`);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
