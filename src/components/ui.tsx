"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { gradient, initials } from "@/lib/client/colors";
import { useIsOnline } from "./Online";
import type { PublicUser } from "@/lib/types";

/* ---------- Brand ---------- */

export function Logo({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={`font-display inline-flex items-center gap-1.5 text-xl font-extrabold ${className}`}>
      <span className="relative grid h-7 w-7 place-items-center rounded-[10px] bg-volt text-ink shadow-[inset_0_-2px_0_rgba(0,0,0,0.1)]">
        {/* Two paths meeting at one point. */}
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden>
          <path d="M4 18 C 7 12, 9 12, 12 12 C 15 12, 17 12, 20 18" />
          <circle cx="12" cy="7" r="2.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span className={dark ? "text-white" : "text-ink"}>
        Meet<span className="text-volt-ink">i</span>
      </span>
    </span>
  );
}

/* ---------- Avatars ---------- */

type AvatarUser = Pick<PublicUser, "id" | "name" | "avatarUrl"> & { online?: boolean };

export function Avatar({ user, size = 40, ring = false, showOnline = false }: { user: AvatarUser; size?: number; ring?: boolean; showOnline?: boolean }) {
  const isOnline = useIsOnline();
  const online = isOnline(user);
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} title={user.name}>
      <span
        className={`grid h-full w-full place-items-center overflow-hidden rounded-full font-bold text-white ${ring ? "ring-[3px] ring-white" : ""}`}
        style={{ background: user.avatarUrl ? undefined : gradient(user.id), fontSize: size * 0.38 }}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials(user.name)
        )}
      </span>
      {showOnline && (
        <span
          className={`absolute bottom-0 right-0 rounded-full ring-2 ring-white ${online ? "bg-mint" : "bg-faint"}`}
          style={{ width: Math.max(9, size * 0.26), height: Math.max(9, size * 0.26) }}
          aria-label={online ? "Online" : "Offline"}
        />
      )}
    </span>
  );
}

export function AvatarStack({ users, size = 28, max = 5 }: { users: AvatarUser[]; size?: number; max?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((u, i) => (
        <span key={u.id} style={{ marginLeft: i ? -size * 0.3 : 0, zIndex: shown.length - i }}>
          <Avatar user={u} size={size} ring />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="grid place-items-center rounded-full bg-soft font-bold text-muted ring-[3px] ring-white"
          style={{ width: size, height: size, marginLeft: -size * 0.3, fontSize: size * 0.36 }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

export function GroupTile({ group, size = 56 }: { group: { id: string; name: string; imageUrl: string | null; emoji: string | null }; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden"
      style={{ width: size, height: size, borderRadius: size * 0.32, background: group.imageUrl ? undefined : gradient(group.id + "g") }}
    >
      {group.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={group.imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.5 }}>{group.emoji || "✨"}</span>
      )}
    </span>
  );
}

/* ---------- Sheet / modal ---------- */

export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button aria-label="Close" className="absolute inset-0 animate-fade bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative max-h-[92dvh] w-full animate-sheet overflow-y-auto rounded-t-3xl bg-paper p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop sm:animate-pop sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">{title}</h2>
            <button className="btn btn-ghost -mr-2 p-2" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/* ---------- Toasts ---------- */

type Toast = { id: number; text: string; tone: "default" | "error" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "default") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-rise rounded-2xl px-4 py-3 text-sm font-semibold shadow-pop ${t.tone === "error" ? "bg-danger text-white" : "bg-ink text-white"}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/* ---------- Misc ---------- */

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50dvh] place-items-center text-muted">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function ErrorState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-[50dvh] max-w-sm place-items-center text-center">
      <div>
        <div className="mb-3 text-4xl">🫠</div>
        <p className="font-display text-lg font-bold">{message}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: ReactNode; disabled?: boolean }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="flex rounded-full bg-soft p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          disabled={o.disabled}
          onClick={() => onChange(o.id)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-full font-semibold transition-all disabled:opacity-40 ${
            size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
          } ${value === o.id ? "bg-white text-ink shadow-card" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
