export async function apiFetch<T>(input: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const res = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: (data as { error?: string } | null)?.error ?? "Request failed." };
    }
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null, error: "Network error. Check your connection." };
  }
}
