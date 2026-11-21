import { TIMER_RETENTION_MS, type KitchenTimer } from "@shared/xenkitchen/timers";
import { formatCountdown, remainingSeconds } from "../cook/cookLogic";

export const timerFinished = (timer: KitchenTimer, now: number) => timer.endAt !== null && timer.endAt <= now;

export const timerVisible = (timer: KitchenTimer, now: number) =>
  timer.endAt === null || timer.endAt + TIMER_RETENTION_MS > now;

export function timerCountdown(timer: KitchenTimer, now: number): string {
  return formatCountdown(
    timer.endAt === null ? Math.ceil((timer.pausedMs ?? 0) / 1000) : remainingSeconds(timer.endAt, now),
  );
}

export function sortTimers(timers: KitchenTimer[], now: number): KitchenTimer[] {
  const order = (timer: KitchenTimer) => (timerFinished(timer, now) ? 2 : timer.endAt === null ? 1 : 0);
  return [...timers].sort((a, b) => order(a) - order(b) || (a.endAt ?? a.pausedMs ?? 0) - (b.endAt ?? b.pausedMs ?? 0));
}

export function timerAlert(timer: KitchenTimer, now: number) {
  if (timerFinished(timer, now)) return { kind: "done" as const, at: timer.endAt! };
  if (timer.halfwayAt !== null && timer.halfwayAt <= now) return { kind: "halfway" as const, at: timer.halfwayAt };
  return null;
}

export function recipeTimerSource(
  item: { _id: string; title: string },
  kind: "step" | "method",
  rowId: string | undefined,
  index: number,
  description: string,
) {
  return {
    key: `${item._id}:${kind}:${rowId ?? index}`,
    label: `${(item.title.trim() || "Recipe").slice(0, 160)} · ${description}`,
  };
}
