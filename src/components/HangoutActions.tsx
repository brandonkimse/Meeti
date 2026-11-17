"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { api } from "@/lib/client/api";
import { Sheet, Spinner, useToast } from "./ui";

type Target = { id: string; title: string; status: string; canManage: boolean; canArchive: boolean; archived: boolean };
export type HangoutAction = "deleted" | "archived" | "restored";

/** "⋯" button with archive / restore (for past plans) and delete (host only). Renders nothing if neither applies. */
export function HangoutActions({ h, onDone, className = "" }: { h: Target; onDone: (a: HangoutAction) => void; className?: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<HangoutAction | null>(null);
  const canToggleArchive = h.archived || h.canArchive;
  if (!canToggleArchive && !h.canManage) return null;

  const close = () => {
    setOpen(false);
    setConfirming(false);
  };

  async function act(a: HangoutAction) {
    setBusy(a);
    try {
      if (a === "deleted") await api(`/api/hangouts/${h.id}`, { method: "DELETE" });
      else await api(`/api/hangouts/${h.id}/archive`, { body: { archived: a === "archived" } });
      toast(a === "deleted" ? "Hangout deleted" : a === "archived" ? "Archived. Find it under Archived on Home." : "Moved back to your hangouts");
      close();
      onDone(a);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Hangout options"
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-soft hover:text-ink ${className}`}
        onClick={(e) => {
          // Cards are links: keep the click from opening the hangout.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      <Sheet open={open} onClose={close} title={h.title}>
        {confirming ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              This deletes the plan, its votes and everyone&apos;s starting points for all {h.status === "live" ? "people on their way" : "participants"}. It can&apos;t be undone.
            </p>
            <button className="btn btn-lg w-full bg-danger text-white" disabled={!!busy} onClick={() => act("deleted")}>
              {busy === "deleted" ? <Spinner className="h-4 w-4" /> : "Delete for everyone"}
            </button>
            <button className="btn btn-ghost w-full" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {canToggleArchive && (
              <button className="btn btn-soft btn-lg w-full justify-start" disabled={!!busy} onClick={() => act(h.archived ? "restored" : "archived")}>
                {busy === "archived" || busy === "restored" ? (
                  <Spinner className="h-4 w-4" />
                ) : h.archived ? (
                  <ArchiveRestore className="h-5 w-5" />
                ) : (
                  <Archive className="h-5 w-5" />
                )}
                <span className="text-left">
                  {h.archived ? "Restore" : "Archive"}
                  <span className="block text-xs font-normal text-muted">{h.archived ? "Show it in your lists again" : "Hide it from your lists. Only for you."}</span>
                </span>
              </button>
            )}
            {h.canManage && (
              <button className="btn btn-soft btn-lg w-full justify-start text-danger" onClick={() => setConfirming(true)}>
                <Trash2 className="h-5 w-5" />
                <span className="text-left">
                  Delete hangout
                  <span className="block text-xs font-normal text-muted">Removes it for everyone</span>
                </span>
              </button>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
