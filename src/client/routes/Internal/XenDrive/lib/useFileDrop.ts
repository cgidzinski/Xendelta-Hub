import { useEffect, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";

/** Is a drag carrying files from the computer (as opposed to text or a link)? */
export const dragHasFiles = (e: DragEvent | ReactDragEvent): boolean =>
  Array.from(e.dataTransfer?.types ?? []).includes("Files");

/**
 * Files dragged over the page. `dragging` is true while they are over it, so a drop zone can show;
 * `onDrop` gets the files when they are let go anywhere that did not handle the drop itself (a folder
 * row handles its own and stops it reaching here).
 */
export function useWindowFileDrop(onDrop: (files: File[]) => void): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    // dragenter/dragleave also fire for every child element, so count them to know when the drag really left
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (dragHasFiles(e)) e.preventDefault(); // allow the drop
    };
    const drop = (e: DragEvent) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      onDrop(Array.from(e.dataTransfer?.files ?? []));
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [onDrop]);

  return dragging;
}

/** Make a folder row or card accept dropped files: they go inside it. */
export function useFolderDrop(onFiles: (files: File[]) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: ReactDragEvent) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: ReactDragEvent) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        e.stopPropagation(); // the folder took them; the page behind must not also upload them
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      },
    },
  };
}
