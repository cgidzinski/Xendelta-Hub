import { useEffect, useState } from "react";

/** False for `delayMs` after mount, then true. Lets a loading placeholder skip fast responses entirely. */
export function useDelayedVisible(delayMs: number): boolean {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs]);
  return visible;
}
