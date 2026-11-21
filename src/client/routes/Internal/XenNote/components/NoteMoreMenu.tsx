import { Divider, ListItemIcon, Menu, MenuItem } from "@mui/material";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import HistoryIcon from "@mui/icons-material/History";
import NotesIcon from "@mui/icons-material/Notes";

interface NoteMoreMenuProps {
  anchor: HTMLElement | null;
  isList: boolean;
  /** Whether archive and history are available. */
  saved: boolean;
  archived: boolean;
  onToggleList?: () => void;
  onToggleArchived: () => void;
  onHistory: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** Secondary note actions in the dialog footer. */
export default function NoteMoreMenu({
  anchor,
  isList,
  saved,
  archived,
  onToggleList,
  onToggleArchived,
  onHistory,
  onDelete,
  onClose,
}: NoteMoreMenuProps) {
  return (
    <Menu
      anchorEl={anchor}
      open={!!anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      transformOrigin={{ vertical: "bottom", horizontal: "right" }}
      slotProps={{ list: { "aria-label": "More note actions" } }}
    >
      {onToggleList && (
        <MenuItem
          onClick={() => {
            onClose();
            onToggleList();
          }}
        >
          <ListItemIcon>
            {isList ? <NotesIcon fontSize="small" /> : <CheckBoxOutlinedIcon fontSize="small" />}
          </ListItemIcon>
          {isList ? "Turn into a note" : "Turn into a list"}
        </MenuItem>
      )}
      {saved && (
        <MenuItem
          onClick={() => {
            onClose();
            onToggleArchived();
          }}
        >
          <ListItemIcon>
            <ArchiveOutlinedIcon fontSize="small" />
          </ListItemIcon>
          {archived ? "Unarchive" : "Archive"}
        </MenuItem>
      )}
      {saved && (
        <MenuItem
          onClick={() => {
            onClose();
            onHistory();
          }}
        >
          <ListItemIcon>
            <HistoryIcon fontSize="small" />
          </ListItemIcon>
          History
        </MenuItem>
      )}
      {onDelete && <Divider />}
      {onDelete && (
        <MenuItem
          onClick={() => {
            onClose();
            onDelete();
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon sx={{ color: "inherit" }}>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          Move to Trash
        </MenuItem>
      )}
    </Menu>
  );
}
