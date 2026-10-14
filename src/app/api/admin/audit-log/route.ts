import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, admins } from "@/db/schema";
import { requireAdmin } from "@/lib/require-admin";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const rows = await db
    .select({
      id: auditLogs.id,
      actorType: auditLogs.actorType,
      action: auditLogs.action,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      adminUsername: admins.username,
    })
    .from(auditLogs)
    .leftJoin(admins, eq(auditLogs.adminId, admins.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return NextResponse.json({ logs: rows });
}
