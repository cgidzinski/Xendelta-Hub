import { useState } from "react";
import { Box, Button, Checkbox, Collapse, IconButton, TextField } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
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
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  const updateItem = (i: number, patch: Partial<XenNoteItem>) =>
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

  const row = (item: XenNoteItem, i: number) => (
    <Box
      key={item._id ?? i}
      draggable={editable && !item.done}
      onDragStart={() => setDragFrom(i)}
      onDragOver={(e) => dragFrom !== null && e.preventDefault()}
      onDrop={() => {
        if (dragFrom !== null) onChange(moveItem(items, dragFrom, i));
        setDragFrom(null);
      }}
      onDragEnd={() => setDragFrom(null)}
      sx={{ display: "flex", alignItems: "center", gap: 0.5, opacity: dragFrom === i ? 0.4 : 1 }}
    >
      {editable && !item.done && (
        <DragIndicatorIcon
          fontSize="small"
          aria-label="Drag to reorder"
          // Dragging doesn't work on a touchscreen; there the arrows below take its place.
          sx={{
            color: "text.disabled",
            cursor: "grab",
            "@media (pointer: coarse)": { display: "none" },
          }}
        />
      )}
      {editable && !item.done && (
        <Box sx={{ display: "none", "@media (pointer: coarse)": { display: "flex" } }}>
          <IconButton
            size="small"
            aria-label={`Move ${item.text || "item"} up`}
            disabled={moveAmongActive(items, i, -1) === items}
            onClick={() => onChange(moveAmongActive(items, i, -1))}
          >
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={`Move ${item.text || "item"} down`}
            disabled={moveAmongActive(items, i, 1) === items}
            onClick={() => onChange(moveAmongActive(items, i, 1))}
          >
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
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
            onChange([...items.slice(0, i + 1), { text: "", done: false }, ...items.slice(i + 1)]);
          }
        }}
        slotProps={{
          htmlInput: { maxLength: 500, "aria-label": `Item ${i + 1}` },
          input: { sx: { textDecoration: item.done ? "line-through" : "none" } },
        }}
      />
      {editable && (
        <IconButton aria-label="Remove item" size="small" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );

  const indexed = items.map((item, i) => ({ item, i }));
  const active = indexed.filter((x) => !x.item.done);
  const done = indexed.filter((x) => x.item.done);
  return (
    <Box sx={{ ...noteFieldSx(theme), display: "block" }}>
      {active.map((x) => row(x.item, x.i))}
      {editable && (
        <Button
          startIcon={<AddIcon />}
          onClick={() => onChange([...items, { text: "", done: false }])}
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
