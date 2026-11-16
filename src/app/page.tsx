import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth";
import { config } from "@/server/config";
import { Logo } from "@/components/ui";
import { DemoButton } from "@/components/DemoButton";

const FRIENDS = [
  { x: 14, y: 22, c: "#ff7a59", i: "MP", t: "14 min" },
  { x: 84, y: 16, c: "#8b7cff", i: "LM", t: "16 min" },
  { x: 10, y: 78, c: "#4cb8f5", i: "PS", t: "13 min" },
  { x: 88, y: 80, c: "#2fd09a", i: "JB", t: "15 min" },
];

function HeroMap() {
  return (
    <div className="relative aspect-square w-full max-w-[460px] overflow-hidden rounded-[2.2rem] bg-[#e8eee9] shadow-pop">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id="blocks" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
            <rect width="12" height="12" fill="#e8eee9" />
            <rect x="1.4" y="1.4" width="9.2" height="9.2" rx="1.6" fill="#f6f7f2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#blocks)" />
        <path d="M-5 60 C 30 52, 55 70, 105 48" stroke="#cfe3f5" strokeWidth="6" fill="none" />
        <ellipse cx="72" cy="40" rx="11" ry="8" fill="#cdeccf" />
        {FRIENDS.map((f, i) => (
          <path
            key={i}
            d={`M${f.x} ${f.y} Q ${(f.x + 50) / 2 + (i % 2 ? 8 : -8)} ${(f.y + 50) / 2}, 50 50`}
            stroke="#17141f"
            strokeWidth="0.9"
            strokeDasharray="2 2"
            fill="none"
            opacity="0.55"
          />
        ))}
      </svg>
      {FRIENDS.map((f, i) => (
        <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${f.x}%`, top: `${f.y}%`, animation: `float 3.4s ${i * 0.4}s ease-in-out infinite` }}>
          <div className="grid h-12 w-12 place-items-center rounded-full border-[3px] border-white text-sm font-bold text-white shadow-pop" style={{ background: f.c }}>
            {f.i}
          </div>
          <div className="mt-1 rounded-full bg-white px-2 py-0.5 text-center text-[11px] font-bold shadow-card">{f.t}</div>
        </div>
      ))}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w2-dest">🍜</div>
      </div>
      <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-2xl bg-white/95 p-3 shadow-card backdrop-blur">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted">Fairest pick</div>
          <div className="font-display font-bold">Noodle Bar, Hayes Valley</div>
        </div>
        <div className="rounded-xl bg-volt px-2.5 py-1.5 text-center">
          <div className="font-display text-lg font-extrabold leading-none">96%</div>
          <div className="text-[10px] font-bold text-volt-ink">fair</div>
        </div>
      </div>
    </div>
  );
}

export default async function Landing() {
  if (await getCurrentUser()) redirect("/home");
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <div className="flex gap-2">
          <Link href="/login" className="btn btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-ink">
            Sign up
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-16 pt-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:pt-14">
        <div className="animate-rise">
          <span className="chip mb-5 !bg-volt !shadow-none">📍 Meet in the middle, fairly</span>
          <h1 className="font-display text-[3.1rem] font-extrabold leading-[0.98] sm:text-7xl">
            “Where should
            <br />
            we meet?”
            <br />
            <span className="relative inline-block">
              Solved.
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 200 12" preserveAspectRatio="none">
                <path d="M2 9 C 50 2, 150 2, 198 8" stroke="#d4ff3f" strokeWidth="6" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted">
            Where2 finds spots that are fair for everyone&apos;s commute. Your group votes on one, and then you watch each other show up on a live map.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-volt btn-lg">
              Start planning. It&apos;s free
            </Link>
            {config.demoMode && <DemoButton />}
          </div>
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {[
              ["⚖️", "Fair spots", "Real travel times for every friend"],
              ["🗳️", "Group vote", "Live results, change anytime"],
              ["🛰️", "Live arrival", "See friends get closer"],
            ].map(([e, t, d]) => (
              <div key={t} className="card p-3.5">
                <div className="text-xl">{e}</div>
                <div className="mt-1 text-sm font-bold">{t}</div>
                <div className="text-xs text-muted">{d}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center md:justify-end">
          <HeroMap />
        </div>
      </main>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div className="text-3xl">🔒</div>
          <div className="flex-1">
            <div className="font-display text-lg font-bold">Your location stays under your control</div>
            <p className="text-sm text-muted">
              You turn on live sharing separately for each hangout. You can pause it any time, you can see exactly who can view it, and it switches itself off when the hangout ends.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
