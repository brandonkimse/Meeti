"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import type { HangoutDetail } from "@/lib/types";
import { Sheet } from "../ui";

export function shareUrl(h: HangoutDetail) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/p/${h.shareCode}`;
}

/** Invite people to a plan with its link. Friends can join without an account. */
export function ShareSheet({ h, open, onClose }: { h: HangoutDetail; open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(h);
  const text = `Where should we meet for “${h.title}”? Add where you're coming from and vote:`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Sheet open={open} onClose={onClose} title="Invite friends">
      <p className="text-sm text-muted">
        Paste this link in your group chat. Friends add where they&apos;re coming from and vote. <span className="font-semibold text-ink">They don&apos;t need an account.</span>
      </p>
      <div className="mt-4 rounded-2xl bg-white p-4 shadow-card">
        <div className="truncate text-center font-mono text-sm font-semibold">{url}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn btn-ink" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied!" : "Copy link"}
        </button>
        <button
          className="btn btn-volt"
          onClick={() => (navigator.share ? navigator.share({ title: h.title, text, url }).catch(() => {}) : copy())}
        >
          <Share2 className="h-4 w-4" /> Share
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Anyone with this link can join the plan and see everyone&apos;s starting points.</p>
    </Sheet>
  );
}
