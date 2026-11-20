import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { dropTarget } from "./stepsReducer";

/** Each draggable step card's wrapper carries this attribute, so the hook can measure where the cards are. */
export const STEP_ITEM_ATTR = "data-step-item";

/** How close to the top or bottom of the screen (px) the pointer has to be to scroll the page while dragging. */
const EDGE = 64;
const MAX_SCROLL_STEP = 16;

export interface StepDrag {
  /** The step being dragged. */
  from: number;
  /** The gap the step would drop into (0 = above the first step); null when dropping would change nothing. */
  slot: number | null;
}

/**
 * Drag a step by its handle to reorder. Built on pointer events, which a mouse, a pen and a finger all send, so it works
 * on phones (HTML drag and drop does not fire for touch). The handle needs `touch-action: none` so a finger drag moves
 * the step instead of scrolling the page; the page scrolls on its own when the pointer nears the top or bottom edge.
 *
 * While a drag is on, the list collapses each card to its header (see RecipeForm) so several steps fit on screen; the
 * page is scrolled so the card under the pointer stays put when the cards collapse and when they open again.
 *
 * `start` is stable, so passing it to memoized step editors doesn't re-render them; only the list wrapper re-renders
 * as the drop position changes. Escape cancels.
 */
export function useStepDrag(onMove: (from: number, to: number) => void) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<StepDrag | null>(null);
  const onMoveRef = useRef(onMove);
  const cleanupRef = useRef<(() => void) | null>(null);
  /** After the next render, scroll so card `index` sits at viewport y `top`. */
  const anchorRef = useRef<{ index: number; top: number } | null>(null);

  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  // Runs before paint, so the collapse and expand never show as a jump.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchorRef.current = null;
    const card = listRef.current?.querySelectorAll<HTMLElement>(`[${STEP_ITEM_ATTR}]`)[anchor.index];
    if (card) window.scrollBy(0, card.getBoundingClientRect().top - anchor.top);
  }, [drag]);

  // Leaving the page mid-drag must not leave listeners behind.
  useEffect(() => () => cleanupRef.current?.(), []);

  const start = useCallback((from: number, e: ReactPointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Stops text selection on a mouse drag.
    e.preventDefault();
    cleanupRef.current?.();

    const cardsNow = () => listRef.current?.querySelectorAll<HTMLElement>(`[${STEP_ITEM_ATTR}]`) ?? [];
    let pointerY = e.clientY;
    let to = from;
    let frame = 0;
    const startTop = cardsNow()[from]?.getBoundingClientRect().top ?? pointerY;
    // Where the pointer grabbed the card, so the card can be put back under it when the drop expands the list.
    const grabOffset = pointerY - startTop;

    const locate = () => {
      const midpoints = Array.from(cardsNow(), (card) => {
        const rect = card.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
      const target = dropTarget(midpoints, pointerY, from);
      to = target.to;
      const slot = to === from ? null : target.slot;
      setDrag((prev) => (prev && prev.slot === slot ? prev : { from, slot }));
    };

    // A finger held still near the edge sends no pointer events, so scrolling runs on its own frame loop.
    const tick = () => {
      const fromTop = pointerY - EDGE;
      const fromBottom = pointerY - (window.innerHeight - EDGE);
      const step = fromTop < 0 ? Math.max(fromTop, -EDGE) : fromBottom > 0 ? Math.min(fromBottom, EDGE) : 0;
      if (step !== 0) {
        window.scrollBy(0, Math.round((step / EDGE) * MAX_SCROLL_STEP));
        locate();
      }
      frame = requestAnimationFrame(tick);
    };

    const onPointerMove = (ev: PointerEvent) => {
      pointerY = ev.clientY;
      locate();
    };
    const finish = (commit: boolean) => {
      cleanup();
      const moved = commit && to !== from;
      anchorRef.current = moved
        ? { index: to, top: pointerY - grabOffset }
        : { index: from, top: cardsNow()[from]?.getBoundingClientRect().top ?? startTop };
      setDrag(null);
      if (moved) onMoveRef.current(from, to);
    };
    const onPointerUp = () => finish(true);
    const onPointerCancel = () => finish(false);
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") finish(false);
    };

    function cleanup() {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      cleanupRef.current = null;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    cleanupRef.current = cleanup;
    anchorRef.current = { index: from, top: startTop };
    setDrag({ from, slot: null });
    frame = requestAnimationFrame(tick);
  }, []);

  return { listRef, drag, start };
}
