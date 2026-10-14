import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminIndexPage() {
  const admin = await getCurrentAdmin();
  redirect(admin ? "/admin/dashboard" : "/admin/login");
}
