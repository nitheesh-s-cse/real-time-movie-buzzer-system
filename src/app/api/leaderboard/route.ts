import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { teams } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Public, read-only leaderboard. Only non-sensitive aggregate fields are
 * exposed (no PIN hashes, contact details, or session tokens).
 */
export async function GET() {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      totalScore: teams.totalScore,
      correctCount: teams.correctCount,
      wrongCount: teams.wrongCount,
      buzzCount: teams.buzzCount,
      isEnabled: teams.isEnabled,
    })
    .from(teams)
    .orderBy(desc(teams.totalScore));

  const ranked = rows.map((row, idx) => ({ ...row, rank: idx + 1 }));

  return NextResponse.json({ leaderboard: ranked });
}
