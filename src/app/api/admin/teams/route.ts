import { NextRequest, NextResponse } from "next/server";
import { desc, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { teams, teamSessions } from "@/db/schema";
import { requireAdmin } from "@/lib/require-admin";
import { teamPatchSchema } from "@/lib/validation";
import { logAudit } from "@/lib/audit";
import { publish } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const q = req.nextUrl.searchParams.get("q")?.trim();

  const rows = await db
    .select()
    .from(teams)
    .where(q ? ilike(teams.name, `%${q}%`) : undefined)
    .orderBy(desc(teams.totalScore));

  const teamIds = rows.map((r) => r.id);
  const sessions = teamIds.length
    ? await db.select().from(teamSessions).where(eq(teamSessions.status, "active"))
    : [];
  const activeByTeam = new Map(sessions.filter((s) => teamIds.includes(s.teamId)).map((s) => [s.teamId, s]));

  return NextResponse.json({
    teams: rows.map((t) => ({
      id: t.id,
      name: t.name,
      leaderName: t.leaderName,
      members: t.members,
      isEnabled: t.isEnabled,
      totalScore: t.totalScore,
      correctCount: t.correctCount,
      wrongCount: t.wrongCount,
      buzzCount: t.buzzCount,
      hasActiveSession: activeByTeam.has(t.id),
      sessionLastSeenAt: activeByTeam.get(t.id)?.lastSeenAt ?? null,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = teamPatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const { teamId, action } = parsed.data;
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  if (action === "enable" || action === "disable") {
    await db.update(teams).set({ isEnabled: action === "enable" }).where(eq(teams.id, teamId));
  }

  if (action === "reset_session") {
    await db
      .update(teamSessions)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(eq(teamSessions.teamId, teamId));
  }

  await logAudit({
    actorType: "admin",
    adminId: auth.admin.adminId,
    action: `team_${action}`,
    metadata: { teamId, teamName: team.name },
  });

  if (action === "reset_session") {
    void publish("team", "session_reset", { teamId });
  }
  void publish("admin", "team_updated", { teamId });

  return NextResponse.json({ ok: true });
}
