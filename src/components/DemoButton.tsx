"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Spinner, useToast } from "./ui";

export function DemoButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn btn-outline btn-lg"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/api/auth/demo", { body: {} });
          router.push("/home");
          router.refresh();
        } catch (e) {
          toast((e as Error).message, "error");
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner /> : "✨ Try the live demo"}
    </button>
  );
}
