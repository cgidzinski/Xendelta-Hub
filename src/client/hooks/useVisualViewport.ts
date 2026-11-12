import { useEffect, useState } from "react";

export interface ViewportBox {
  /** The height of what is actually visible: it shrinks when the on-screen keyboard opens. */
  height: number;
  /** How far the visible area has been scrolled down from the top of the page (iOS does this to show a focused field). */
  offsetTop: number;
  width: number;
}

const read = (): ViewportBox => {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  return {
    height: vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 0),
    offsetTop: vv?.offsetTop ?? 0,
    width: vv?.width ?? (typeof window !== "undefined" ? window.innerWidth : 0),
  };
};

/**
 * The visible part of the screen, kept current. On a phone this is not `100vh` or even `100dvh`: the on-screen keyboard
 * covers part of the page without resizing it, and only `window.visualViewport` reports what is really in view.
 */
export function useVisualViewport(): ViewportBox {
  const [box, setBox] = useState<ViewportBox>(read);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => setBox(read());
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return box;
}
