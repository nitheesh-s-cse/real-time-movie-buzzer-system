import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rounds, roundIneligibleTeams, roundResults, scoreLedger, teams, events } from "@/db/schema";
import { createRoundSchema, roundActionSchema } from "@/lib/validation";
import { requireAdmin } from "@/lib/require-admin";
import { getOrCreateActiveEvent } from "@/lib/event";
import { logAudit } from "@/lib/audit";
import { publish } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const event = await getOrCreateActiveEvent();
  const list = await db
    .select()
    .from(rounds)
    .where(eq(rounds.eventId, event.id))
    .orderBy(desc(rounds.roundNumber));

  return NextResponse.json({ event, rounds: list });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = createRoundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A round title is required." }, { status: 400 });
  }

  const event = await getOrCreateActiveEvent();

  const [{ maxNumber }] = await db
    .select({ maxNumber: sql<number>`coalesce(max(${rounds.roundNumber}), 0)` })
    .from(rounds)
    .where(eq(rounds.eventId, event.id));

  const [created] = await db
    .insert(rounds)
    .values({
      eventId: event.id,
      roundNumber: Number(maxNumber) + 1,
      title: parsed.data.title,
      answer: parsed.data.answer ?? null,
      status: "draft",
    })
    .returning();

  await logAudit({
    actorType: "admin",
    adminId: auth.admin.adminId,
    action: "round_created",
    metadata: { roundId: created.id, roundNumber: created.roundNumber, title: created.title },
  });

  return NextResponse.json({ round: created });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = roundActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid round action." }, { status: 400 });
  }
  const { roundId, action } = parsed.data;
  const confirm = (body as { confirm?: boolean } | null)?.confirm === true;

  const [round] = await db.select().from(rounds).where(eq(rounds.id, roundId)).limit(1);
  if (!round) return NextResponse.json({ error: "Round not found." }, { status: 404 });

  if (action === "open") {
    if (round.status !== "draft" && round.status !== "closed" && round.status !== "cancelled") {
      return NextResponse.json({ error: `Cannot open a round in status '${round.status}'.` }, { status: 409 });
    }
    const [updated] = await db
      .update(rounds)
      .set({ status: "open", openedAt: new Date(), winningTeamId: null, acceptedAt: null, closedAt: null })
      .where(eq(rounds.id, roundId))
      .returning();
    await db.update(events).set({ currentRoundId: roundId }).where(eq(events.id, round.eventId));
    await logAudit({ actorType: "admin", adminId: auth.admin.adminId, action: "round_opened", metadata: { roundId } });
    void publish("team", "round_opened", { roundId, roundNumber: round.roundNumber, title: round.title });
    void publish("admin", "round_opened", { roundId });
    return NextResponse.json({ round: updated });
  }

  if (action === "reopen") {
    if (round.status !== "awaiting_answer") {
      return NextResponse.json({ error: "Only a round awaiting an answer can be reopened." }, { status: 409 });
    }
    const [updated] = await db
      .update(rounds)
      .set({ status: "open", winningTeamId: null, acceptedAt: null })
      .where(eq(rounds.id, roundId))
      .returning();
    await logAudit({ actorType: "admin", adminId: auth.admin.adminId, action: "round_reopened", metadata: { roundId } });
    void publish("team", "round_opened", { roundId, roundNumber: round.roundNumber, title: round.title });
    void publish("admin", "round_opened", { roundId });
    return NextResponse.json({ round: updated });
  }

  if (action === "close") {
    if (round.status === "closed" || round.status === "cancelled") {
      return NextResponse.json({ error: "Round is already closed." }, { status: 409 });
    }
    const [updated] = await db
      .update(rounds)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(rounds.id, roundId))
      .returning();
    await logAudit({ actorType: "admin", adminId: auth.admin.adminId, action: "round_closed", metadata: { roundId } });
    void publish("team", "round_closed", { roundId });
    void publish("admin", "round_closed", { roundId });
    return NextResponse.json({ round: updated });
  }

  if (action === "cancel") {
    const [updated] = await db
      .update(rounds)
      .set({ status: "cancelled", closedAt: new Date() })
      .where(eq(rounds.id, roundId))
      .returning();
    await logAudit({ actorType: "admin", adminId: auth.admin.adminId, action: "round_cancelled", metadata: { roundId } });
    void publish("team", "round_closed", { roundId });
    void publish("admin", "round_closed", { roundId });
    return NextResponse.json({ round: updated });
  }

  if (action === "reset") {
    if (!confirm) {
      return NextResponse.json({ error: "Reset requires explicit confirmation." }, { status: 400 });
    }
    const [existingResult] = await db.select().from(roundResults).where(eq(roundResults.roundId, roundId)).limit(1);
    if (existingResult) {
      return NextResponse.json(
        { error: "This round has already been scored. Use a score adjustment instead of resetting it." },
        { status: 409 },
      );
    }
    await db.delete(roundIneligibleTeams).where(eq(roundIneligibleTeams.roundId, roundId));
    const [updated] = await db
      .update(rounds)
      .set({ status: "draft", winningTeamId: null, acceptedAt: null, openedAt: null, closedAt: null })
      .where(eq(rounds.id, roundId))
      .returning();
    await logAudit({ actorType: "admin", adminId: auth.admin.adminId, action: "round_reset", metadata: { roundId } });
    void publish("team", "round_closed", { roundId });
    void publish("admin", "round_reset", { roundId });
    return NextResponse.json({ round: updated });
  }

  if (action === "correct" || action === "wrong") {
    if (round.status !== "claimed" || !round.winningTeamId) {
      return NextResponse.json({ error: "No accepted buzz is awaiting a decision for this round." }, { status: 409 });
    }
    const winningTeamId = round.winningTeamId;

    try {
      const outcome = await db.transaction(async (tx) => {
        // Unique (round_id, winning_team_id) index guarantees this team can't be
        // scored twice for the same round, even under duplicate admin clicks.
        await tx.insert(roundResults).values({
          roundId,
          winningTeamId,
          result: action,
          decidedByAdminId: auth.admin.adminId,
        });

        const pointsDelta = action === "correct" ? 5 : -5;
        await tx.insert(scoreLedger).values({
          teamId: winningTeamId,
          roundId,
          resultType: action,
          pointsDelta,
          adminId: auth.admin.adminId,
        });

        await tx
          .update(teams)
          .set({
            totalScore: sql`${teams.totalScore} + ${pointsDelta}`,
            correctCount: action === "correct" ? sql`${teams.correctCount} + 1` : teams.correctCount,
            wrongCount: action === "wrong" ? sql`${teams.wrongCount} + 1` : teams.wrongCount,
          })
          .where(eq(teams.id, winningTeamId));

        if (action === "wrong") {
          await tx
            .insert(roundIneligibleTeams)
            .values({ roundId, teamId: winningTeamId })
            .onConflictDoNothing();
          const [updated] = await tx
            .update(rounds)
            .set({ status: "awaiting_answer", winningTeamId: null, acceptedAt: null })
            .where(eq(rounds.id, roundId))
            .returning();
          return updated;
        }

        const [updated] = await tx
          .update(rounds)
          .set({ status: "closed", closedAt: new Date() })
          .where(eq(rounds.id, roundId))
          .returning();
        return updated;
      });

      await logAudit({
        actorType: "admin",
        adminId: auth.admin.adminId,
        action: action === "correct" ? "answer_marked_correct" : "answer_marked_wrong",
        metadata: { roundId, teamId: winningTeamId, pointsDelta: action === "correct" ? 5 : -5 },
      });

      void publish("team", "score_update", { teamId: winningTeamId, result: action });
      void publish("admin", "score_update", { teamId: winningTeamId, result: action, roundId });
      if (action === "wrong") {
        void publish("team", "round_awaiting_answer", { roundId });
        void publish("admin", "round_awaiting_answer", { roundId });
      } else {
        void publish("team", "round_closed", { roundId });
        void publish("admin", "round_closed", { roundId });
      }

      return NextResponse.json({ round: outcome });
    } catch {
      return NextResponse.json({ error: "This round/team has already been scored." }, { status: 409 });
    }
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}


