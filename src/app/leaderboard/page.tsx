import Link from "next/link";
import LeaderboardView from "@/app/components/LeaderboardView";

export const dynamic = "force-dynamic";

export default function PublicLeaderboardPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">Guess the Movie</p>
        <h1 className="mt-1 text-4xl font-black text-white">🏆 Live Leaderboard</h1>
        <Link href="/" className="mt-2 inline-block text-sm text-slate-400 underline-offset-4 hover:underline">
          ← Back to home
        </Link>
      </div>
      <LeaderboardView />
    </main>
  );
}
