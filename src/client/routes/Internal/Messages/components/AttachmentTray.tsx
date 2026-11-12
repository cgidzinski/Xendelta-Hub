import { Box, IconButton, LinearProgress, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { formatFileSize } from "../../../../utils/fileUtils";
import type { PendingAttachment } from "../../../../hooks/chat/useChatAttachments";

/** The files about to be sent: progress while they upload, an error (with the reason) if one can't be stored. */
export default function AttachmentTray({
  items,
  onRemove,
}: {
  items: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", p: 0.75 }}>
      {items.map((item) => {
        const error = item.status === "error";
        return (
          <Box
            key={item.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              width: { xs: "100%", sm: 250 },
              px: 1.25,
              py: 0.75,
              border: 1,
              borderColor: error ? "warning.main" : "divider",
              borderRadius: 2,
              bgcolor: "background.default",
            }}
          >
            {error ? (
              <ErrorOutlineIcon color="warning" fontSize="small" />
            ) : (
              <InsertDriveFileOutlinedIcon fontSize="small" color="action" />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {item.name}
              </Typography>
              {item.status === "uploading" && (
                <>
                  <LinearProgress
                    variant="determinate"
                    value={item.percent}
                    sx={{ my: 0.5, height: 4, borderRadius: 2 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {Math.round(item.percent)}% · {formatFileSize(item.size)}
                  </Typography>
                </>
              )}
              {item.status === "ready" && (
                <Typography variant="caption" color="text.secondary">
                  {formatFileSize(item.size)}
                  {item.fromDrive ? " · from XenDrive" : ""}
                </Typography>
              )}
              {error && (
                <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>
                  {item.error}
                </Typography>
              )}
            </Box>
            <IconButton size="small" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        );
      })}
    </Box>
  );
}
