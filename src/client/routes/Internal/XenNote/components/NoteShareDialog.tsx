import { Box, Button, IconButton, TextField, Typography } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { noteShareUrl } from "../../../../hooks/xennote/useXenNote";

interface NoteShareDialogProps {
  open: boolean;
  /** The public link's token, or null when the note isn't shared. */
  token: string | null;
  onClose: () => void;
  onAction: (action: "enable" | "rotate" | "disable") => void;
}

/** Create, copy, replace or stop a note's public link. */
export default function NoteShareDialog({ open, token, onClose, onAction }: NoteShareDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  return (
    <ResponsiveDialog open={open} onClose={onClose} maxWidth="xs" title="Public link">
      {token ? (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <TextField
            size="small"
            value={noteShareUrl(token)}
            slotProps={{ input: { readOnly: true } }}
            sx={{ flex: 1, minWidth: 200 }}
          />
          <IconButton
            aria-label="Copy link"
            onClick={() => {
              navigator.clipboard.writeText(noteShareUrl(token));
              enqueueSnackbar("Link copied", { variant: "success" });
            }}
          >
            <ContentCopyIcon />
          </IconButton>
          <Button size="small" onClick={() => onAction("rotate")}>
            New link
          </Button>
          <Button size="small" color="error" onClick={() => onAction("disable")}>
            Stop sharing
          </Button>
        </Box>
      ) : (
        <Box>
          <Button variant="outlined" onClick={() => onAction("enable")}>
            Create link
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Anyone with the link can read this note.
          </Typography>
        </Box>
      )}
    </ResponsiveDialog>
  );
}
