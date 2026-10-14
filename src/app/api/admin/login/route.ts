import { NextRequest, NextResponse } from "next/server";
import { adminLoginSchema } from "@/lib/validation";
import { adminLogin, persistAdminSessionCookie } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`admin-login:${ip}`, 8, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many login attempts. Try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 400 });
  }

  const result = await adminLogin(parsed.data.username, parsed.data.password);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  await persistAdminSessionCookie(result.token);
  await logAudit({ actorType: "admin", adminId: result.adminId, action: "admin_login", metadata: {} });

  return NextResponse.json({ ok: true, username: result.username });
}
