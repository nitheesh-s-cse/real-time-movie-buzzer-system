import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { requireAdmin } from "@/lib/require-admin";
import { csvImportRowSchema, normalizeTeamName } from "@/lib/validation";
import { generatePin, hashSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

type ImportRowReport = {
  row: number;
  teamName: string;
  status: "imported" | "duplicate" | "invalid" | "failed";
  message?: string;
  pin?: string;
  teamId?: string;
};

function pickHeader(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  for (const candidate of candidates) {
    const idx = lower.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * Admin-only CSV import of organizer-approved teams exported from a Google
 * Form response spreadsheet. Expected (flexible) columns: a team-name
 * column, plus optional leader name / members / contact columns. Every row
 * is validated and normalized; duplicate team names (case/whitespace
 * insensitive) are rejected; every approved team gets a securely random
 * PIN that is hashed before storage and returned in this response ONLY —
 * it is never stored or retrievable in plaintext again.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "A CSV file is required (field name 'file')." }, { status: 400 });
  }

  const text = await file.text();
  let records: Record<string, string>[];
  try {
    records = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } catch {
    return NextResponse.json({ error: "Could not parse the CSV file. Check its formatting." }, { status: 400 });
  }

  if (records.length === 0) {
    return NextResponse.json({ error: "The CSV file has no data rows." }, { status: 400 });
  }

  const headers = Object.keys(records[0]);
  const teamNameHeader = pickHeader(headers, ["team name", "teamname", "team"]);
  const leaderHeader = pickHeader(headers, ["leader", "captain"]);
  const membersHeader = pickHeader(headers, ["members", "member names", "team members"]);
  const contactHeader = pickHeader(headers, ["contact", "phone", "email"]);

  if (!teamNameHeader) {
    return NextResponse.json(
      { error: "Could not find a team name column in the CSV header." },
      { status: 400 },
    );
  }

  const seenInFile = new Set<string>();
  const report: ImportRowReport[] = [];

  const existingTeams = await db.select({ nameNormalized: teams.nameNormalized }).from(teams);
  const existingNames = new Set(existingTeams.map((t) => t.nameNormalized));

  for (let i = 0; i < records.length; i++) {
    const rowNumber = i + 2; // account for header row, 1-indexed
    const raw = records[i];
    const parsed = csvImportRowSchema.safeParse({
      teamName: raw[teamNameHeader] ?? "",
      leaderName: leaderHeader ? raw[leaderHeader] : "",
      members: membersHeader ? raw[membersHeader] : "",
      contact: contactHeader ? raw[contactHeader] : "",
    });

    if (!parsed.success) {
      report.push({ row: rowNumber, teamName: raw[teamNameHeader] ?? "(blank)", status: "invalid", message: "Missing or invalid team name." });
      continue;
    }

    const normalized = normalizeTeamName(parsed.data.teamName);
    if (!normalized) {
      report.push({ row: rowNumber, teamName: parsed.data.teamName, status: "invalid", message: "Empty team name." });
      continue;
    }
    if (seenInFile.has(normalized) || existingNames.has(normalized)) {
      report.push({ row: rowNumber, teamName: parsed.data.teamName, status: "duplicate", message: "Duplicate team name." });
      continue;
    }

    seenInFile.add(normalized);

    try {
      const pin = generatePin();
      const pinHash = hashSecret(pin);
      const [created] = await db
        .insert(teams)
        .values({
          name: parsed.data.teamName,
          nameNormalized: normalized,
          leaderName: parsed.data.leaderName || null,
          members: parsed.data.members || null,
          contact: parsed.data.contact || null,
          pinHash,
        })
        .returning({ id: teams.id });

      existingNames.add(normalized);
      report.push({ row: rowNumber, teamName: parsed.data.teamName, status: "imported", pin, teamId: created.id });
    } catch {
      report.push({ row: rowNumber, teamName: parsed.data.teamName, status: "failed", message: "Database error while inserting this row." });
    }
  }

  const summary = {
    total: report.length,
    imported: report.filter((r) => r.status === "imported").length,
    duplicate: report.filter((r) => r.status === "duplicate").length,
    invalid: report.filter((r) => r.status === "invalid").length,
    failed: report.filter((r) => r.status === "failed").length,
  };

  await logAudit({
    actorType: "admin",
    adminId: auth.admin.adminId,
    action: "csv_import",
    metadata: summary,
  });

  return NextResponse.json({ summary, report });
}

