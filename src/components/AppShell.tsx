"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { Home, Plus, UserRound } from "lucide-react";
import { OnlineProvider } from "./Online";
import { Avatar, Logo } from "./ui";

export type Me = { id: string; name: string; email: string; avatarUrl: string | null; demoMode: boolean; groupIds: string[] };
const MeCtx = createContext<Me | null>(null);
export const useMe = () => useContext(MeCtx)!;

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const path = usePathname();
  const immersive = path.startsWith("/hangouts/");
  return (
    <MeCtx.Provider value={me}>
      <OnlineProvider meId={me.id} groupIds={me.groupIds}>
      <div className="min-h-dvh">
        {!immersive && (
          <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/85 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
              <Link href="/home">
                <Logo />
              </Link>
              <nav className="hidden items-center gap-1 sm:flex">
                <Link href="/home" className={`btn btn-ghost btn-sm ${path === "/home" ? "bg-soft" : ""}`}>
                  Home
                </Link>
                <Link href="/groups/new" className="btn btn-ink btn-sm">
                  <Plus className="h-4 w-4" /> New group
                </Link>
                <Link href="/profile" className="ml-2">
                  <Avatar user={me} size={36} />
                </Link>
              </nav>
              <Link href="/profile" className="sm:hidden">
                <Avatar user={me} size={34} />
              </Link>
            </div>
          </header>
        )}
        {me.demoMode && !immersive && (
          <div className="bg-ink px-4 py-1.5 text-center text-xs font-semibold text-white">
            Demo mode. Your friends here are simulated.
          </div>
        )}
        <main className={immersive ? "" : "mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-6 sm:pb-12"}>{children}</main>

        {!immersive && (
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
            <div className="mx-auto flex h-16 max-w-md items-center justify-around px-6">
              <Link href="/home" className={`flex flex-col items-center gap-0.5 text-[11px] font-semibold ${path === "/home" ? "text-ink" : "text-faint"}`}>
                <Home className="h-5 w-5" /> Home
              </Link>
              <Link href="/groups/new" className="-mt-7 grid h-14 w-14 place-items-center rounded-full bg-volt text-ink shadow-pop ring-4 ring-paper" aria-label="New group">
                <Plus className="h-6 w-6" strokeWidth={2.6} />
              </Link>
              <Link href="/profile" className={`flex flex-col items-center gap-0.5 text-[11px] font-semibold ${path === "/profile" ? "text-ink" : "text-faint"}`}>
                <UserRound className="h-5 w-5" /> You
              </Link>
            </div>
          </nav>
        )}
      </div>
      </OnlineProvider>
    </MeCtx.Provider>
  );
}
