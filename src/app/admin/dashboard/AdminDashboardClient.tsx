"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAdminStream } from "./useAdminStream";
import MonitorRoundsTab from "./MonitorRoundsTab";
import TeamsTab from "./TeamsTab";
import AuditTab from "./AuditTab";
import LeaderboardView from "@/app/components/LeaderboardView";

type Tab = "monitor" | "teams" | "leaderboard" | "audit";

export default function AdminDashboardClient({ username }: { username: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("monitor");
  const { status, version, lastEvent } = useAdminStream();

  async function logout() {
    await apiFetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-amber-400">Guess the Movie</p>
          <h1 className="text-2xl font-black text-white">Admin Control Center</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <ConnDot status={status} />
          <span>Signed in as {username}</span>
          <button onClick={logout} className="btn-secondary">
            Log Out
          </button>
        </div>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2">
        {([
          ["monitor", "🔴 Live Monitor & Rounds"],
          ["teams", "👥 Teams & Import"],
          ["leaderboard", "🏆 Leaderboard"],
          ["audit", "📜 Audit Log"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === key ? "bg-amber-400 text-slate-950" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "monitor" && <MonitorRoundsTab version={version} lastEvent={lastEvent} />}
      {tab === "teams" && <TeamsTab version={version} />}
      {tab === "leaderboard" && <LeaderboardView refreshKey={version} />}
      {tab === "audit" && <AuditTab version={version} />}
    </main>
  );
}

function ConnDot({ status }: { status: "connecting" | "connected" | "reconnecting" }) {
  const colors = { connected: "bg-emerald-500", connecting: "bg-amber-400", reconnecting: "bg-red-500" };
  const labels = { connected: "Live", connecting: "Connecting", reconnecting: "Reconnecting" };
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${colors[status]}`} />
      {labels[status]}
    </span>
  );
}
