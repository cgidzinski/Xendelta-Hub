import { useEffect, useMemo, useState, type MutableRefObject, type ReactElement } from "react";
import { Box, ListItemButton, ListItemIcon, ListItemText, Paper, Popper } from "@mui/material";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import CodeIcon from "@mui/icons-material/Code";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";
import TitleIcon from "@mui/icons-material/Title";
import type { SlashState } from "./SlashCommand";
import type { SlashItemId } from "./slashItems";

const ICONS: Record<SlashItemId, ReactElement> = {
  heading1: <TitleIcon />,
  heading2: <TitleIcon fontSize="small" />,
  heading3: <TitleIcon sx={{ fontSize: 16 }} />,
  bulletList: <FormatListBulletedIcon />,
  orderedList: <FormatListNumberedIcon />,
  taskList: <CheckBoxOutlinedIcon />,
  quote: <FormatQuoteIcon />,
  codeBlock: <CodeIcon />,
  callout: <InfoOutlinedIcon />,
  table: <TableChartOutlinedIcon />,
  divider: <HorizontalRuleIcon />,
  file: <InsertDriveFileOutlinedIcon />,
};

interface SlashMenuProps {
  state: SlashState | null;
  keyRef: MutableRefObject<((event: KeyboardEvent) => boolean) | null>;
}

/** The menu of blocks under the caret. Arrow keys move, Enter or Tab chooses, Escape is left to the editor. */
export default function SlashMenu({ state, keyRef }: SlashMenuProps) {
  const [index, setIndex] = useState(0);
  const items = useMemo(() => state?.items ?? [], [state]);
  const count = items.length;
  const firstId = items[0]?.id;

  // A new search starts at the top.
  useEffect(() => setIndex(0), [count, firstId]);

  useEffect(() => {
    if (!state || count === 0) {
      keyRef.current = null;
      return;
    }
    keyRef.current = (event) => {
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % count);
        return true;
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + count) % count);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        state.select(items[Math.min(index, count - 1)]);
        return true;
      }
      return false;
    };
    return () => {
      keyRef.current = null;
    };
  }, [state, count, index, items, keyRef]);

  if (!state?.rect || count === 0) return null;
  const rect = state.rect;
  return (
    <Popper
      open
      placement="bottom-start"
      anchorEl={{ getBoundingClientRect: () => rect }}
      style={{ zIndex: 1400 }}
      modifiers={[{ name: "flip", enabled: true }]}
    >
      <Paper
        variant="outlined"
        role="listbox"
        aria-label="Blocks"
        sx={{ width: 300, maxHeight: 320, overflowY: "auto", p: 0.5, mt: 0.5, boxShadow: 3 }}
      >
        {items.map((item, i) => (
          <ListItemButton
            key={item.id}
            role="option"
            aria-selected={i === index}
            selected={i === index}
            // Keep the focus in the editor: choosing a block must not blur it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => state.select(item)}
            onMouseEnter={() => setIndex(i)}
            sx={{ borderRadius: 1, gap: 1.5, py: 0.75 }}
          >
            <ListItemIcon sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "text.secondary",
                }}
              >
                {ICONS[item.id]}
              </Box>
            </ListItemIcon>
            <ListItemText
              primary={item.title}
              secondary={item.description}
              slotProps={{ primary: { fontWeight: 500 } }}
            />
          </ListItemButton>
        ))}
      </Paper>
    </Popper>
  );
}
