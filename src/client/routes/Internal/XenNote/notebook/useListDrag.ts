import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { pageDropPosition, type PageDrop } from "./pageTree";

const SCROLL_EDGE = 40;
const DRAG_DISTANCE = 6;
const TOUCH_HOLD_MS = 300;

interface DragPointer {
  id: string;
  pointerId: number;
  touch: boolean;
  dragging: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
}

export const reorderRowSx = (dragging: boolean) => ({
  cursor: dragging ? "grabbing" : "grab",
  userSelect: "none",
  WebkitTouchCallout: "none",
});

export function useListDrag(
  rowAttribute: "data-page-row" | "data-section-row" | "data-notebook-row",
  onReorder: (id: string, position: { before?: string; after?: string }) => void,
) {
  const listRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<DragPointer | null>(null);
  const hold = useRef<number | undefined>(undefined);
  const frame = useRef(0);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ id: string; target: PageDrop | null } | null>(null);

  useEffect(() => {
    const list = listRef.current;
    // Normal touch movement can scroll the list. Once a hold starts a drag, keep touch movement with the row.
    const preventScroll = (event: TouchEvent) => {
      if (pointer.current?.touch && pointer.current.dragging && event.cancelable) event.preventDefault();
    };
    list?.addEventListener("touchmove", preventScroll, { passive: false });
    return () => {
      list?.removeEventListener("touchmove", preventScroll);
      window.clearTimeout(hold.current);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  function getRows() {
    return Array.from(listRef.current?.querySelectorAll<HTMLElement>(`[${rowAttribute}]`) ?? []);
  }

  function locate() {
    const list = listRef.current;
    const active = pointer.current;
    if (!list || !active) return null;
    const bounds = list.getBoundingClientRect();
    if (active.x < bounds.left || active.x > bounds.right || active.y < bounds.top - 4 || active.y > bounds.bottom + 4)
      return null;
    const viewport = list.closest("[data-list-drag-scroll]")?.getBoundingClientRect();
    if (active.y < (viewport?.top ?? 0) || active.y > (viewport?.bottom ?? window.innerHeight)) return null;

    const rows = getRows();
    const next = rows.find((row) => {
      const rect = row.getBoundingClientRect();
      return active.y < rect.top + rect.height / 2;
    });
    const id = (next ?? rows.at(-1))?.getAttribute(rowAttribute);
    if (!id) return null;
    const target: PageDrop = { id, edge: next ? "before" : "after" };
    const position = pageDropPosition(
      rows.map((row) => row.getAttribute(rowAttribute)!),
      active.id,
      target,
    );
    return position && { target, position };
  }

  function updateTarget() {
    const target = locate()?.target ?? null;
    setDrag((current) =>
      current && (current.target?.id !== target?.id || current.target?.edge !== target?.edge)
        ? { ...current, target }
        : current,
    );
  }

  function cancel() {
    window.clearTimeout(hold.current);
    cancelAnimationFrame(frame.current);
    pointer.current = null;
    setDrag(null);
  }

  function beginDrag(active: DragPointer) {
    active.dragging = true;
    suppressClick.current = true;
    setDrag({ id: active.id, target: null });

    const scroller = listRef.current?.closest<HTMLElement>("[data-list-drag-scroll]");
    const autoScroll = () => {
      const active = pointer.current;
      if (!active) return;
      const bounds = scroller?.getBoundingClientRect();
      const top = Math.max(0, bounds?.top ?? 0);
      const bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight);
      const fromTop = active.y - (top + SCROLL_EDGE);
      const fromBottom = active.y - (bottom - SCROLL_EDGE);
      const edge = fromTop < 0 ? Math.max(fromTop, -SCROLL_EDGE) : Math.min(Math.max(fromBottom, 0), SCROLL_EDGE);
      const listBounds = listRef.current?.getBoundingClientRect();
      if (edge && listBounds && active.x >= listBounds.left && active.x <= listBounds.right) {
        (scroller ?? window).scrollBy(0, Math.sign(edge) * Math.ceil(Math.abs(edge) / 4));
        updateTarget();
      }
      frame.current = requestAnimationFrame(autoScroll);
    };
    frame.current = requestAnimationFrame(autoScroll);
  }

  function start(id: string, event: PointerEvent<HTMLElement>) {
    if (!event.isPrimary || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const touch = event.pointerType === "touch";
    const active = {
      id,
      pointerId: event.pointerId,
      touch,
      dragging: false,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    };
    pointer.current = active;
    if (touch) {
      hold.current = window.setTimeout(() => beginDrag(active), TOUCH_HOLD_MS);
    } else {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function move(event: PointerEvent) {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.x = event.clientX;
    active.y = event.clientY;
    if (!active.dragging) {
      if (Math.hypot(active.x - active.startX, active.y - active.startY) < DRAG_DISTANCE) return;
      if (active.touch) {
        cancel();
        return;
      }
      beginDrag(active);
    }
    updateTarget();
  }

  function drop(event: PointerEvent) {
    const active = pointer.current;
    if (!active || active.pointerId !== event.pointerId) return;
    active.x = event.clientX;
    active.y = event.clientY;
    const result = active.dragging ? locate() : null;
    cancel();
    if (result) onReorder(active.id, result.position);
  }

  function cancelPointer(event: PointerEvent) {
    if (pointer.current?.pointerId === event.pointerId) cancel();
  }

  function getRowProps(id: string) {
    return {
      draggable: false,
      "aria-keyshortcuts": "ArrowUp ArrowDown",
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (!pointer.current) start(id, event);
      },
      onContextMenu: (event: MouseEvent<HTMLElement>) => {
        if (pointer.current?.touch) event.preventDefault();
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        if (pointer.current) return;
        const ids = getRows().map((row) => row.getAttribute(rowAttribute));
        const up = event.key === "ArrowUp";
        const target = ids[ids.indexOf(id) + (up ? -1 : 1)];
        if (target) onReorder(id, up ? { before: target } : { after: target });
      },
    };
  }

  const listProps = {
    ref: listRef,
    onPointerDownCapture: (event: PointerEvent) => {
      if (event.isPrimary && !pointer.current) suppressClick.current = false;
    },
    onPointerMove: move,
    onPointerUp: drop,
    onPointerCancel: cancelPointer,
    onLostPointerCapture: cancelPointer,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Escape" && pointer.current) {
        event.stopPropagation();
        cancel();
      }
    },
    onClickCapture: (event: MouseEvent) => {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };

  return { drag, listProps, getRowProps };
}

export type ReorderRowProps = ReturnType<ReturnType<typeof useListDrag>["getRowProps"]>;
