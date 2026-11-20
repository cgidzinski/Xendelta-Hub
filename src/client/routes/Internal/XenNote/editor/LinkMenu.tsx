import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { Box, ListItemButton, ListItemIcon, ListItemText, Paper, Popper } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import TagIcon from "@mui/icons-material/Tag";
import type { LinkItem, LinkMenuState } from "./LinkSuggestions";

interface LinkMenuProps {
  state: LinkMenuState | null;
  keyRef: MutableRefObject<((event: KeyboardEvent) => boolean) | null>;
  label: string;
}

const text = (item: LinkItem): { primary: string; secondary?: string } => {
  switch (item.kind) {
    case "page":
      return {
        primary: item.title.trim() || "Untitled",
        secondary: item.alias ? `Also called "${item.alias}" · ${item.subtitle}` : item.subtitle,
      };
    case "note":
      return { primary: item.title };
    case "create":
      return { primary: `Create page "${item.title}"`, secondary: "In the open section" };
    case "tag":
      return { primary: `#${item.tag}` };
    case "newtag":
      return { primary: `New tag #${item.tag}` };
  }
};

/** The menu under the caret after "[[" or "#". Arrow keys move, Enter or Tab chooses. */
export default function LinkMenu({ state, keyRef, label }: LinkMenuProps) {
  const [index, setIndex] = useState(0);
  const items = useMemo(() => state?.items ?? [], [state]);
  const count = items.length;
  const firstKey = items[0] ? text(items[0]).primary : "";
  useEffect(() => setIndex(0), [count, firstKey]);

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
    <Popper open placement="bottom-start" anchorEl={{ getBoundingClientRect: () => rect }} style={{ zIndex: 1400 }}>
      <Paper
        variant="outlined"
        role="listbox"
        aria-label={label}
        sx={{ width: 320, maxHeight: 320, overflowY: "auto", p: 0.5, mt: 0.5, boxShadow: 3 }}
      >
        {items.map((item, i) => {
          const { primary, secondary } = text(item);
          const create = item.kind === "create" || item.kind === "newtag";
          return (
            <ListItemButton
              key={item.kind === "page" || item.kind === "note" ? item.id : `${item.kind}:${primary}`}
              role="option"
              aria-selected={i === index}
              selected={i === index}
              // Keep the focus in the editor: choosing must not blur it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => state.select(item)}
              // Only when the pointer moves: a menu opening under a resting pointer must not take the selection.
              onMouseMove={() => i !== index && setIndex(i)}
              sx={{ borderRadius: 1, gap: 1.25, py: 0.75 }}
            >
              <ListItemIcon sx={{ minWidth: 0, color: create ? "primary.main" : "text.secondary" }}>
                <Box sx={{ display: "flex" }}>
                  {create ? (
                    <AddIcon fontSize="small" />
                  ) : item.kind === "page" || item.kind === "note" ? (
                    <DescriptionOutlinedIcon fontSize="small" />
                  ) : (
                    <TagIcon fontSize="small" />
                  )}
                </Box>
              </ListItemIcon>
              <ListItemText
                primary={primary}
                secondary={secondary}
                slotProps={{
                  primary: { noWrap: true, sx: { fontWeight: 500, color: create ? "primary.main" : undefined } },
                  secondary: { noWrap: true },
                }}
              />
            </ListItemButton>
          );
        })}
      </Paper>
    </Popper>
  );
}
