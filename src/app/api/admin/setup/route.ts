import { NextRequest, NextResponse } from "next/server";
import { adminSetupSchema } from "@/lib/validation";
import { createAdmin } from "@/lib/admin-auth";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * One-time (or organizer-controlled) initial admin bootstrap endpoint.
 * Requires the server-only ADMIN_SETUP_KEY environment variable to be set
 * and matched. There is no public admin registration page — this is the
 * only way to create an administrator account, and it is meant to be used
 * once before the event, then the ADMIN_SETUP_KEY should be removed/rotated.
 */
export async function POST(req: NextRequest) {
  const setupKey = process.env.ADMIN_SETUP_KEY;
  if (!setupKey) {
    return NextResponse.json(
      { error: "Admin setup is disabled. Set ADMIN_SETUP_KEY on the server to enable it." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = adminSetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid setup request." }, { status: 400 });
  }

  if (parsed.data.setupKey !== setupKey) {
    return NextResponse.json({ error: "Invalid setup key." }, { status: 403 });
  }

  try {
    const created = await createAdmin(parsed.data.username, parsed.data.password);
    await logAudit({
      actorType: "system",
      action: "admin_created",
      metadata: { adminId: created.id, username: parsed.data.username },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "An admin with that username may already exist." }, { status: 409 });
  }
}
