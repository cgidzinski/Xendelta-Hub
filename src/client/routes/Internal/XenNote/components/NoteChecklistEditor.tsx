import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Box, Button, Checkbox, Collapse, IconButton, TextField } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { XenNoteItem } from "../../../../types/XenNote";
import { moveAmongActive, moveItem } from "../noteDraft";
import { noteFieldSx } from "../noteFieldSx";

interface NoteChecklistEditorProps {
  items: XenNoteItem[];
  readOnly: boolean;
  viewing?: boolean;
  /** Focus the first item (a brand new list). */
  autoFocusFirst: boolean;
  onChange: (items: XenNoteItem[]) => void;
}

/** A list note: rows you can check, edit and drag to reorder, with finished items folded away below. */
export default function NoteChecklistEditor({
  items,
  readOnly,
  viewing = false,
  autoFocusFirst,
  onChange,
}: NoteChecklistEditorProps) {
  const editable = !readOnly && !viewing;
  const theme = useTheme();
  const [showDone, setShowDone] = useState(false);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // After the list re-renders, move focus to this row's text field (or its grip).
  const pendingFocus = useRef<{ index: number; target: "input" | "grip" } | null>(null);

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    const selector = pending.target === "input" ? "input" : "[data-checklist-grip]";
    containerRef.current?.querySelector<HTMLElement>(`[data-checklist-row="${pending.index}"] ${selector}`)?.focus();
  }, [items]);

  const updateItem = (i: number, patch: Partial<XenNoteItem>) =>
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

  const insertAfter = (i: number) => {
    pendingFocus.current = { index: i + 1, target: "input" };
    onChange([...items.slice(0, i + 1), { text: "", done: false }, ...items.slice(i + 1)]);
  };

  const rowUnder = (event: PointerEvent) => {
    const el = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-checklist-row]");
    return el?.dataset.checklistActive === "true" ? Number(el.dataset.checklistRow) : null;
  };

  const gripKeyDown = (event: KeyboardEvent, i: number) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const next = moveAmongActive(items, i, event.key === "ArrowUp" ? -1 : 1);
    if (next === items) return;
    pendingFocus.current = { index: next.indexOf(items[i]), target: "grip" };
    onChange(next);
  };

  const row = (item: XenNoteItem, i: number) => {
    const canDrag = editable && !item.done;
    return (
      <Box
        key={item._id ?? i}
        data-checklist-row={i}
        data-checklist-active={!item.done}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          opacity: drag?.from === i ? 0.4 : 1,
          boxShadow:
            drag && drag.over === i && drag.from !== i
              ? `inset 0 ${drag.over > drag.from ? -2 : 2}px 0 ${alpha(theme.palette.primary.main, 0.8)}`
              : "none",
        }}
      >
        {canDrag && (
          <Box
            role="button"
            tabIndex={0}
            data-checklist-grip
            aria-label={`Reorder ${item.text || "item"}`}
            aria-keyshortcuts="ArrowUp ArrowDown"
            onKeyDown={(e) => gripKeyDown(e, i)}
            onPointerDown={(e) => {
              if (!e.isPrimary || e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setDrag({ from: i, over: i });
            }}
            onPointerMove={(e) => {
              if (!drag) return;
              const over = rowUnder(e);
              if (over !== null && over !== drag.over) setDrag({ ...drag, over });
            }}
            onPointerUp={(e) => {
              if (!drag) return;
              const over = rowUnder(e) ?? drag.over;
              setDrag(null);
              if (over !== drag.from) onChange(moveItem(items, drag.from, over));
            }}
            onPointerCancel={() => setDrag(null)}
            // touch-action: none so a finger on the grip drags instead of scrolling the note.
            sx={{
              display: "flex",
              p: 0.5,
              color: "text.disabled",
              cursor: drag ? "grabbing" : "grab",
              touchAction: "none",
              userSelect: "none",
              WebkitTouchCallout: "none",
              borderRadius: 1,
            }}
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
        )}
        <Checkbox
          checked={item.done}
          disabled={readOnly}
          onChange={(e) => updateItem(i, { done: e.target.checked })}
          slotProps={{ input: { "aria-label": `Done: ${item.text || "item"}` } }}
        />
        <TextField
          variant="standard"
          fullWidth
          autoFocus={autoFocusFirst && i === 0}
          value={item.text}
          disabled={!editable}
          onChange={(e) => updateItem(i, { text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              insertAfter(i);
            } else if (e.key === "Backspace" && item.text === "" && items.length > 1) {
              e.preventDefault();
              pendingFocus.current = { index: Math.max(0, i - 1), target: "input" };
              onChange(items.filter((_, idx) => idx !== i));
            }
          }}
          slotProps={{
            htmlInput: { maxLength: 500, "aria-label": `Item ${i + 1}` },
            input: { sx: { textDecoration: item.done ? "line-through" : "none" } },
          }}
        />
        {editable && (
          <IconButton
            aria-label="Remove item"
            size="small"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    );
  };

  const indexed = items.map((item, i) => ({ item, i }));
  const active = indexed.filter((x) => !x.item.done);
  const done = indexed.filter((x) => x.item.done);
  return (
    <Box ref={containerRef} sx={{ ...noteFieldSx(theme), display: "block" }}>
      {active.map((x) => row(x.item, x.i))}
      {editable && (
        <Button
          startIcon={<AddIcon />}
          onClick={() => {
            pendingFocus.current = { index: items.length, target: "input" };
            onChange([...items, { text: "", done: false }]);
          }}
          sx={{ mt: 0.5 }}
        >
          Add item
        </Button>
      )}
      {done.length > 0 && (
        <Box sx={{ mt: 1.5, borderTop: 1, borderColor: "divider" }}>
          <Button
            size="small"
            color="inherit"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            startIcon={
              <ExpandMoreIcon sx={{ transform: showDone ? "none" : "rotate(-90deg)", transition: "transform 120ms" }} />
            }
            sx={{ mt: 0.5, textTransform: "none" }}
          >
            {done.length} completed
          </Button>
          <Collapse in={showDone}>{done.map((x) => row(x.item, x.i))}</Collapse>
        </Box>
      )}
    </Box>
  );
}
