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

/** What a drag of the drive's own files and folders carries (set by the rows and cards, read by a folder). */
export const DRIVE_ITEMS_TYPE = "application/x-xendrive-items";
export interface DraggedItems {
  fileIds: string[];
  folderIds: string[];
}

/** Is a drag carrying files or folders from this drive (as opposed to files from the computer)? */
export const dragHasItems = (e: DragEvent | ReactDragEvent): boolean =>
  Array.from(e.dataTransfer?.types ?? []).includes(DRIVE_ITEMS_TYPE);

/** Props that make a file row or folder card draggable, carrying `items` (what is selected, or just it). */
export function itemDragProps(items: () => DraggedItems) {
  return {
    draggable: true,
    onDragStart: (e: ReactDragEvent) => {
      e.dataTransfer.setData(DRIVE_ITEMS_TYPE, JSON.stringify(items()));
      e.dataTransfer.effectAllowed = "move";
    },
  };
}

/** The drive items a drop carries, or null when there are none, they are unreadable, or the folder is among them. */
export function droppedItemsFor(e: ReactDragEvent, folderId: string): DraggedItems | null {
  try {
    const parsed = JSON.parse(e.dataTransfer.getData(DRIVE_ITEMS_TYPE));
    if (!Array.isArray(parsed.fileIds) || !Array.isArray(parsed.folderIds)) return null;
    // A folder can't go into itself.
    return parsed.folderIds.includes(folderId) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Make a folder row or card a drop target: files dragged in from the computer go inside it, and the drive's own files
 * and folders dragged onto it are moved into it (never a folder onto itself).
 */
export function useFolderDrop(
  folderId: string,
  onFiles: (files: File[]) => void,
  onItems?: (items: DraggedItems) => void,
) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: ReactDragEvent) => {
        if (dragHasFiles(e) || (onItems && dragHasItems(e))) {
          e.preventDefault();
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: ReactDragEvent) => {
        if (dragHasFiles(e)) {
          e.preventDefault();
          e.stopPropagation(); // the folder took them; the page behind must not also upload them
          setOver(false);
          onFiles(Array.from(e.dataTransfer.files));
        } else if (onItems && dragHasItems(e)) {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          const items = droppedItemsFor(e, folderId);
          if (items) onItems(items);
        }
      },
    },
  };
}
