"use client";

import { useEffect, useRef, useState } from "react";

export type AdminConnStatus = "connecting" | "connected" | "reconnecting";

export interface StreamEvent {
  type: string;
  payload: unknown;
  at: number;
}

/**
 * Subscribes to the admin SSE stream and exposes connection status plus a
 * monotonically increasing `version` that bumps on every message — tabs use
 * this as a cheap "something changed, refetch" signal while also polling on
 * an interval as a reconciliation safety net.
 */
export function useAdminStream() {
  const [status, setStatus] = useState<AdminConnStatus>("connecting");
  const [version, setVersion] = useState(0);
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null);
  const lastEventRef = useRef<StreamEvent | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    function connect() {
      es = new EventSource("/api/admin/stream");
      es.addEventListener("open", () => {
        if (cancelled) return;
        setStatus("connected");
        setVersion((v) => v + 1);
      });
      es.addEventListener("error", () => {
        if (cancelled) return;
        setStatus("reconnecting");
      });
      const types = [
        "buzz_accepted",
        "round_opened",
        "round_claimed",
        "round_closed",
        "round_reset",
        "round_awaiting_answer",
        "score_update",
        "team_updated",
        "event_status",
      ];
      for (const type of types) {
        es.addEventListener(type, (ev: MessageEvent) => {
          if (cancelled) return;
          const payload = JSON.parse(ev.data);
          const entry = { type, payload, at: Date.now() };
          lastEventRef.current = entry;
          setLastEvent(entry);
          setVersion((v) => v + 1);
        });
      }
    }

    connect();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, []);

  return { status, version, lastEvent };
}
