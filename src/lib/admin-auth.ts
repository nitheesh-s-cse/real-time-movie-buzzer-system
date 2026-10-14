import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, adminSessions } from "@/db/schema";
import { generateSessionToken, hashSecret, hashToken, verifySecret } from "@/lib/crypto";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_TTL_MS,
  clearSessionCookie,
  readCookie,
  setSessionCookie,
} from "@/lib/session";

export interface AuthedAdmin {
  sessionId: string;
  adminId: string;
  username: string;
}

export async function adminLogin(
  username: string,
  password: string,
): Promise<{ ok: true; token: string; adminId: string; username: string } | { ok: false }> {
  const normalized = username.trim().toLowerCase();
  const [admin] = await db.select().from(admins).where(eq(admins.usernameNormalized, normalized)).limit(1);
  if (!admin) return { ok: false };
  if (!verifySecret(password, admin.passwordHash)) return { ok: false };

  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS);

  await db.insert(adminSessions).values({ adminId: admin.id, tokenHash, expiresAt });

  return { ok: true, token, adminId: admin.id, username: admin.username };
}

export async function persistAdminSessionCookie(token: string) {
  await setSessionCookie(ADMIN_COOKIE, token, ADMIN_SESSION_TTL_MS);
}

export async function getCurrentAdmin(): Promise<AuthedAdmin | null> {
  const token = await readCookie(ADMIN_COOKIE);
  if (!token) return null;
  const tokenHash = hashToken(token);

  const [row] = await db
    .select({
      sessionId: adminSessions.id,
      expiresAt: adminSessions.expiresAt,
      revokedAt: adminSessions.revokedAt,
      adminId: admins.id,
      username: admins.username,
    })
    .from(adminSessions)
    .innerJoin(admins, eq(adminSessions.adminId, admins.id))
    .where(eq(adminSessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  return { sessionId: row.sessionId, adminId: row.adminId, username: row.username };
}

export async function adminLogout() {
  const token = await readCookie(ADMIN_COOKIE);
  if (token) {
    const tokenHash = hashToken(token);
    await db.update(adminSessions).set({ revokedAt: new Date() }).where(eq(adminSessions.tokenHash, tokenHash));
  }
  await clearSessionCookie(ADMIN_COOKIE);
}

export async function createAdmin(username: string, password: string) {
  const passwordHash = hashSecret(password);
  const [created] = await db
    .insert(admins)
    .values({ username, usernameNormalized: username.trim().toLowerCase(), passwordHash })
    .returning({ id: admins.id });
  return created;
}

export async function anyAdminExists(): Promise<boolean> {
  const rows = await db.select({ id: admins.id }).from(admins).limit(1);
  return rows.length > 0;
}
