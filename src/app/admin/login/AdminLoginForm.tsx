"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";

export default function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await apiFetch<{ ok: boolean }>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? "Login failed.");
      return;
    }
    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <div>
        <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-300">
          Username
        </label>
        <input
          id="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-white outline-none focus:border-amber-400"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-300">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg text-white outline-none focus:border-amber-400"
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
        {submitting ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
