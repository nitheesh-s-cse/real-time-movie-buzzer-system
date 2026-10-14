import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">College Event</p>
        <h1 className="text-5xl font-black leading-tight tracking-tight text-white sm:text-6xl">
          🎬 Guess the <span className="text-amber-400">Movie</span>
        </h1>
        <p className="mx-auto max-w-md text-base text-slate-300">
          Real-time buzzer system. One team, one device, first finger wins —
          fairly, and verified by the server.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <Link
          href="/team/login"
          className="rounded-2xl bg-amber-400 px-8 py-5 text-lg font-bold text-slate-950 shadow-lg shadow-amber-400/20 transition active:scale-95"
        >
          🔔 Team Login
        </Link>
        <Link
          href="/leaderboard"
          className="rounded-2xl border border-slate-700 bg-slate-900 px-8 py-4 text-base font-semibold text-slate-200 transition active:scale-95"
        >
          🏆 Live Leaderboard
        </Link>
        <Link
          href="/admin/login"
          className="rounded-2xl px-8 py-3 text-sm font-medium text-slate-400 underline-offset-4 hover:underline"
        >
          Organizer / Admin Login
        </Link>
      </div>

      <p className="max-w-md text-xs text-slate-500">
        Teams must be pre-registered by the organizer. Lost your device or PIN? Ask an
        organizer at the help desk for an admin-assisted session reset.
      </p>
    </main>
  );
}
