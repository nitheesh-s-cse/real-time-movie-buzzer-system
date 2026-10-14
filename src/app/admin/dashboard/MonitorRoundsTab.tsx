"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { StreamEvent } from "./useAdminStream";

type EventRow = { id: string; name: string; status: "draft" | "live" | "paused" | "ended" };
type RoundRow = {
  id: string;
  roundNumber: number;
  title: string;
  answer: string | null;
  status: "draft" | "open" | "claimed" | "awaiting_answer" | "closed" | "cancelled";
  winningTeamId: string | null;
  acceptedAt: string | null;
};

type TeamLite = { id: string; name: string };

export default function MonitorRoundsTab({ version, lastEvent }: { version: number; lastEvent: StreamEvent | null }) {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [teams, setTeams] = useState<TeamLite[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await apiFetch<{ event: EventRow; rounds: RoundRow[] }>("/api/admin/rounds");
    if (res.ok && res.data) {
      setEvent(res.data.event);
      setRounds(res.data.rounds);
    }
    const teamRes = await apiFetch<{ teams: TeamLite[] }>("/api/admin/teams");
    if (teamRes.ok && teamRes.data) setTeams(teamRes.data.teams);
  }, []);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === "buzz_accepted") {
      const p = lastEvent.payload as { teamName: string; acceptedAt: string };
      setActivity((a) => [`🔔 ${p.teamName} buzzed in at ${new Date(p.acceptedAt).toLocaleTimeString()}`, ...a].slice(0, 20));
    }
    if (lastEvent.type === "score_update") {
      const p = lastEvent.payload as { teamId: string; result: string };
      const name = teams.find((t) => t.id === p.teamId)?.name ?? p.teamId;
      setActivity((a) => [`📊 ${name}: ${p.result}`, ...a].slice(0, 20));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  function teamName(id: string | null) {
    if (!id) return "—";
    return teams.find((t) => t.id === id)?.name ?? id;
  }

  async function eventAction(action: "start" | "pause" | "resume" | "end") {
    setBusy(true);
    const res = await apiFetch("/api/admin/events", { method: "PATCH", body: JSON.stringify({ action }) });
    setBusy(false);
    if (!res.ok) setMessage(res.error ?? "Failed");
    await load();
  }

  async function createRound() {
    if (!newTitle.trim()) return;
    setBusy(true);
    const res = await apiFetch("/api/admin/rounds", {
      method: "POST",
      body: JSON.stringify({ title: newTitle, answer: newAnswer || undefined }),
    });
    setBusy(false);
    if (!res.ok) setMessage(res.error ?? "Failed to create round.");
    else {
      setNewTitle("");
      setNewAnswer("");
    }
    await load();
  }

  async function roundAction(roundId: string, action: string, confirm?: boolean) {
    setBusy(true);
    setMessage(null);
    const res = await apiFetch<{ error?: string }>("/api/admin/rounds", {
      method: "PATCH",
      body: JSON.stringify({ roundId, action, confirm }),
    });
    setBusy(false);
    if (!res.ok) setMessage(res.error ?? "Action failed.");
    await load();
  }

  const openOrActiveRound = rounds.find((r) => ["open", "claimed", "awaiting_answer"].includes(r.status));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">Event Status</p>
            <p className="text-2xl font-bold text-white">{event?.name}</p>
            <StatusPill status={event?.status ?? "draft"} />
          </div>
          <div className="flex gap-2">
            {event?.status !== "live" && (
              <button disabled={busy} onClick={() => eventAction(event?.status === "paused" ? "resume" : "start")} className="btn-primary">
                {event?.status === "paused" ? "Resume Event" : "Start Event"}
              </button>
            )}
            {event?.status === "live" && (
              <button disabled={busy} onClick={() => eventAction("pause")} className="btn-secondary">
                Pause Event
              </button>
            )}
            {event?.status !== "ended" && (
              <button disabled={busy} onClick={() => eventAction("end")} className="btn-danger">
                End Event
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <p className="mb-3 text-xs uppercase tracking-widest text-slate-500">Live Buzzer Monitor</p>
        {openOrActiveRound ? (
          <div className="space-y-2">
            <p className="text-lg font-bold text-white">
              Round {openOrActiveRound.roundNumber}: {openOrActiveRound.title}
            </p>
            <StatusPill status={openOrActiveRound.status} />
            {openOrActiveRound.status !== "open" && openOrActiveRound.winningTeamId && (
              <div className="rounded-xl bg-emerald-950 p-4">
                <p className="text-sm text-emerald-300">Winning team</p>
                <p className="text-2xl font-black text-emerald-200">{teamName(openOrActiveRound.winningTeamId)}</p>
                {openOrActiveRound.acceptedAt && (
                  <p className="text-xs text-emerald-400">
                    Accepted at {new Date(openOrActiveRound.acceptedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            )}
            <RoundControls round={openOrActiveRound} onAction={roundAction} busy={busy} />
          </div>
        ) : (
          <p className="text-slate-400">No round is currently open or claimed.</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <p className="mb-3 text-xs uppercase tracking-widest text-slate-500">Recent Buzz Activity</p>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-slate-300">
          {activity.length === 0 && <li className="text-slate-600">No activity yet.</li>}
          {activity.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <p className="mb-3 text-xs uppercase tracking-widest text-slate-500">Create / Advance Round</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Question / clue label (e.g. Round 3 — Bollywood classics)"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-amber-400"
          />
          <input
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            placeholder="Correct answer (hidden from teams, optional)"
            className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-amber-400"
          />
          <button disabled={busy || !newTitle.trim()} onClick={createRound} className="btn-primary whitespace-nowrap">
            + New Round
          </button>
        </div>
      </section>

      {message && <p className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">{message}</p>}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <p className="mb-3 text-xs uppercase tracking-widest text-slate-500">Round History</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2">#</th>
                <th>Title</th>
                <th>Status</th>
                <th>Winner</th>
                <th>Accepted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="py-2">{r.roundNumber}</td>
                  <td>{r.title}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>{teamName(r.winningTeamId)}</td>
                  <td>{r.acceptedAt ? new Date(r.acceptedAt).toLocaleTimeString() : "—"}</td>
                  <td>
                    <RoundControls round={r} onAction={roundAction} busy={busy} compact />
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

function RoundControls({
  round,
  onAction,
  busy,
  compact,
}: {
  round: RoundRow;
  onAction: (roundId: string, action: string, confirm?: boolean) => void;
  busy: boolean;
  compact?: boolean;
}) {
  const btn = compact ? "btn-xs" : "btn-secondary";
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {(round.status === "draft" || round.status === "closed" || round.status === "cancelled") && (
        <button disabled={busy} className={btn} onClick={() => onAction(round.id, "open")}>
          Open Buzzer
        </button>
      )}
      {round.status === "claimed" && (
        <>
          <button disabled={busy} className={`${btn} !bg-emerald-600`} onClick={() => onAction(round.id, "correct")}>
            ✓ Correct (+5)
          </button>
          <button disabled={busy} className={`${btn} !bg-red-700`} onClick={() => onAction(round.id, "wrong")}>
            ✗ Wrong (-5)
          </button>
        </>
      )}
      {round.status === "awaiting_answer" && (
        <button disabled={busy} className={btn} onClick={() => onAction(round.id, "reopen")}>
          Reopen for Others
        </button>
      )}
      {["open", "claimed", "awaiting_answer"].includes(round.status) && (
        <button disabled={busy} className={btn} onClick={() => onAction(round.id, "close")}>
          Close Round
        </button>
      )}
      {round.status !== "closed" && round.status !== "cancelled" && (
        <button disabled={busy} className={btn} onClick={() => onAction(round.id, "cancel")}>
          Cancel
        </button>
      )}
      <button
        disabled={busy}
        className={`${btn} !bg-slate-700`}
        onClick={() => {
          if (window.confirm(`Reset round ${round.roundNumber}? This clears its buzz state.`)) {
            onAction(round.id, "reset", true);
          }
        }}
      >
        Reset
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-slate-700 text-slate-200",
    open: "bg-emerald-600 text-white",
    claimed: "bg-amber-500 text-slate-950",
    awaiting_answer: "bg-orange-600 text-white",
    closed: "bg-slate-600 text-slate-100",
    cancelled: "bg-red-900 text-red-200",
    live: "bg-emerald-600 text-white",
    paused: "bg-amber-500 text-slate-950",
    ended: "bg-slate-700 text-slate-200",
  };
  return (
    <span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase ${colors[status] ?? "bg-slate-700"}`}>
      {status.replace("_", " ")}
    </span>
  );
}
