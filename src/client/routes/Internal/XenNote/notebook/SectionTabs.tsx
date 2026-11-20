import { useState } from "react";
import { Box, IconButton, ListItemText, Menu, MenuItem, Tab, Tabs, Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import type { NoteColor } from "@shared/xennote/notes";
import type { XenNoteSection } from "../../../../types/XenNotePage";
import { swatchColor } from "../noteColors";
import NoteColorPopover from "../components/NoteColorPopover";

interface SectionTabsProps {
  sections: XenNoteSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** Whether the person can add, rename, recolour, move and delete sections. */
  canEdit: boolean;
  onAdd: () => void;
  onRename: (section: XenNoteSection) => void;
  onColor: (section: XenNoteSection, color: NoteColor) => void;
  onMove: (section: XenNoteSection, direction: "left" | "right") => void;
  onDelete: (section: XenNoteSection) => void;
}

/** A notebook's sections as tabs along the top, with a menu for the open one. */
export default function SectionTabs({
  sections,
  activeId,
  onSelect,
  canEdit,
  onAdd,
  onRename,
  onColor,
  onMove,
  onDelete,
}: SectionTabsProps) {
  const theme = useTheme();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const active = sections.find((s) => s.id === activeId) ?? null;
  const at = active ? sections.indexOf(active) : -1;

  return (
    <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", pl: 1, pr: 1 }}>
      <Tabs
        value={active ? active.id : false}
        onChange={(_e, id: string) => onSelect(id)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Sections"
        sx={{ flex: 1, minWidth: 0, minHeight: 48 }}
      >
        {sections.map((s) => {
          const dot = swatchColor(theme, s.color);
          return (
            <Tab
              key={s.id}
              value={s.id}
              disableRipple
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {dot && <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: dot }} />}
                  {s.name}
                </Box>
              }
              sx={{ minHeight: 48, textTransform: "none" }}
            />
          );
        })}
      </Tabs>
      {canEdit && (
        <>
          <Tooltip title="Add a section">
            <IconButton aria-label="Add a section" onClick={onAdd}>
              <AddIcon />
            </IconButton>
          </Tooltip>
          {active && (
            <Tooltip title="Section options">
              <IconButton aria-label="Section options" onClick={(e) => setMenu(e.currentTarget)}>
                <MoreVertIcon />
              </IconButton>
            </Tooltip>
          )}
        </>
      )}
      <Menu anchorEl={menu} open={!!menu && !!active} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            setMenu(null);
            if (active) onRename(active);
          }}
        >
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setColorAnchor(menu);
            setMenu(null);
          }}
        >
          <ListItemText>Colour</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={at <= 0}
          onClick={() => {
            setMenu(null);
            if (active) onMove(active, "left");
          }}
        >
          <ListItemText>Move left</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={at === -1 || at >= sections.length - 1}
          onClick={() => {
            setMenu(null);
            if (active) onMove(active, "right");
          }}
        >
          <ListItemText>Move right</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={active?.kind !== "normal"}
          onClick={() => {
            setMenu(null);
            if (active) onDelete(active);
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
      <NoteColorPopover
        anchor={colorAnchor}
        value={active?.color ?? "default"}
        onPick={(color) => {
          if (active) onColor(active, color);
          setColorAnchor(null);
        }}
        onClose={() => setColorAnchor(null)}
      />
    </Box>
  );
}
