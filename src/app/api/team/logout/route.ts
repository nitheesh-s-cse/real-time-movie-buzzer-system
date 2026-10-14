import { NextResponse } from "next/server";
import { teamLogout } from "@/lib/team-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await teamLogout();
  return NextResponse.json({ ok: true });
}
