import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/admin-auth";
import AdminDashboardClient from "./AdminDashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  return <AdminDashboardClient username={admin.username} />;
}
