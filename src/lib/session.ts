import { cookies } from "next/headers";

export const TEAM_COOKIE = "gtm_team_session";
export const ADMIN_COOKIE = "gtm_admin_session";
export const DEVICE_COOKIE = "gtm_device_id";

export const TEAM_SESSION_TTL_MS = 14 * 60 * 60 * 1000; // 14 hours (covers a full event day)
export const ADMIN_SESSION_TTL_MS = 10 * 60 * 60 * 1000; // 10 hours

const isProd = process.env.NODE_ENV === "production";

export async function setSessionCookie(name: string, value: string, maxAgeMs: number) {
  const store = await cookies();
  store.set(name, value, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  });
}

export async function clearSessionCookie(name: string) {
  const store = await cookies();
  store.set(name, "", { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function readCookie(name: string): Promise<string | undefined> {
  const store = await cookies();
  return store.get(name)?.value;
}

/** Non-security device identifier persisted on the client to recognize "same device" reconnects. */
export async function ensureDeviceId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_COOKIE)?.value;
  if (existing) return existing;
  const id = crypto.randomUUID();
  store.set(DEVICE_COOKIE, id, {
    httpOnly: false,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
