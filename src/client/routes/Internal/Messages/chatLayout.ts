import type { ViewportBox } from "../../../hooks/useVisualViewport";

/** The height of MUI's Toolbar, which the app bar uses: 56 on a phone, 48 on a phone turned sideways, 64 from 600px up. */
export function appBarHeight(width: number, landscape: boolean): number {
  if (width >= 600) return 64;
  return landscape ? 48 : 56;
}

interface ShellInput {
  phone: boolean;
  /** A chat is open (so on a phone it takes the whole screen). */
  inThread: boolean;
  viewport: ViewportBox;
  landscape: boolean;
  /** Layer for a full-screen chat: above the app bar, below dialogs and snackbars. */
  zIndex: number;
}

/**
 * How the Messages screen is placed. On a computer it fills the space below the app bar and scrolls inside. On a phone it
 * is pinned to the visible area (so the page can't scroll under it and the keyboard can't cover the composer): the list
 * sits below the app bar, and an open chat covers the app bar so its own header is the pinned top bar.
 */
export function chatShellStyle({ phone, inThread, viewport, landscape, zIndex }: ShellInput) {
  const bar = appBarHeight(viewport.width, landscape);
  if (!phone) {
    return { height: `calc(100dvh - ${bar}px)`, overflow: "hidden" } as const;
  }
  const covers = inThread;
  const top = viewport.offsetTop + (covers ? 0 : bar);
  return {
    position: "fixed",
    left: 0,
    right: 0,
    top,
    height: Math.max(0, viewport.height - (covers ? 0 : bar)),
    zIndex: covers ? zIndex : undefined,
    overflow: "hidden",
    overscrollBehavior: "none",
    bgcolor: "background.default",
  } as const;
}
