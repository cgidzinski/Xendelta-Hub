// The small decisions in the step-by-step cooking view, kept apart from the component so they can be tested.

/** Keep a step number inside the recipe. */
export const clampStep = (index: number, total: number) => Math.min(Math.max(index, 0), Math.max(0, total - 1));

/**
 * What a touch gesture means: a swipe left is "next", right is "previous". A short movement, or one that is mostly
 * vertical (someone scrolling or just resting a thumb), means nothing.
 */
export function swipeDirection(dx: number, dy: number, minPx = 60): "next" | "prev" | null {
  if (Math.abs(dx) < minPx || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "next" : "prev";
}

/** Whole seconds left until `endAt`, never below 0 (rounded up, so it reads "0:01" until it is really done). */
export const remainingSeconds = (endAt: number, now: number) => Math.max(0, Math.ceil((endAt - now) / 1000));

/** 65 → "1:05", 600 → "10:00", 3725 → "1:02:05". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
