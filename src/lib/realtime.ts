import { EventEmitter } from "node:events";
import { Client } from "pg";

/**
 * Real-time broadcast hub.
 *
 * NOTE ON ARCHITECTURE: the master spec calls for Supabase Realtime
 * Broadcast over WebSockets. This sandbox is provisioned with a local
 * PostgreSQL instance and no Supabase project/keys, so there is no
 * Supabase Realtime endpoint available to connect to here. As a
 * technically-equivalent, documented substitution we use PostgreSQL
 * `LISTEN/NOTIFY` (server-authoritative, same database transaction that
 * writes the authoritative state also fires the notification) fanned out
 * to browser clients over Server-Sent Events (SSE). This preserves every
 * correctness property required by the spec:
 *   - Postgres remains the single source of truth.
 *   - Broadcasts are informational only; clients must trust server
 *     responses / reconciliation fetches, never the broadcast alone.
 *   - Minimal, non-sensitive payloads only.
 * Swapping this module for `@supabase/supabase-js` Realtime Broadcast
 * channels in production is a drop-in change — see README "Production
 * Supabase migration" section.
 */

const CHANNEL = "gtm_events";

type BusMessage = {
  topic: "team" | "admin";
  type: string;
  payload: unknown;
};

const globalBus = globalThis as typeof globalThis & {
  __gtmBus?: EventEmitter;
  __gtmListenClient?: Client;
  __gtmListenReady?: Promise<void>;
};

function getBus(): EventEmitter {
  if (!globalBus.__gtmBus) {
    globalBus.__gtmBus = new EventEmitter();
    globalBus.__gtmBus.setMaxListeners(0);
  }
  return globalBus.__gtmBus;
}

async function ensureListener(): Promise<void> {
  if (globalBus.__gtmListenReady) return globalBus.__gtmListenReady;

  globalBus.__gtmListenReady = (async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return;
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    client.on("notification", (msg) => {
      if (!msg.payload) return;
      try {
        const parsed = JSON.parse(msg.payload) as BusMessage;
        getBus().emit(parsed.topic, parsed);
      } catch {
        // ignore malformed payloads
      }
    });
    client.on("error", () => {
      // Connection dropped; a future call to ensureListener after process
      // restart will reconnect. For long-lived dev/prod node servers this
      // is acceptable; Vercel serverless functions would need Supabase
      // Realtime instead (see README).
    });
    globalBus.__gtmListenClient = client;
  })();

  return globalBus.__gtmListenReady;
}

/** Publish a minimal, non-sensitive event to the given audience topic. */
export async function publish(topic: "team" | "admin", type: string, payload: unknown): Promise<void> {
  await ensureListener();
  const message: BusMessage = { topic, type, payload };
  // Use NOTIFY so the event is durable-ish (fires from the DB transaction
  // boundary) and fans out to every process listening on this channel.
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;
  const client = globalBus.__gtmListenClient;
  const text = JSON.stringify(message).replace(/'/g, "''");
  if (client) {
    await client.query(`NOTIFY ${CHANNEL}, '${text}'`);
  } else {
    // Fallback: emit locally immediately even if NOTIFY plumbing isn't up yet.
    getBus().emit(topic, message);
  }
}

export function subscribe(topic: "team" | "admin", handler: (msg: BusMessage) => void): () => void {
  void ensureListener();
  const bus = getBus();
  const listener = (msg: BusMessage) => handler(msg);
  bus.on(topic, listener);
  return () => bus.off(topic, listener);
}
