"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type Row = {
  id: string;
  name: string;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  buzzCount: number;
  isEnabled: boolean;
  rank: number;
};

export default function LeaderboardView({ refreshKey, compact }: { refreshKey?: number; compact?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<{ leaderboard: Row[] }>("/api/leaderboard");
    if (res.ok && res.data) {
      setRows(res.data.leaderboard);
      setUpdatedAt(new Date());
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className={compact ? "" : "rounded-2xl border border-slate-800 bg-slate-900 p-5"}>
      {!compact && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs uppercase tracking-widest text-slate-500">Live Leaderboard</p>
          {updatedAt && <p className="text-xs text-slate-600">Updated {updatedAt.toLocaleTimeString()}</p>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="py-2">Rank</th>
              <th>Team</th>
              <th>Score</th>
              <th>Correct</th>
              <th>Wrong</th>
              <th>Buzzes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-slate-800 ${r.rank <= 3 ? "text-amber-300" : "text-slate-200"}`}>
                <td className="py-2 font-black">#{r.rank}</td>
                <td className="font-semibold">{r.name}</td>
                <td className="font-bold">{r.totalScore}</td>
                <td>{r.correctCount}</td>
                <td>{r.wrongCount}</td>
                <td>{r.buzzCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
