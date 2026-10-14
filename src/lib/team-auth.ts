import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { teams, teamSessions } from "@/db/schema";
import { generateSessionToken, hashToken, verifySecret } from "@/lib/crypto";
import { normalizeTeamName } from "@/lib/validation";
import {
  TEAM_COOKIE,
  TEAM_SESSION_TTL_MS,
  clearSessionCookie,
  readCookie,
  setSessionCookie,
} from "@/lib/session";

export type LoginOutcome =
  | { ok: true; teamId: string; teamName: string; token: string }
  | { ok: false; reason: "invalid_credentials" | "disabled" | "session_conflict" };

/**
 * Attempts a team login. Enforces "one active device session per team" with
 * a DB transaction plus a backing unique partial index as a last line of
 * defense against races. If an active session already exists on a
 * *different* device, the login is rejected with `session_conflict` unless
 * the organizer resets the session from the admin dashboard.
 */
export async function teamLogin(
  teamNameRaw: string,
  pin: string,
  deviceId: string | undefined,
): Promise<LoginOutcome> {
  const nameNormalized = normalizeTeamName(teamNameRaw);

  const [team] = await db.select().from(teams).where(eq(teams.nameNormalized, nameNormalized)).limit(1);
  if (!team) return { ok: false, reason: "invalid_credentials" };
  if (!verifySecret(pin, team.pinHash)) return { ok: false, reason: "invalid_credentials" };
  if (!team.isEnabled) return { ok: false, reason: "disabled" };

  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TEAM_SESSION_TTL_MS);

  const outcome = await db.transaction(async (tx) => {
    const [activeSession] = await tx
      .select()
      .from(teamSessions)
      .where(and(eq(teamSessions.teamId, team.id), eq(teamSessions.status, "active")))
      .for("update")
      .limit(1);

    if (activeSession) {
      const sameDevice = !!deviceId && activeSession.deviceLabel === deviceId;
      if (!sameDevice) {
        return { ok: false as const, reason: "session_conflict" as const };
      }
      await tx
        .update(teamSessions)
        .set({ status: "superseded", revokedAt: new Date() })
        .where(eq(teamSessions.id, activeSession.id));
    }

    await tx.insert(teamSessions).values({
      teamId: team.id,
      tokenHash,
      status: "active",
      deviceLabel: deviceId ?? null,
      expiresAt,
    });

    return { ok: true as const };
  });

  if (!outcome.ok) return outcome;

  return { ok: true, teamId: team.id, teamName: team.name, token };
}

export async function persistTeamSessionCookie(token: string) {
  await setSessionCookie(TEAM_COOKIE, token, TEAM_SESSION_TTL_MS);
}

export interface AuthedTeam {
  sessionId: string;
  teamId: string;
  teamName: string;
  isEnabled: boolean;
}

/** Resolves + validates the current team session from the request cookies. Server-authoritative. */
export async function getCurrentTeam(): Promise<AuthedTeam | null> {
  const token = await readCookie(TEAM_COOKIE);
  if (!token) return null;
  const tokenHash = hashToken(token);

  const [row] = await db
    .select({
      sessionId: teamSessions.id,
      status: teamSessions.status,
      expiresAt: teamSessions.expiresAt,
      teamId: teams.id,
      teamName: teams.name,
      isEnabled: teams.isEnabled,
    })
    .from(teamSessions)
    .innerJoin(teams, eq(teamSessions.teamId, teams.id))
    .where(eq(teamSessions.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.status !== "active") return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  return {
    sessionId: row.sessionId,
    teamId: row.teamId,
    teamName: row.teamName,
    isEnabled: row.isEnabled,
  };
}

export async function touchTeamSession(sessionId: string) {
  await db.update(teamSessions).set({ lastSeenAt: new Date() }).where(eq(teamSessions.id, sessionId));
}

export async function teamLogout() {
  const token = await readCookie(TEAM_COOKIE);
  if (token) {
    const tokenHash = hashToken(token);
    await db
      .update(teamSessions)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(teamSessions.tokenHash, tokenHash));
  }
  await clearSessionCookie(TEAM_COOKIE);
}
