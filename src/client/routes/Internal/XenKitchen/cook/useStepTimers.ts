import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Countdown timers for steps, kept in one place (not in each step) so they keep running while you move between steps.
 * `timers` maps a step number to the moment it ends. `onFinished` is called once for each timer when it reaches zero. A
 * finished timer stays in the map (so it can be shown as done) until it is stopped or started again.
 */
export function useStepTimers(onFinished: (step: number) => void) {
  const [timers, setTimers] = useState<Record<number, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(new Set<number>());
  const notify = useRef(onFinished);
  notify.current = onFinished;

  const running = Object.keys(timers).length > 0;
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, [running]);

  useEffect(() => {
    for (const [step, endAt] of Object.entries(timers)) {
      if (endAt <= now && !fired.current.has(Number(step))) {
        fired.current.add(Number(step));
        notify.current(Number(step));
      }
    }
  }, [timers, now]);

  const start = useCallback((step: number, minutes: number) => {
    fired.current.delete(step);
    const at = Date.now();
    setNow(at);
    setTimers((t) => ({ ...t, [step]: at + minutes * 60_000 }));
  }, []);

  const stop = useCallback((step: number) => {
    fired.current.delete(step);
    setTimers((t) => {
      const { [step]: _gone, ...rest } = t;
      return rest;
    });
  }, []);

  return { timers, now, start, stop };
}
