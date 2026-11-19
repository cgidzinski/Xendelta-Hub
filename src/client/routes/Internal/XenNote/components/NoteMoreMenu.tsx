import { ListItemIcon, Menu, MenuItem } from "@mui/material";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import HistoryIcon from "@mui/icons-material/History";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import NotesIcon from "@mui/icons-material/Notes";

interface NoteMoreMenuProps {
  anchor: HTMLElement | null;
  isList: boolean;
  /** Whether the note exists yet: archive, public link, history and delete only apply to a saved note. */
  saved: boolean;
  archived: boolean;
  onToggleList: () => void;
  onToggleArchived: () => void;
  onShare: () => void;
  onHistory: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** The editor's "more" menu: turn into a note or list, archive, public link, history, delete. */
export default function NoteMoreMenu({
  anchor,
  isList,
  saved,
  archived,
  onToggleList,
  onToggleArchived,
  onShare,
  onHistory,
  onDelete,
  onClose,
}: NoteMoreMenuProps) {
  const savedOnly = { display: saved ? "flex" : "none" };
  return (
    <Menu anchorEl={anchor} open={!!anchor} onClose={onClose}>
      <MenuItem
        onClick={() => {
          onToggleList();
          onClose();
        }}
      >
        <ListItemIcon>
          {isList ? <NotesIcon fontSize="small" /> : <CheckBoxOutlinedIcon fontSize="small" />}
        </ListItemIcon>
        {isList ? "Turn into a note" : "Turn into a list"}
      </MenuItem>
      <MenuItem
        sx={savedOnly}
        onClick={() => {
          onToggleArchived();
          onClose();
        }}
      >
        <ListItemIcon>
          <ArchiveOutlinedIcon fontSize="small" />
        </ListItemIcon>
        {archived ? "Unarchive" : "Archive"}
      </MenuItem>
      <MenuItem
        sx={savedOnly}
        onClick={() => {
          onClose();
          onShare();
        }}
      >
        <ListItemIcon>
          <ShareOutlinedIcon fontSize="small" />
        </ListItemIcon>
        Share
      </MenuItem>
      <MenuItem
        sx={savedOnly}
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
      <MenuItem
        onClick={() => {
          onClose();
          onDelete();
        }}
        sx={{ color: "error.main", ...savedOnly }}
      >
        <ListItemIcon sx={{ color: "inherit" }}>
          <DeleteOutlineIcon fontSize="small" />
        </ListItemIcon>
        Delete
      </MenuItem>
    </Menu>
  );
}
