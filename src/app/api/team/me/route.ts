import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { events, rounds, roundIneligibleTeams, teams } from "@/db/schema";
import { getCurrentTeam, touchTeamSession } from "@/lib/team-auth";
import { getOrCreateActiveEvent } from "@/lib/event";

export const dynamic = "force-dynamic";

export async function GET() {
  const team = await getCurrentTeam();
  if (!team) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  await touchTeamSession(team.sessionId);

  const event = await getOrCreateActiveEvent();
  let round = null;
  let ineligible = false;

  if (event.currentRoundId) {
    const [r] = await db.select().from(rounds).where(eq(rounds.id, event.currentRoundId)).limit(1);
    if (r) {
      const [ineligibleRow] = await db
        .select()
        .from(roundIneligibleTeams)
        .where(and(eq(roundIneligibleTeams.roundId, r.id), eq(roundIneligibleTeams.teamId, team.teamId)))
        .limit(1);
      ineligible = !!ineligibleRow;
      round = {
        id: r.id,
        roundNumber: r.roundNumber,
        title: r.title,
        status: r.status,
        winningTeamId: r.winningTeamId,
        isWinner: r.winningTeamId === team.teamId,
      };
    }
  }

  const [teamRow] = await db.select().from(teams).where(eq(teams.id, team.teamId)).limit(1);

  return NextResponse.json({
    authenticated: true,
    team: {
      id: team.teamId,
      name: team.teamName,
      isEnabled: team.isEnabled,
      totalScore: teamRow?.totalScore ?? 0,
    },
    event: { id: event.id, name: event.name, status: event.status },
    round,
    ineligible,
  });
}
