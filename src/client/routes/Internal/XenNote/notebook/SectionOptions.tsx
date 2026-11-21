import { useState } from "react";
import { IconButton, Menu, MenuItem, Tooltip } from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import type { NoteColor } from "@shared/xennote/notes";
import type { XenNoteSection } from "../../../../types/XenNotePage";
import NoteColorPopover from "../components/NoteColorPopover";

interface SectionOptionsProps {
  section: XenNoteSection;
  onRename: () => void;
  onColor: (color: NoteColor) => void;
  onDelete: () => void;
}

export default function SectionOptions({ section, onRename, onColor, onDelete }: SectionOptionsProps) {
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const pick = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  return (
    <>
      <Tooltip title="Section settings">
        <IconButton
          aria-label="Section settings"
          aria-haspopup="menu"
          aria-expanded={!!menu}
          size="small"
          onClick={(event) => setMenu(event.currentTarget)}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={pick(onRename)}>Rename</MenuItem>
        <MenuItem onClick={pick(() => setColorAnchor(menu))}>Colour</MenuItem>
        <MenuItem disabled={section.kind !== "normal"} onClick={pick(onDelete)} sx={{ color: "error.main" }}>
          Delete
        </MenuItem>
      </Menu>
      <NoteColorPopover
        anchor={colorAnchor}
        value={section.color}
        onPick={(color) => {
          onColor(color);
          setColorAnchor(null);
        }}
        onClose={() => setColorAnchor(null)}
      />
    </>
  );
}
