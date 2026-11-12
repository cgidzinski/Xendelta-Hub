import { Box, Button, IconButton, LinearProgress, Paper, Typography, useMediaQuery } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FileUploadOutlinedIcon from "@mui/icons-material/FileUploadOutlined";
import { Link as RouterLink } from "react-router-dom";
import { formatFileSize } from "../../../../utils/fileUtils";
import type { UploadItem } from "../lib/uploadQueue";
import FileTypeIcon from "./FileTypeIcon";
import { useDrive } from "./DriveContext";

const subtitle = (item: UploadItem): string => {
  switch (item.status) {
    case "uploading":
      return `${formatFileSize((item.size * item.percent) / 100)} of ${formatFileSize(item.size)} · ${Math.round(item.percent)}%`;
    case "done":
      return `${formatFileSize(item.size)} · done`;
    case "failed":
      return item.error ?? "Upload failed";
    case "cancelled":
      return "Cancelled";
    default:
      return `Waiting · ${formatFileSize(item.size)}`;
  }
};

/**
 * The upload progress panel in the corner: every file with its own progress, a Retry for ones that
 * failed, and a small bar you can collapse it to. Stays while you move around the drive.
 */
export default function UploadTray() {
  const { items, summary, minimized, setMinimized, cancel, cancelAll, clear, retry } = useDrive();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  if (items.length === 0) return null;

  const close = () => (summary.running ? cancelAll() : clear());
  const placement = phone ? { left: 12, right: 12, bottom: 88 } : { right: 24, bottom: 24, width: 400 };

  if (minimized) {
    return (
      <Paper
        elevation={8}
        sx={{
          position: "fixed",
          zIndex: 1300,
          ...placement,
          ...(phone ? {} : { width: "auto" }),
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          pl: 2,
          pr: 0.75,
          height: 48,
          borderRadius: 6,
        }}
      >
        <FileUploadOutlinedIcon color="primary" fontSize="small" />
        <Typography sx={{ fontWeight: 500 }} noWrap>
          {summary.title}
        </Typography>
        {summary.running && (
          <LinearProgress
            variant="determinate"
            value={summary.percent}
            sx={{ width: 96, height: 5, borderRadius: 3 }}
          />
        )}
        <IconButton aria-label="Expand upload list" onClick={() => setMinimized(false)}>
          <ExpandLessIcon />
        </IconButton>
      </Paper>
    );
  }

  return (
    <Paper elevation={8} sx={{ position: "fixed", zIndex: 1300, ...placement, borderRadius: 3.5, overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          pl: 2.25,
          pr: 0.75,
          height: 52,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography sx={{ fontWeight: 500, flex: 1 }} noWrap>
          {summary.title}
        </Typography>
        <IconButton aria-label="Minimize upload list" onClick={() => setMinimized(true)}>
          <ExpandMoreIcon />
        </IconButton>
        <IconButton aria-label={summary.running ? "Cancel all uploads" : "Close"} onClick={close}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ maxHeight: 320, overflowY: "auto" }}>
        {items.map((item) => (
          <Box
            key={item.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 2,
              py: 1.25,
              borderBottom: 1,
              borderColor: "divider",
              "&:last-of-type": { borderBottom: 0 },
              ...(item.status === "failed" ? { bgcolor: (t) => alpha(t.palette.error.main, 0.08) } : {}),
            }}
          >
            <FileTypeIcon mimeType={item.mimeType || "application/octet-stream"} size={34} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap>{item.name}</Typography>
              <Typography
                variant="caption"
                color={item.status === "failed" ? "error" : "text.secondary"}
                sx={{ display: "block" }}
              >
                {subtitle(item)}
              </Typography>
              {item.status === "failed" && /quota/i.test(item.error ?? "") && (
                <Typography variant="caption" component={RouterLink} to="/internal/shop" sx={{ color: "primary.main" }}>
                  Get more space in the Shop
                </Typography>
              )}
              {item.status === "uploading" && (
                <LinearProgress
                  variant="determinate"
                  value={item.percent}
                  sx={{ mt: 0.75, height: 5, borderRadius: 3 }}
                />
              )}
            </Box>
            {item.status === "done" && <CheckCircleIcon color="success" fontSize="small" />}
            {item.status === "failed" && (
              <Button size="small" variant="outlined" onClick={() => retry(item.id)}>
                Retry
              </Button>
            )}
            {(item.status === "waiting" || item.status === "uploading") && (
              <IconButton size="small" aria-label={`Cancel ${item.name}`} onClick={() => cancel(item.id)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
