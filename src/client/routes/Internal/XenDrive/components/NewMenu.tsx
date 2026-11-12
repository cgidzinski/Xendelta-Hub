import { ListItemIcon, ListItemText, Menu, MenuItem } from "@mui/material";
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import { useDrive } from "./DriveContext";

interface NewMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  anchorOrigin?: { vertical: "top" | "bottom"; horizontal: "left" | "right" };
  transformOrigin?: { vertical: "top" | "bottom"; horizontal: "left" | "right" };
}

/** What you can add: files (into the folder you are looking at) or a folder. */
export default function NewMenu({ anchorEl, onClose, anchorOrigin, transformOrigin }: NewMenuProps) {
  const { pickFiles, target, requestNewFolder } = useDrive();
  return (
    <Menu
      anchorEl={anchorEl}
      open={!!anchorEl}
      onClose={onClose}
      anchorOrigin={anchorOrigin}
      transformOrigin={transformOrigin}
    >
      <MenuItem
        onClick={() => {
          onClose();
          pickFiles(target.folderId);
        }}
        sx={{ minWidth: 220 }}
      >
        <ListItemIcon>
          <FileUploadOutlinedIcon />
        </ListItemIcon>
        <ListItemText>Upload files</ListItemText>
      </MenuItem>
      <MenuItem
        onClick={() => {
          onClose();
          requestNewFolder();
        }}
      >
        <ListItemIcon>
          <CreateNewFolderOutlinedIcon />
        </ListItemIcon>
        <ListItemText>New folder</ListItemText>
      </MenuItem>
    </Menu>
  );
}
