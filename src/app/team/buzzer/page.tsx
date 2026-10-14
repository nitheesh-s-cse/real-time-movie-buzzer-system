import { redirect } from "next/navigation";
import { getCurrentTeam } from "@/lib/team-auth";
import BuzzerClient from "./BuzzerClient";

export const dynamic = "force-dynamic";

export default async function TeamBuzzerPage() {
  const team = await getCurrentTeam();
  if (!team) redirect("/team/login");

  return <BuzzerClient initialTeamName={team.teamName} />;
}
