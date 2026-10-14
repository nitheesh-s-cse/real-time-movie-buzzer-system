"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { initAudio, playBuzzSound, vibrateIfSupported } from "@/lib/buzzer-sound";

type RoundInfo = {
  id: string;
  roundNumber: number;
  title: string;
  status: "draft" | "open" | "claimed" | "awaiting_answer" | "closed" | "cancelled";
  winningTeamId: string | null;
  isWinner: boolean;
} | null;

type MeResponse = {
  authenticated: boolean;
  team: { id: string; name: string; isEnabled: boolean; totalScore: number };
  event: { id: string; name: string; status: string };
  round: RoundInfo;
  ineligible: boolean;
};

type ConnStatus = "connecting" | "connected" | "reconnecting";

type BuzzPhase = "idle" | "pending" | "accepted" | "rejected";

export default function BuzzerClient({ initialTeamName }: { initialTeamName: string }) {
  const router = useRouter();
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [conn, setConn] = useState<ConnStatus>("connecting");
  const [phase, setPhase] = useState<BuzzPhase>("idle");
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const pendingRef = useRef(false);

  const refresh = useCallback(async () => {
    const res = await apiFetch<MeResponse>("/api/team/me");
    if (!res.ok || !res.data) {
      if (res.status === 401) {
        router.push("/team/login");
      }
      return;
    }
    setMe(res.data);
    if (res.data.round?.status !== "claimed" || !res.data.round.isWinner) {
      // Reset the local "I just buzzed" visual state once the round has
      // moved on, unless we're the current claim holder awaiting a decision.
      if (phase !== "pending") setPhase("idle");
    }
  }, [router, phase]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!audioEnabled) return;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource("/api/team/stream");
      es.addEventListener("open", () => {
        setConn("connected");
        void refresh();
      });
      es.addEventListener("error", () => {
        setConn("reconnecting");
      });
      const refreshEvents = [
        "round_opened",
        "round_claimed",
        "round_closed",
        "round_awaiting_answer",
        "score_update",
        "event_status",
      ];
      for (const evt of refreshEvents) {
        es.addEventListener(evt, () => void refresh());
      }
      es.addEventListener("session_reset", () => {
        router.push("/team/login");
      });
    }

    connect();
    const onlineHandler = () => void refresh();
    window.addEventListener("online", onlineHandler);
    window.addEventListener("focus", onlineHandler);
    const pollTimer = setInterval(() => void refresh(), 8000);

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("focus", onlineHandler);
      clearInterval(pollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioEnabled]);

  async function handleEnable() {
    await initAudio();
    setAudioEnabled(true);
    await refresh();
  }

  async function handleBuzz() {
    if (pendingRef.current) return;
    if (!me?.round || me.round.status !== "open" || me.ineligible) return;

    pendingRef.current = true;
    playBuzzSound();
    vibrateIfSupported(80);
    setPhase("pending");
    setRejectReason(null);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);

    const key = idempotencyKeyRef.current;
    const res = await apiFetch<{ status: "accepted" | "rejected"; reason: string | null }>("/api/team/buzz", {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: key, roundId: me.round.id }),
    });

    pendingRef.current = false;
    idempotencyKeyRef.current = crypto.randomUUID();

    if (!res.ok || !res.data) {
      setPhase("rejected");
      setRejectReason("Network error — could not reach the server.");
      await refresh();
      return;
    }

    if (res.data.status === "accepted") {
      setPhase("accepted");
      vibrateIfSupported([40, 40, 80]);
    } else {
      setPhase("rejected");
      setRejectReason(describeRejection(res.data.reason));
    }
    await refresh();
  }

  if (!audioEnabled) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-400">{initialTeamName}</p>
        <h1 className="text-3xl font-black text-white">Get Ready to Buzz!</h1>
        <p className="max-w-xs text-sm text-slate-400">
          Tap below once to enable sound and connect to the live event. Keep this
          screen open during the round.
        </p>
        <button
          onClick={handleEnable}
          className="h-48 w-48 rounded-full bg-amber-400 text-xl font-black text-slate-950 shadow-2xl shadow-amber-400/30 active:scale-95"
        >
          TAP TO START
        </button>
      </main>
    );
  }

  const round = me?.round ?? null;
  const canBuzz = !!round && round.status === "open" && !me?.ineligible && phase !== "pending";
  const youWon = round?.status === "claimed" && round?.isWinner;
  const lockedByOther = round?.status === "claimed" && !round?.isWinner;

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-6">
      <header className="flex w-full max-w-md items-center justify-between text-sm text-slate-400">
        <span className="font-semibold text-white">{me?.team.name ?? initialTeamName}</span>
        <ConnBadge status={conn} />
      </header>

      <div className="mt-6 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
          {me?.event.status === "paused" ? "Event Paused" : me?.event.status === "ended" ? "Event Ended" : "Live Event"}
        </p>
        <h2 className="mt-1 text-lg font-bold text-white">
          {round ? `Round ${round.roundNumber}: ${round.title}` : "Waiting for the next round…"}
        </h2>
        <p className="mt-1 text-sm text-amber-300">Score: {me?.team.totalScore ?? 0}</p>
      </div>

      <div className="mt-8 flex flex-1 w-full max-w-md flex-col items-center justify-center gap-6">
        <button
          onClick={handleBuzz}
          disabled={!canBuzz}
          className={[
            "flex h-64 w-64 items-center justify-center rounded-full text-3xl font-black uppercase tracking-wide shadow-2xl transition-transform active:scale-95 sm:h-72 sm:w-72",
            flash ? "scale-95" : "",
            !round || me?.event.status !== "live"
              ? "bg-slate-800 text-slate-500"
              : canBuzz
                ? "bg-red-600 text-white shadow-red-600/40"
                : youWon
                  ? "bg-emerald-500 text-slate-950 shadow-emerald-500/40"
                  : "bg-slate-700 text-slate-300",
          ].join(" ")}
        >
          {statusLabel({ round, phase, youWon, lockedByOther, ineligible: !!me?.ineligible, eventStatus: me?.event.status })}
        </button>

        <StatusPanel round={round} phase={phase} rejectReason={rejectReason} youWon={!!youWon} lockedByOther={!!lockedByOther} ineligible={!!me?.ineligible} eventStatus={me?.event.status} />
      </div>

      <footer className="mb-2 text-center text-[11px] text-slate-600">
        Local sound confirms your tap was received by your phone — only the
        server decides who actually won the buzz.
      </footer>
    </main>
  );
}

function describeRejection(reason: string | null): string {
  switch (reason) {
    case "round_already_claimed":
      return "Too slow! Another team buzzed first.";
    case "already_won_this_round":
      return "You already buzzed for this round.";
    case "ineligible_for_round":
      return "You already answered this question — waiting for the next one.";
    case "no_active_round":
      return "No round is open right now.";
    case "event_not_live":
      return "The event is not live right now.";
    case "rate_limited":
      return "Please slow down — too many taps.";
    case "team_disabled":
      return "Your team has been disabled by the organizer.";
    default:
      return "Buzz was not accepted.";
  }
}

function statusLabel(args: {
  round: RoundInfo;
  phase: BuzzPhase;
  youWon: boolean;
  lockedByOther: boolean;
  ineligible: boolean;
  eventStatus?: string;
}): string {
  const { round, phase, youWon, lockedByOther, ineligible, eventStatus } = args;
  if (eventStatus && eventStatus !== "live") return "WAIT";
  if (!round) return "WAIT";
  if (phase === "pending") return "…";
  if (youWon) return "YOU BUZZED!";
  if (lockedByOther) return "LOCKED";
  if (ineligible) return "LOCKED";
  if (round.status === "open") return "BUZZ";
  if (round.status === "closed" || round.status === "cancelled") return "CLOSED";
  if (round.status === "awaiting_answer") return "WAIT";
  return "WAIT";
}

function StatusPanel(props: {
  round: RoundInfo;
  phase: BuzzPhase;
  rejectReason: string | null;
  youWon: boolean;
  lockedByOther: boolean;
  ineligible: boolean;
  eventStatus?: string;
}) {
  const { round, rejectReason, youWon, lockedByOther, ineligible, eventStatus } = props;

  let message = "Waiting for the host to open the next round.";
  let tone = "text-slate-400";

  if (eventStatus === "paused") {
    message = "The event is paused by the organizer.";
  } else if (eventStatus === "ended") {
    message = "The event has ended. Thanks for playing!";
  } else if (round?.status === "open") {
    message = "Buzzer is LIVE — tap now!";
    tone = "text-emerald-400";
  } else if (youWon) {
    message = "You buzzed in first! Waiting for the host's decision…";
    tone = "text-emerald-400";
  } else if (lockedByOther) {
    message = "Another team buzzed first. Buzzer locked.";
    tone = "text-red-400";
  } else if (ineligible) {
    message = "You already answered this question. Waiting for the next one.";
    tone = "text-amber-400";
  } else if (round?.status === "awaiting_answer") {
    message = "Wrong answer given — waiting for the host to reopen the round.";
  } else if (round?.status === "closed") {
    message = "This round is closed.";
  }

  return (
    <div className="text-center">
      <p className={`text-sm font-semibold ${tone}`}>{message}</p>
      {rejectReason && <p className="mt-1 text-xs text-slate-500">{rejectReason}</p>}
    </div>
  );
}

function ConnBadge({ status }: { status: ConnStatus }) {
  const map: Record<ConnStatus, { label: string; color: string }> = {
    connected: { label: "Connected", color: "bg-emerald-500" },
    connecting: { label: "Connecting…", color: "bg-amber-400" },
    reconnecting: { label: "Reconnecting…", color: "bg-red-500" },
  };
  const { label, color } = map[status];
  return (
    <span className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
