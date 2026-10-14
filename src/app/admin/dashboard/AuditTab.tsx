"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type LogRow = {
  id: string;
  actorType: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  adminUsername: string | null;
};

export default function AuditTab({ version }: { version: number }) {
  const [logs, setLogs] = useState<LogRow[]>([]);

  const load = useCallback(async () => {
    const res = await apiFetch<{ logs: LogRow[] }>("/api/admin/audit-log");
    if (res.ok && res.data) setLogs(res.data.logs);
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="mb-3 text-xs uppercase tracking-widest text-slate-500">Audit Log (latest 200)</p>
      <div className="max-h-[70vh] overflow-y-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-900 text-slate-500">
            <tr>
              <th className="py-2">Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-slate-800 align-top">
                <td className="whitespace-nowrap py-2 text-slate-400">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="whitespace-nowrap">{l.adminUsername ?? l.actorType}</td>
                <td className="whitespace-nowrap font-semibold text-slate-200">{l.action}</td>
                <td className="text-slate-500">{l.metadata ? JSON.stringify(l.metadata) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
