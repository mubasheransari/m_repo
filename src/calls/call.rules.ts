/**
 * Rules for voice and video calls. Plain functions and numbers only (no database, no framework), so they are easy to test.
 *
 * The daily VIDEO limit
 * ---------------------
 * - Every member may spend `videoDailyLimitSeconds()` (default 5 minutes) in video calls per day.
 * - A video call counts for BOTH people in it. Otherwise someone with no time left could still talk on video for as long as
 *   they like, as long as the other person called them.
 * - So a video call may last at most the smaller of the two members' remaining time. That cap is stored on the call
 *   (`maxSeconds`) and ALSO becomes the lifetime of the Agora token: when it runs out, Agora itself removes both people from
 *   the channel, even if someone tampered with the app.
 * - Voice calls are not limited.
 *
 * Time is always the SERVER's clock: seconds are billed from `answeredAt` to the moment the server saw the call end, never from
 * a number the phone reports.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

/** How long a call rings before it counts as missed. */
export const RING_TIMEOUT_SECONDS = 45;

/** Both phones ping the server while a call is on. A side silent for longer than this has dropped, and the call is over. */
export const HEARTBEAT_TIMEOUT_MS = 25_000;

/** A video call is only started when both members have at least this much time left (a 3 second call is useless). */
export const MIN_VIDEO_CALL_SECONDS = 15;

/** Voice call tokens live this long; the phone asks for a new one shortly before (Agora tells it when). */
export const VOICE_TOKEN_TTL_SECONDS = 60 * 60;

/** Anti-harassment: calls one member may start per hour. */
export const MAX_CALLS_PER_HOUR = 20;

const envInt = (name: string, fallback: number, min: number, max: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};

// Read from the environment each time (not once at import), so values from .env are always seen.

/** Video seconds per member per day. VIDEO_CALL_DAILY_SECONDS in .env; default 300 (5 minutes); 0 turns video calls off. */
export const videoDailyLimitSeconds = () => envInt('VIDEO_CALL_DAILY_SECONDS', 300, 0, DAY_MS / 1000);

/**
 * When the "day" starts, as minutes east of UTC (CALL_DAY_UTC_OFFSET_MINUTES). 0 = the day changes at midnight UTC.
 * Pakistan, for example, is 300 (UTC+5): the limit then resets at midnight Pakistan time. One fixed zone for everybody on purpose:
 * a zone sent by the phone could be changed to get a fresh allowance.
 */
export const dayOffsetMinutes = () => envInt('CALL_DAY_UTC_OFFSET_MINUTES', 0, -12 * 60, 14 * 60);

/** The day that contains `now`: [start, end). The limit resets at `end`. */
export function dayWindow(now: Date, offsetMinutes = dayOffsetMinutes()): { start: Date; end: Date } {
  const offset = offsetMinutes * 60_000;
  const startLocal = Math.floor((now.getTime() + offset) / DAY_MS) * DAY_MS;
  const start = new Date(startLocal - offset);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/**
 * Whole seconds a call is billed. Rounded UP, so many tiny calls cannot each round down to zero and dodge the limit.
 * Never more than the cap the call was given.
 */
export function billedSeconds(answeredAt: Date, endedAt: Date, capSeconds?: number | null): number {
  const raw = Math.max(0, Math.ceil((endedAt.getTime() - answeredAt.getTime()) / 1000));
  return capSeconds != null ? Math.min(raw, capSeconds) : raw;
}

export const remainingOf = (limitSeconds: number, usedSeconds: number) => Math.max(0, limitSeconds - usedSeconds);

/** Is there enough video time left to start (or answer) a video call? Always false when video calls are switched off. */
export const hasVideoTime = (remainingSeconds: number, limitSeconds: number) =>
  limitSeconds > 0 && remainingSeconds >= Math.min(MIN_VIDEO_CALL_SECONDS, limitSeconds);

/** The most a new video call may last: the smaller of the two members' remaining seconds. */
export const videoCapFor = (myRemaining: number, theirRemaining: number) => Math.min(myRemaining, theirRemaining);

/** Seconds left on a running capped call, or null when the call has no cap. */
export function secondsLeft(call: { answeredAt: Date | null; maxSeconds: number | null }, now: Date): number | null {
  if (call.maxSeconds == null || !call.answeredAt) return null;
  return Math.max(0, Math.ceil((call.answeredAt.getTime() + call.maxSeconds * 1000 - now.getTime()) / 1000));
}

export type EndReason = 'TIME_LIMIT' | 'DROPPED';

/**
 * Has an ACTIVE call really ended already, and when? Used to settle calls nobody closed properly (a phone that died, an app that
 * was killed), so such a call neither runs past its cap nor keeps charging time.
 *  - TIME_LIMIT: the cap ran out (the ended time is exactly the cap, never later).
 *  - DROPPED: one side stopped pinging; the call ended when that side was last heard from.
 * Returns null while the call is still legitimately running.
 */
export function effectiveEnd(
  call: { answeredAt: Date; maxSeconds: number | null; callerSeenAt: Date | null; calleeSeenAt: Date | null },
  now: Date,
): { at: Date; reason: EndReason } | null {
  const candidates: { at: Date; reason: EndReason }[] = [];

  if (call.maxSeconds != null) {
    const capAt = new Date(call.answeredAt.getTime() + call.maxSeconds * 1000);
    if (now.getTime() >= capAt.getTime()) candidates.push({ at: capAt, reason: 'TIME_LIMIT' });
  }
  for (const seen of [call.callerSeenAt ?? call.answeredAt, call.calleeSeenAt ?? call.answeredAt]) {
    // A side that never pinged counts from the moment the call was answered.
    if (now.getTime() - seen.getTime() > HEARTBEAT_TIMEOUT_MS) {
      candidates.push({ at: new Date(Math.max(seen.getTime(), call.answeredAt.getTime())), reason: 'DROPPED' });
    }
  }
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (b.at.getTime() < a.at.getTime() ? b : a)); // whichever happened first
}

/** 65 -> "1:05", 3725 -> "1:02:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** "5 minutes", "1 minute", "90 seconds". */
export function describeLimit(seconds: number): string {
  if (seconds % 60 === 0) {
    const m = seconds / 60;
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  return `${seconds} seconds`;
}
