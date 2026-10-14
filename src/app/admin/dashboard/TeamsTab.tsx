"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type Team = {
  id: string;
  name: string;
  leaderName: string | null;
  members: string | null;
  isEnabled: boolean;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  buzzCount: number;
  hasActiveSession: boolean;
  sessionLastSeenAt: string | null;
};

type ImportRow = {
  row: number;
  teamName: string;
  status: "imported" | "duplicate" | "invalid" | "failed";
  message?: string;
  pin?: string;
};

export default function TeamsTab({ version }: { version: number }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [importReport, setImportReport] = useState<ImportRow[] | null>(null);
  const [importSummary, setImportSummary] = useState<Record<string, number> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<{ teams: Team[] }>(`/api/admin/teams${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    if (res.ok && res.data) setTeams(res.data.teams);
  }, [q]);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [load]);

  async function patch(teamId: string, action: "enable" | "disable" | "reset_session") {
    setBusy(true);
    await apiFetch("/api/admin/teams", { method: "PATCH", body: JSON.stringify({ teamId, action }) });
    setBusy(false);
    await load();
  }

  async function adjustScore(team: Team) {
    const deltaStr = window.prompt(`Adjust score for "${team.name}" by how many points? (e.g. 5 or -5)`);
    if (deltaStr === null) return;
    const delta = Number(deltaStr);
    if (!Number.isInteger(delta) || delta === 0) {
      window.alert("Enter a non-zero whole number.");
      return;
    }
    const reason = window.prompt("Reason for this adjustment (required, for the audit log):");
    if (!reason) return;
    setBusy(true);
    const res = await apiFetch("/api/admin/score-adjustment", {
      method: "POST",
      body: JSON.stringify({ teamId: team.id, pointsDelta: delta, reason }),
    });
    setBusy(false);
    if (!res.ok) window.alert(res.error ?? "Adjustment failed.");
    await load();
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setImportError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/admin/teams/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? "Import failed.");
      } else {
        setImportReport(data.report);
        setImportSummary(data.summary);
      }
    } catch {
      setImportError("Network error during import.");
    }
    setBusy(false);
    await load();
  }

  function downloadCredentialsCsv() {
    if (!importReport) return;
    const imported = importReport.filter((r) => r.status === "imported");
    const header = "Team Name,PIN\n";
    const rows = imported.map((r) => `"${r.teamName.replace(/"/g, '""')}",${r.pin}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-credentials-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <p className="mb-3 text-xs uppercase tracking-widest text-slate-500">Import Approved Teams (CSV)</p>
        <p className="mb-3 text-sm text-slate-400">
          Export your Google Form responses to CSV, then upload it here. Expected columns: a team
          name column plus optional leader / members / contact columns. Duplicate team names are
          rejected automatically. Generated PINs are shown once below — download them immediately.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="text-sm text-slate-300" />
          <button disabled={busy} onClick={handleImport} className="btn-primary">
            Import CSV
          </button>
        </div>
        {importError && <p className="mt-3 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">{importError}</p>}
        {importSummary && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge label="Imported" value={importSummary.imported} color="bg-emerald-600" />
              <Badge label="Duplicate" value={importSummary.duplicate} color="bg-amber-500" />
              <Badge label="Invalid" value={importSummary.invalid} color="bg-red-700" />
              <Badge label="Failed" value={importSummary.failed} color="bg-slate-600" />
            </div>
            <button onClick={downloadCredentialsCsv} className="btn-secondary">
              ⬇ Download Generated Credentials (shown once)
            </button>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 text-slate-500">
                  <tr>
                    <th className="px-2 py-1">Row</th>
                    <th className="px-2 py-1">Team</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1">PIN</th>
                    <th className="px-2 py-1">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {importReport?.map((r) => (
                    <tr key={r.row} className="border-t border-slate-800">
                      <td className="px-2 py-1">{r.row}</td>
                      <td className="px-2 py-1">{r.teamName}</td>
                      <td className="px-2 py-1 capitalize">{r.status}</td>
                      <td className="px-2 py-1 font-mono">{r.pin ?? "—"}</td>
                      <td className="px-2 py-1 text-slate-500">{r.message ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-amber-400">
              ⚠ These PINs will not be shown again. Export/record them now and distribute securely to
              each team&apos;s single registered device.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-slate-500">Registered Teams ({teams.length})</p>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search team name…"
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white outline-none focus:border-amber-400"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">Team</th>
                <th>Score</th>
                <th>✓/✗</th>
                <th>Buzzes</th>
                <th>Session</th>
                <th>Enabled</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-t border-slate-800">
                  <td className="py-2 font-semibold text-white">{t.name}</td>
                  <td>{t.totalScore}</td>
                  <td>
                    {t.correctCount}/{t.wrongCount}
                  </td>
                  <td>{t.buzzCount}</td>
                  <td>
                    {t.hasActiveSession ? (
                      <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">Active</span>
                    ) : (
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">None</span>
                    )}
                  </td>
                  <td>
                    {t.isEnabled ? (
                      <span className="text-emerald-400">Enabled</span>
                    ) : (
                      <span className="text-red-400">Disabled</span>
                    )}
                  </td>
                  <td className="space-x-1">
                    <button disabled={busy} className="btn-xs" onClick={() => patch(t.id, t.isEnabled ? "disable" : "enable")}>
                      {t.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button disabled={busy} className="btn-xs !bg-red-700" onClick={() => patch(t.id, "reset_session")}>
                      Reset Session
                    </button>
                    <button disabled={busy} className="btn-xs !bg-indigo-700" onClick={() => adjustScore(t)}>
                      Adjust Score
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Badge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${color}`}>
      {label}: {value}
    </span>
  );
}
