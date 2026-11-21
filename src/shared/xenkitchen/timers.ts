export const MAX_TIMER_SECONDS = 24 * 60 * 60;
export const TIMER_RETENTION_MS = 24 * 60 * 60 * 1000;
export const TIMER_PATH = "/api/xenkitchen/timers";

export interface TimerSource {
  key: string;
  label: string;
}

export interface StartKitchenTimer {
  id: string;
  durationSeconds: number;
  halfway: boolean;
  source?: TimerSource;
}

export interface KitchenTimer {
  id: string;
  label: string;
  sourceKey?: string;
  durationSeconds: number;
  endAt: number | null;
  halfwayAt: number | null;
  halfwayRemainingMs: number | null;
  pausedMs: number | null;
  version: number;
}

export type TimerAction = "pause" | "resume" | "dismiss";

export function parseTimerDuration(input: string): number | null {
  const match = /^(\d{1,4})(?::([0-5]\d))?$/.exec(input.trim());
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2] ?? 0);
  return seconds <= MAX_TIMER_SECONDS ? seconds : null;
}

export function formatTimerDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function startTimerClock(durationSeconds: number, halfway: boolean, now: number) {
  const durationMs = durationSeconds * 1000;
  return {
    endAt: now + durationMs,
    halfwayAt: halfway ? now + durationMs / 2 : null,
    halfwayRemainingMs: null,
    pausedMs: null,
  };
}

export function changeTimerClock(timer: KitchenTimer, action: "pause" | "resume", now: number): KitchenTimer | null {
  if (action === "pause" && timer.endAt !== null && timer.endAt > now) {
    return {
      ...timer,
      endAt: null,
      pausedMs: timer.endAt - now,
      halfwayAt: null,
      halfwayRemainingMs: timer.halfwayAt !== null && timer.halfwayAt > now ? timer.halfwayAt - now : null,
      version: timer.version + 1,
    };
  }
  if (action === "resume" && timer.pausedMs !== null) {
    return {
      ...timer,
      endAt: now + timer.pausedMs,
      halfwayAt: timer.halfwayRemainingMs === null ? null : now + timer.halfwayRemainingMs,
      halfwayRemainingMs: null,
      pausedMs: null,
      version: timer.version + 1,
    };
  }
  return null;
}
