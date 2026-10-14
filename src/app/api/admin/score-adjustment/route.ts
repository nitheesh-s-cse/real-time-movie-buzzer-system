import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { scoreLedger, teams } from "@/db/schema";
import { scoreAdjustmentSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/require-admin";
import { logAudit } from "@/lib/audit";
import { publish } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Auditable manual score correction. Used by the admin to fix an accidental
 * scoring decision without ever deleting or mutating prior ledger rows.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = scoreAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A team, point delta, and reason are required." }, { status: 400 });
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, parsed.data.teamId)).limit(1);
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  await db.transaction(async (tx) => {
    await tx.insert(scoreLedger).values({
      teamId: parsed.data.teamId,
      resultType: "adjustment",
      pointsDelta: parsed.data.pointsDelta,
      adminId: auth.admin.adminId,
      reason: parsed.data.reason,
    });
    await tx
      .update(teams)
      .set({ totalScore: sql`${teams.totalScore} + ${parsed.data.pointsDelta}` })
      .where(eq(teams.id, parsed.data.teamId));
  });

  await logAudit({
    actorType: "admin",
    adminId: auth.admin.adminId,
    action: "score_adjustment",
    metadata: { teamId: parsed.data.teamId, pointsDelta: parsed.data.pointsDelta, reason: parsed.data.reason },
  });

  void publish("admin", "score_update", { teamId: parsed.data.teamId, result: "adjustment" });
  void publish("team", "score_update", { teamId: parsed.data.teamId, result: "adjustment" });

  return NextResponse.json({ ok: true });
}
