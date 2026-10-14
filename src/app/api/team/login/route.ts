import { NextRequest, NextResponse } from "next/server";
import { teamLoginSchema } from "@/lib/validation";
import { teamLogin, persistTeamSessionCookie } from "@/lib/team-auth";
import { ensureDeviceId } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`team-login:${ip}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = teamLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid team name or PIN format." }, { status: 400 });
  }

  const deviceId = parsed.data.deviceId ?? (await ensureDeviceId());

  const result = await teamLogin(parsed.data.teamName, parsed.data.pin, deviceId);

  if (!result.ok) {
    if (result.reason === "session_conflict") {
      return NextResponse.json(
        {
          error:
            "This team already has an active buzzer session on another device. Ask an organizer to reset the session from the admin dashboard.",
          code: "session_conflict",
        },
        { status: 409 },
      );
    }
    if (result.reason === "disabled") {
      return NextResponse.json(
        { error: "This team has been disabled by the organizer.", code: "disabled" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Invalid team name or PIN.", code: "invalid_credentials" },
      { status: 401 },
    );
  }

  await persistTeamSessionCookie(result.token);
  await logAudit({
    actorType: "system",
    action: "team_login",
    metadata: { teamId: result.teamId, teamName: result.teamName },
  });

  return NextResponse.json({ ok: true, teamName: result.teamName });
}
