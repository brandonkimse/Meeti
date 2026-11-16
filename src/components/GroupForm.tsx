"use client";

import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { fileToDataUrl } from "@/lib/client/image";
import { GroupTile, Spinner } from "./ui";

const EMOJIS = ["🍕", "🎉", "📚", "🏀", "☕", "🎮", "🌮", "🏖️", "🎸", "👨‍👩‍👧", "🧗", "🍣", "💃", "🌿"];

export type GroupInput = { name: string; description: string; emoji: string; imageUrl: string | null };

export function GroupForm({ initial, submitLabel, onSubmit }: { initial?: Partial<GroupInput>; submitLabel: string; onSubmit: (v: GroupInput) => Promise<void> }) {
  const [v, setV] = useState<GroupInput>({ name: "", description: "", emoji: "🍕", imageUrl: null, ...initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSubmit(v);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center gap-4">
        <div className="relative">
          <GroupTile group={{ id: v.name || "new", name: v.name, imageUrl: v.imageUrl, emoji: v.emoji }} size={84} />
          <button
            type="button"
            onClick={() => (v.imageUrl ? setV({ ...v, imageUrl: null }) : file.current?.click())}
            className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-ink text-white ring-4 ring-paper"
            aria-label={v.imageUrl ? "Remove photo" : "Upload photo"}
          >
            {v.imageUrl ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setV({ ...v, imageUrl: await fileToDataUrl(f, 512) });
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex flex-1 flex-wrap gap-1.5">
          {EMOJIS.map((em) => (
            <button
              type="button"
              key={em}
              onClick={() => setV({ ...v, emoji: em, imageUrl: null })}
              className={`grid h-9 w-9 place-items-center rounded-xl text-lg transition ${v.emoji === em && !v.imageUrl ? "bg-ink" : "bg-white shadow-card hover:scale-110"}`}
            >
              {em}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="gname">
          Group name
        </label>
        <input id="gname" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Weekend Crew" maxLength={50} required />
      </div>
      <div>
        <label className="label" htmlFor="gdesc">
          Description <span className="font-normal text-faint">(optional)</span>
        </label>
        <textarea
          id="gdesc"
          className="input min-h-20 resize-none"
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="Brunch enthusiasts. Chronically late."
          maxLength={200}
        />
      </div>
      {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      <button className="btn btn-ink btn-lg w-full" disabled={busy || !v.name.trim()}>
        {busy ? <Spinner /> : submitLabel}
      </button>
    </form>
  );
}
