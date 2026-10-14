import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ADMIN_SETUP_KEY: z.string().min(8).optional(),
  SESSION_SECRET: z.string().min(16).optional(),
});

type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Validates required/optional environment variables once and caches the
 * result. Throws a descriptive error (never leaking values) if something
 * required is missing or malformed.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
