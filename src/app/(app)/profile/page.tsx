"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, LogOut, ShieldCheck } from "lucide-react";
import { useMe } from "@/components/AppShell";
import { Avatar, Spinner, useToast } from "@/components/ui";
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
          <div className="font-bold">How Where2 handles your location</div>
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
    </div>
  );
}
