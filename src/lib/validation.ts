import { z } from "zod";

export const teamLoginSchema = z.object({
  teamName: z.string().trim().min(1, "Team name is required").max(120),
  pin: z.string().trim().min(4, "PIN is required").max(32),
  deviceId: z.string().trim().min(8).max(128).optional(),
});

export const adminLoginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(256),
});

export const adminSetupSchema = z.object({
  setupKey: z.string().min(1),
  username: z.string().trim().min(3).max(60),
  password: z.string().min(8).max(256),
});

export const buzzSchema = z.object({
  idempotencyKey: z.string().uuid(),
  roundId: z.string().uuid().optional(),
});

export const csvImportRowSchema = z.object({
  teamName: z.string().trim().min(1).max(120),
  leaderName: z.string().trim().max(120).optional().default(""),
  members: z.string().trim().max(1000).optional().default(""),
  contact: z.string().trim().max(200).optional().default(""),
});

export const createRoundSchema = z.object({
  title: z.string().trim().min(1).max(200),
  answer: z.string().trim().max(300).optional(),
});

export const roundActionSchema = z.object({
  roundId: z.string().uuid(),
  action: z.enum([
    "open",
    "close",
    "reopen",
    "correct",
    "wrong",
    "reset",
    "cancel",
  ]),
});

export const scoreAdjustmentSchema = z.object({
  teamId: z.string().uuid(),
  pointsDelta: z.number().int().min(-100).max(100),
  reason: z.string().trim().min(1).max(300),
});

export const teamPatchSchema = z.object({
  teamId: z.string().uuid(),
  action: z.enum(["enable", "disable", "reset_session"]),
});

export function normalizeTeamName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
