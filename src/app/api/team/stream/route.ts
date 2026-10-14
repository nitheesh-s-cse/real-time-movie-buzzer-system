import { NextRequest } from "next/server";
import { getCurrentTeam } from "@/lib/team-auth";
import { subscribe } from "@/lib/realtime";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream for team clients. Pushes minimal, non-sensitive
 * round-state-change notifications (e.g. "round_claimed", "round_opened").
 * Clients must treat these as hints to re-fetch authoritative state from
 * /api/team/me, never as proof of a win — only a 200 from /api/team/buzz
 * (or a server-confirmed /api/team/me read) is authoritative.
 */
export async function GET(req: NextRequest) {
  const team = await getCurrentTeam();
  if (!team) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send("connected", { ok: true });

      unsubscribe = subscribe("team", (msg) => {
        send(msg.type, msg.payload);
      });

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // stream already closed
        }
      }, 20_000);
    },
    cancel() {
      if (unsubscribe) unsubscribe();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  req.signal.addEventListener("abort", () => {
    if (unsubscribe) unsubscribe();
    if (heartbeat) clearInterval(heartbeat);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
