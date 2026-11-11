import { Box, LinearProgress, Typography } from "@mui/material";

interface UploadProgressProps {
  /** 0-100, or null when no upload is running (renders nothing). */
  percent: number | null;
  /** What is being uploaded, e.g. "photos". */
  label?: string;
}

/**
 * Determinate progress bar for an upload. At 100% the bytes have left the device but the server
 * is still storing them, so it switches to an indeterminate "Processing..." instead of sitting
 * at 100% and looking frozen.
 */
export default function UploadProgress({ percent, label = "files" }: UploadProgressProps) {
  if (percent === null) return null;
  const sending = percent < 100;
  return (
    <Box role="status" aria-live="polite" sx={{ width: "100%" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {sending ? `Uploading ${label}…` : "Processing…"}
        </Typography>
        {sending && (
          <Typography variant="caption" color="text.secondary">
            {percent}%
          </Typography>
        )}
      </Box>
      <LinearProgress
        variant={sending ? "determinate" : "indeterminate"}
        value={percent}
        aria-label={`Uploading ${label}`}
        sx={{ borderRadius: 1, height: 6 }}
      />
    </Box>
  );
}
