import { useRef, useState } from "react";
import { Box, IconButton, LinearProgress, Link, Menu, MenuItem, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import PollOutlinedIcon from "@mui/icons-material/PollOutlined";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import { formatFileSize } from "../../../../utils/fileUtils";

interface AttachButtonProps {
  onFiles: (files: File[]) => void;
  onChooseFromDrive: () => void;
  /** Start a poll (the menu item is shown when this is given). */
  onPoll?: () => void;
}

/** The paperclip: upload from this device, or choose from XenDrive, with how much storage you have left. */
export default function AttachButton({ onFiles, onChooseFromDrive, onPoll }: AttachButtonProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { profile } = useUserProfile();
  const usage = profile?.xendrive;
  const percent = usage && usage.spaceAllowed > 0 ? Math.min(100, (usage.spaceUsed / usage.spaceAllowed) * 100) : 0;

  return (
    <>
      <IconButton
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Attach"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
      >
        <AttachFileIcon />
      </IconButton>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <MenuItem
          onClick={() => {
            setAnchor(null);
            input.current?.click();
          }}
        >
          <FileUploadOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} />
          <Box>
            <Typography variant="body2">Upload from this device</Typography>
            <Typography variant="caption" color="text.secondary">
              Kept in XenDrive › From apps, not in My Drive
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onChooseFromDrive();
          }}
        >
          <FolderOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} />
          <Box>
            <Typography variant="body2">Choose from XenDrive</Typography>
            <Typography variant="caption" color="text.secondary">
              No extra storage used
            </Typography>
          </Box>
        </MenuItem>
        {onPoll && (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              onPoll();
            }}
          >
            <PollOutlinedIcon fontSize="small" sx={{ mr: 1.5 }} />
            <Box>
              <Typography variant="body2">Create a poll</Typography>
              <Typography variant="caption" color="text.secondary">
                Ask a question and let people vote
              </Typography>
            </Box>
          </MenuItem>
        )}
        {usage && (
          <Box sx={{ px: 2, pt: 1, pb: 1, borderTop: 1, borderColor: "divider", mt: 0.5, minWidth: 260 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="caption" color="text.secondary">
                Your storage
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatFileSize(usage.spaceUsed)} of {formatFileSize(usage.spaceAllowed)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={percent}
              color={percent > 90 ? "error" : "primary"}
              sx={{ mt: 0.75, height: 6, borderRadius: 3 }}
            />
            {percent > 75 && (
              <Link component={RouterLink} to="/internal/shop" variant="caption" underline="hover">
                Get more in the Shop
              </Link>
            )}
          </Box>
        )}
      </Menu>
    </>
  );
}
