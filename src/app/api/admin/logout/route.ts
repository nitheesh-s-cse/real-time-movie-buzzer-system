import { NextResponse } from "next/server";
import { adminLogout } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  await adminLogout();
  return NextResponse.json({ ok: true });
}
