import { NextRequest } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { subscribe } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubAdmin: (() => void) | null = null;
  let unsubTeam: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // ignore enqueue after close
        }
      };

      send("connected", { ok: true });
      unsubAdmin = subscribe("admin", (msg) => send(msg.type, msg.payload));
      unsubTeam = subscribe("team", (msg) => send(msg.type, msg.payload));

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          // stream already closed
        }
      }, 20_000);
    },
    cancel() {
      if (unsubAdmin) unsubAdmin();
      if (unsubTeam) unsubTeam();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  req.signal.addEventListener("abort", () => {
    if (unsubAdmin) unsubAdmin();
    if (unsubTeam) unsubTeam();
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
