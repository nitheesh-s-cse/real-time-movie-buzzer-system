import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const roundStatusEnum = pgEnum("round_status", [
  "draft",
  "open",
  "claimed",
  "awaiting_answer",
  "closed",
  "cancelled",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "live",
  "paused",
  "ended",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "active",
  "revoked",
  "expired",
  "superseded",
]);

export const buzzStatusEnum = pgEnum("buzz_status", [
  "accepted",
  "rejected",
]);

export const resultTypeEnum = pgEnum("result_type", [
  "correct",
  "wrong",
  "void",
  "adjustment",
]);

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------
export const admins = pgTable("admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull(),
  usernameNormalized: text("username_normalized").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  usernameUnique: uniqueIndex("admins_username_normalized_unique").on(t.usernameNormalized),
}));

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id").notNull().references(() => admins.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => ({
  tokenHashUnique: uniqueIndex("admin_sessions_token_hash_unique").on(t.tokenHash),
  adminIdIdx: index("admin_sessions_admin_id_idx").on(t.adminId),
}));

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameNormalized: text("name_normalized").notNull(),
  leaderName: text("leader_name"),
  members: text("members"),
  contact: text("contact"),
  pinHash: text("pin_hash").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  totalScore: integer("total_score").notNull().default(0),
  correctCount: integer("correct_count").notNull().default(0),
  wrongCount: integer("wrong_count").notNull().default(0),
  buzzCount: integer("buzz_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  nameUnique: uniqueIndex("teams_name_normalized_unique").on(t.nameNormalized),
}));

export const teamSessions = pgTable("team_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  status: sessionStatusEnum("status").notNull().default("active"),
  deviceLabel: text("device_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => ({
  tokenHashUnique: uniqueIndex("team_sessions_token_hash_unique").on(t.tokenHash),
  teamIdIdx: index("team_sessions_team_id_idx").on(t.teamId),
  // Enforces "one active session per team" at the database level.
  oneActivePerTeam: uniqueIndex("team_sessions_one_active_per_team")
    .on(t.teamId)
    .where(sql`status = 'active'`),
}));

// ---------------------------------------------------------------------------
// Events & Rounds
// ---------------------------------------------------------------------------
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: eventStatusEnum("status").notNull().default("draft"),
  currentRoundId: uuid("current_round_id"),
  wrongAnswerMode: text("wrong_answer_mode").notNull().default("reopen_for_others"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rounds = pgTable("rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  roundNumber: integer("round_number").notNull(),
  title: text("title").notNull(),
  answer: text("answer"),
  status: roundStatusEnum("status").notNull().default("draft"),
  winningTeamId: uuid("winning_team_id").references(() => teams.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  eventRoundUnique: uniqueIndex("rounds_event_id_round_number_unique").on(t.eventId, t.roundNumber),
  statusIdx: index("rounds_status_idx").on(t.status),
}));

// Teams excluded from re-buzzing on a round (used in the wrong-answer flow).
export const roundIneligibleTeams = pgTable("round_ineligible_teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull().references(() => rounds.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  roundTeamUnique: uniqueIndex("round_ineligible_round_team_unique").on(t.roundId, t.teamId),
}));

// ---------------------------------------------------------------------------
// Buzz attempts (append-only log of every buzz request received)
// ---------------------------------------------------------------------------
export const buzzAttempts = pgTable("buzz_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull().references(() => rounds.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key").notNull(),
  status: buzzStatusEnum("status").notNull(),
  reason: text("reason"),
  serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idemUnique: uniqueIndex("buzz_attempts_round_team_idem_unique").on(t.roundId, t.teamId, t.idempotencyKey),
  roundIdx: index("buzz_attempts_round_idx").on(t.roundId),
  teamIdx: index("buzz_attempts_team_idx").on(t.teamId),
}));

// ---------------------------------------------------------------------------
// Round results (the final decision made by the admin for a round)
// ---------------------------------------------------------------------------
export const roundResults = pgTable("round_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull().references(() => rounds.id, { onDelete: "cascade" }),
  winningTeamId: uuid("winning_team_id").notNull().references(() => teams.id),
  result: resultTypeEnum("result").notNull(),
  decidedByAdminId: uuid("decided_by_admin_id").references(() => admins.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Prevents the same round+team pair from being scored twice (duplicate decision protection).
  roundTeamUnique: uniqueIndex("round_results_round_team_unique").on(t.roundId, t.winningTeamId),
  roundIdx: index("round_results_round_idx").on(t.roundId),
}));

// ---------------------------------------------------------------------------
// Score ledger (permanent, append-only, never mutated or deleted)
// ---------------------------------------------------------------------------
export const scoreLedger = pgTable("score_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  roundId: uuid("round_id").references(() => rounds.id, { onDelete: "set null" }),
  resultType: resultTypeEnum("result_type").notNull(),
  pointsDelta: integer("points_delta").notNull(),
  adminId: uuid("admin_id").references(() => admins.id),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  teamIdx: index("score_ledger_team_idx").on(t.teamId),
  roundIdx: index("score_ledger_round_idx").on(t.roundId),
}));

// ---------------------------------------------------------------------------
// Audit log (every admin action + key system events)
// ---------------------------------------------------------------------------
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorType: text("actor_type").notNull(), // 'admin' | 'system'
  adminId: uuid("admin_id").references(() => admins.id),
  action: text("action").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
}));
