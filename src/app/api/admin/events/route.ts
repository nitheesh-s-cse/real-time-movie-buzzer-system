import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { events } from "@/db/schema";
import { requireAdmin } from "@/lib/require-admin";
import { getOrCreateActiveEvent } from "@/lib/event";
import { logAudit } from "@/lib/audit";
import { publish } from "@/lib/realtime";
import { z } from "zod";

export const dynamic = "force-dynamic";

const eventActionSchema = z.object({
  action: z.enum(["start", "pause", "resume", "end"]),
  name: z.string().trim().min(1).max(200).optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const event = await getOrCreateActiveEvent();
  return NextResponse.json({ event });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = eventActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid event action." }, { status: 400 });

  const event = await getOrCreateActiveEvent();
  const nextStatus =
    parsed.data.action === "start" || parsed.data.action === "resume"
      ? "live"
      : parsed.data.action === "pause"
        ? "paused"
        : "ended";

  const [updated] = await db
    .update(events)
    .set({ status: nextStatus, ...(parsed.data.name ? { name: parsed.data.name } : {}) })
    .where(eq(events.id, event.id))
    .returning();

  await logAudit({
    actorType: "admin",
    adminId: auth.admin.adminId,
    action: `event_${parsed.data.action}`,
    metadata: { eventId: event.id },
  });

  void publish("team", "event_status", { status: updated.status });
  void publish("admin", "event_status", { status: updated.status });

  return NextResponse.json({ event: updated });
}
