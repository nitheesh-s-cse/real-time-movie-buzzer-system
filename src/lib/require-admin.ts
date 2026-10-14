import { NextResponse } from "next/server";
import { getCurrentAdmin, type AuthedAdmin } from "@/lib/admin-auth";

export async function requireAdmin(): Promise<{ admin: AuthedAdmin } | { error: NextResponse }> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return { error: NextResponse.json({ error: "Unauthorized. Admin login required." }, { status: 401 }) };
  }
  return { admin };
}
