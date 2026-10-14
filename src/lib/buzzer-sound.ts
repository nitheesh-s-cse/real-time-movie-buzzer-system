/**
 * Instant local buzzer sound using the Web Audio API.
 *
 * We synthesize the sound (no external file download required) so it can
 * start playing on the very same tap event with zero network round trip.
 * The AudioContext is created/resumed on the user's first deliberate
 * interaction to respect browser autoplay policies.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

export function isAudioUnlocked(): boolean {
  return unlocked;
}

export async function initAudio(): Promise<boolean> {
  try {
    const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return false;
    if (!ctx) ctx = new AudioCtor();
    if (ctx.state === "suspended") await ctx.resume();
    // Play a near-silent blip to fully unlock audio on iOS Safari.
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    unlocked = true;
    return true;
  } catch {
    unlocked = false;
    return false;
  }
}

/** Plays a short, energetic buzzer tone immediately (no await needed before calling). */
export function playBuzzSound(): void {
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    osc1.type = "square";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(220, now + 0.22);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain).connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);
  } catch {
    // Non-fatal: local sound is a UX nicety, never blocks the buzz request.
  }
}

export function vibrateIfSupported(pattern: number | number[] = 60): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // ignore
    }
  }
}
