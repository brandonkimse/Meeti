"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { useMe } from "@/components/AppShell";
import { Avatar, Sheet, Spinner, useToast } from "@/components/ui";
import { api } from "@/lib/client/api";
import { fileToDataUrl } from "@/lib/client/image";

export default function Profile() {
  const me = useMe();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatarUrl);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function deleteAccount() {
    setDeleteBusy(true);
    try {
      await api("/api/me", { method: "DELETE", body: { confirm: confirmText.trim().toUpperCase() } });
      router.replace("/");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
      setDeleteBusy(false);
    }
  }

  async function save(patch: { name?: string; avatarUrl?: string | null }) {
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", body: patch });
      router.refresh();
      toast("Profile updated");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="font-display text-3xl font-extrabold">You</h1>
      <div className="card flex flex-col items-center p-6 text-center">
        <div className="relative">
          <Avatar user={{ ...me, avatarUrl: avatar }} size={104} />
          <button
            className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full bg-ink text-white ring-4 ring-white"
            onClick={() => file.current?.click()}
            aria-label="Change photo"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const url = await fileToDataUrl(f);
              setAvatar(url);
              save({ avatarUrl: url });
            }}
          />
        </div>
        {avatar && (
          <button
            className="btn btn-ghost btn-sm mt-2 text-muted"
            onClick={() => {
              setAvatar(null);
              save({ avatarUrl: null });
            }}
          >
            Remove photo
          </button>
        )}
        <div className="mt-2 text-sm text-muted">{me.email}</div>
      </div>

      <form
        className="card space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save({ name });
        }}
      >
        <label className="label" htmlFor="pname">
          Display name
        </label>
        <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <button className="btn btn-ink w-full" disabled={busy || !name.trim() || name === me.name}>
          {busy ? <Spinner /> : "Save"}
        </button>
      </form>

      <div className="card flex gap-3 p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-mint" />
        <div className="text-sm">
          <div className="font-bold">How Meeti handles your location</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-muted">
            <li>Your starting point for a plan is shared only with that hangout&apos;s members. You can type a nearby landmark instead of using GPS.</li>
            <li>Live location is off until you turn it on for a specific hangout, and you can pause or stop it at any time.</li>
            <li>Sharing ends on its own when the hangout ends, and your live coordinates are deleted.</li>
          </ul>
        </div>
      </div>

      <button
        className="btn btn-outline w-full"
        onClick={async () => {
          await api("/api/auth/logout", { body: {} });
          router.replace("/");
          router.refresh();
        }}
      >
        <LogOut className="h-4 w-4" /> Log out
      </button>

      <div className="text-center">
        <button className="btn btn-ghost btn-sm text-danger" onClick={() => setDeleting(true)}>
          <Trash2 className="h-4 w-4" /> Delete my account
        </button>
        <p className="mt-2 text-xs text-faint">
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
        </p>
      </div>

      <Sheet
        open={deleting}
        onClose={() => {
          setDeleting(false);
          setConfirmText("");
        }}
        title="Delete your account?"
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted">This permanently deletes your account, profile, starting points, votes and location history. It can&apos;t be undone.</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>Groups you own pass to the longest-standing member.</li>
            <li>Plans you host pass to someone else in them, so your friends keep their plans. Plans with nobody else are deleted.</li>
          </ul>
          <label className="label !mt-4" htmlFor="confirm-delete">
            Type DELETE to confirm
          </label>
          <input id="confirm-delete" className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" placeholder="DELETE" />
          <button className="btn btn-lg w-full bg-danger text-white" disabled={deleteBusy || confirmText.trim().toUpperCase() !== "DELETE"} onClick={deleteAccount}>
            {deleteBusy ? <Spinner className="h-4 w-4" /> : "Delete my account forever"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
