import { Box, IconButton, InputBase, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";

interface NoteTitleRowProps {
  title: string;
  pinned: boolean;
  readOnly: boolean;
  onTitle: (title: string) => void;
  onTogglePin: () => void;
  onMore: (anchor: HTMLElement) => void;
  onClose: () => void;
}

/** The note's title, with pin and "more" beside it (just a close button when the note is view-only). */
export default function NoteTitleRow({
  title,
  pinned,
  readOnly,
  onTitle,
  onTogglePin,
  onMore,
  onClose,
}: NoteTitleRowProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, pl: 3, pr: 1, pt: 1.5 }}>
      <InputBase
        fullWidth
        placeholder="Title"
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        readOnly={readOnly}
        slotProps={{ input: { maxLength: 200, "aria-label": "Title" } }}
        sx={{ fontSize: { xs: 26, sm: 32 }, fontWeight: 600 }}
      />
      {readOnly ? (
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      ) : (
        <>
          <Tooltip title={pinned ? "Unpin" : "Pin"}>
            <IconButton aria-label={pinned ? "Unpin" : "Pin"} aria-pressed={pinned} onClick={onTogglePin}>
              {pinned ? <PushPinIcon color="primary" /> : <PushPinOutlinedIcon />}
            </IconButton>
          </Tooltip>
          <Tooltip title="More">
            <IconButton aria-label="More" onClick={(e) => onMore(e.currentTarget)}>
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Box>
  );
}
