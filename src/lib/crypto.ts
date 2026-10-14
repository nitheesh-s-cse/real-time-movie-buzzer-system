import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password / PIN hashing using Node's built-in scrypt (no native deps
 * required, FIPS-adjacent, safe default cost factor for short PINs/passwords
 * typed by humans). Format: scrypt$<saltHex>$<hashHex>
 */
const KEY_LEN = 64;

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(secret, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const derived = scryptSync(secret, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** Generates a random, URL-safe opaque session token (raw, shown to client once). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** One-way hash of a session token for storage (so DB leaks don't leak live sessions). */
export function hashToken(token: string): string {
  // Plain SHA-256 is appropriate here (not scrypt): tokens are high-entropy
  // random 256-bit values, not guessable human secrets, and this hash runs
  // on the hot path of every buzzer request, so it must be fast.
  return createHash("sha256").update(token).digest("hex");
}

/** Generates a human-friendly random PIN, e.g. for team credentials (6 digits). */
export function generatePin(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

export function newId(): string {
  return randomUUID();
}
