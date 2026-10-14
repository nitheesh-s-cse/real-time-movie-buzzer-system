"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

function getOrCreateDeviceId(): string {
  const key = "gtm_device_id_client";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

export default function TeamLoginForm() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const deviceId = getOrCreateDeviceId();

    const res = await apiFetch<{ ok: boolean; teamName: string }>("/api/team/login", {
      method: "POST",
      body: JSON.stringify({ teamName, pin, deviceId }),
    });

    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "Login failed.");
      return;
    }
    router.push("/team/buzzer");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <div>
        <label htmlFor="teamName" className="mb-1 block text-sm font-medium text-slate-300">
          Team Name
        </label>
        <input
          id="teamName"
          autoComplete="username"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-white outline-none focus:border-amber-400"
          placeholder="e.g. Reel Legends"
        />
      </div>
      <div>
        <label htmlFor="pin" className="mb-1 block text-sm font-medium text-slate-300">
          Access PIN
        </label>
        <input
          id="pin"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg tracking-widest text-white outline-none focus:border-amber-400"
          placeholder="••••••"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-amber-400 py-3 text-lg font-bold text-slate-950 transition active:scale-95 disabled:opacity-60"
      >
        {submitting ? "Signing in…" : "Enter the Arena"}
      </button>

      <p className="text-center text-xs text-slate-500">
        Logging in on a new device while another device is active will be blocked
        for fairness. Ask an organizer to reset your session if needed.
      </p>
    </form>
  );
}
