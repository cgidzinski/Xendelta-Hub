import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { NOTE_COLORS, type NoteColor } from "@shared/xennote/notes";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import { NOTE_COLOR_LABELS, swatchColor } from "../noteColors";

interface NoteBulkBarProps {
  count: number;
  /** The archive is open, so the main action is to bring notes back. */
  inArchive: boolean;
  busy: boolean;
  /** Labels in use, to pick from. */
  labels: string[];
  onSelectAll: () => void;
  onArchive: (archived: boolean) => void;
  onColor: (color: NoteColor) => void;
  onAddLabel: (label: string) => void;
  onDelete: () => void;
  onDone: () => void;
}

type Open = "color" | "label" | null;

/** What can be done to the ticked notes: archive, colour, label, or send them to the Trash. */
export default function NoteBulkBar(props: NoteBulkBarProps) {
  const { count, inArchive, busy, labels, onSelectAll, onArchive, onColor, onAddLabel, onDelete, onDone } = props;
  const theme = useTheme();
  const [menu, setMenu] = useState<{ kind: Exclude<Open, null>; anchor: HTMLElement } | null>(null);
  const [newLabelOpen, setNewLabelOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const open = (kind: Exclude<Open, null>) => (e: React.MouseEvent<HTMLElement>) =>
    setMenu({ kind, anchor: e.currentTarget });
  const none = count === 0 || busy;

  const submitLabel = () => {
    if (newLabel.trim()) onAddLabel(newLabel.trim());
    setNewLabel("");
    setNewLabelOpen(false);
  };

  return (
    <Box
      role="toolbar"
      aria-label="Actions for selected notes"
      sx={{ ...cardSx, display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", px: 1.5, py: 1, mb: 2.5 }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600, mr: 1 }}>
        {count} selected
      </Typography>
      <Button size="small" onClick={onSelectAll} disabled={busy}>
        Select all
      </Button>
      <Button
        size="small"
        startIcon={inArchive ? <UnarchiveOutlinedIcon /> : <ArchiveOutlinedIcon />}
        onClick={() => onArchive(inArchive)}
        disabled={none}
      >
        {inArchive ? "Unarchive" : "Archive"}
      </Button>
      <Button size="small" onClick={open("color")} disabled={none}>
        Colour
      </Button>
      <Button size="small" onClick={open("label")} disabled={none}>
        Label
      </Button>
      <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={onDelete} disabled={none}>
        Delete
      </Button>
      <Box sx={{ flex: 1 }} />
      <Button size="small" onClick={onDone}>
        Done
      </Button>

      <Menu open={menu?.kind === "color"} anchorEl={menu?.anchor} onClose={() => setMenu(null)}>
        {NOTE_COLORS.map((c) => (
          <MenuItem
            key={c}
            onClick={() => {
              setMenu(null);
              onColor(c);
            }}
          >
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                mr: 1.5,
                border: 1,
                borderColor: "divider",
                bgcolor: swatchColor(theme, c) ?? "background.paper",
              }}
            />
            {NOTE_COLOR_LABELS[c]}
          </MenuItem>
        ))}
      </Menu>
      <Menu open={menu?.kind === "label"} anchorEl={menu?.anchor} onClose={() => setMenu(null)}>
        {labels.map((l) => (
          <MenuItem
            key={l}
            onClick={() => {
              setMenu(null);
              onAddLabel(l);
            }}
          >
            {l}
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            setMenu(null);
            setNewLabelOpen(true);
          }}
        >
          New label…
        </MenuItem>
      </Menu>

      <Dialog open={newLabelOpen} onClose={() => setNewLabelOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add a label</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitLabel()}
            slotProps={{ htmlInput: { maxLength: 30 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewLabelOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submitLabel} disabled={!newLabel.trim()}>
            Add to {count} {count === 1 ? "note" : "notes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
