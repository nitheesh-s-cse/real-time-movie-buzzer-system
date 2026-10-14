import { NextRequest, NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { rounds, buzzAttempts, teams } from "@/db/schema";
import { buzzSchema } from "@/lib/validation";
import { getCurrentTeam } from "@/lib/team-auth";
import { getOrCreateActiveEvent } from "@/lib/event";
import { rateLimit } from "@/lib/rate-limit";
import { publish } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Ultra-fast, server-authoritative buzzer endpoint.
 *
 * Winner selection is a single atomic conditional UPDATE:
 *   UPDATE rounds SET status='claimed', winning_team_id=$team, accepted_at=now()
 *   WHERE id=$round AND status='open'
 *     AND NOT EXISTS (ineligible-for-this-round check)
 *
 * PostgreSQL serializes concurrent UPDATEs to the same row: the first
 * transaction to commit flips status away from 'open', so every other
 * concurrent request's WHERE clause evaluates false and updates 0 rows.
 * This guarantees exactly one winner under contention without an
 * application-level lock, in-memory boolean, or client timestamp.
 */
export async function POST(req: NextRequest) {
  const team = await getCurrentTeam();
  if (!team) {
    return NextResponse.json({ status: "rejected", reason: "not_authenticated" }, { status: 401 });
  }

  const rl = rateLimit(`buzz:${team.teamId}`, 20, 10_000);
  if (!rl.allowed) {
    return NextResponse.json({ status: "rejected", reason: "rate_limited" }, { status: 429 });
  }

  if (!team.isEnabled) {
    return NextResponse.json({ status: "rejected", reason: "team_disabled" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = buzzSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "rejected", reason: "invalid_request" }, { status: 400 });
  }
  const { idempotencyKey } = parsed.data;

  const event = await getOrCreateActiveEvent();
  const roundId = event.currentRoundId;
  if (!roundId) {
    return NextResponse.json({ status: "rejected", reason: "no_active_round" }, { status: 409 });
  }
  if (event.status !== "live") {
    return NextResponse.json({ status: "rejected", reason: "event_not_live" }, { status: 409 });
  }

  // Idempotent replay: if this exact buzz attempt was already recorded, return the stored outcome.
  const [existingAttempt] = await db
    .select()
    .from(buzzAttempts)
    .where(
      sql`${buzzAttempts.roundId} = ${roundId} AND ${buzzAttempts.teamId} = ${team.teamId} AND ${buzzAttempts.idempotencyKey} = ${idempotencyKey}`,
    )
    .limit(1);

  if (existingAttempt) {
    return NextResponse.json({
      status: existingAttempt.status,
      reason: existingAttempt.reason,
      serverReceivedAt: existingAttempt.serverReceivedAt,
      replay: true,
    });
  }

  // The single atomic claim statement.
  const claimResult = await db.execute(sql`
    UPDATE ${rounds}
    SET status = 'claimed', winning_team_id = ${team.teamId}, accepted_at = now()
    WHERE id = ${roundId}
      AND status = 'open'
      AND NOT EXISTS (
        SELECT 1 FROM round_ineligible_teams
        WHERE round_ineligible_teams.round_id = ${roundId}
          AND round_ineligible_teams.team_id = ${team.teamId}
      )
    RETURNING id, accepted_at
  `);

  const won = claimResult.rows.length > 0;
  const serverReceivedAt = won ? (claimResult.rows[0] as { accepted_at: string }).accepted_at : new Date().toISOString();

  let reason: string | null = null;
  if (!won) {
    const [current] = await db.select().from(rounds).where(eq(rounds.id, roundId)).limit(1);
    if (!current) reason = "round_not_found";
    else if (current.status !== "open") {
      reason = current.winningTeamId === team.teamId ? "already_won_this_round" : "round_already_claimed";
    } else {
      reason = "ineligible_for_round";
    }
  }

  // Record the attempt (append-only). ON CONFLICT guards against duplicate submissions racing in.
  await db
    .insert(buzzAttempts)
    .values({
      roundId,
      teamId: team.teamId,
      idempotencyKey,
      status: won ? "accepted" : "rejected",
      reason,
    })
    .onConflictDoNothing();

  if (won) {
    await db
      .update(teams)
      .set({ buzzCount: sql`${teams.buzzCount} + 1` })
      .where(eq(teams.id, team.teamId));

    void publish("admin", "buzz_accepted", {
      roundId,
      teamId: team.teamId,
      teamName: team.teamName,
      acceptedAt: serverReceivedAt,
    });
    void publish("team", "round_claimed", {
      roundId,
      winningTeamName: team.teamName,
    });
  }

  return NextResponse.json({
    status: won ? "accepted" : "rejected",
    reason,
    serverReceivedAt,
  });
}
