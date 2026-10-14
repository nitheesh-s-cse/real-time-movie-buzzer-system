import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export async function logAudit(params: {
  actorType: "admin" | "system";
  adminId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditLogs).values({
    actorType: params.actorType,
    adminId: params.adminId ?? null,
    action: params.action,
    metadata: params.metadata ?? {},
  });
}
