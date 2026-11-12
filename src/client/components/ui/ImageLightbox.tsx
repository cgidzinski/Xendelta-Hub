import { useRef } from "react";
import { Box, Dialog, IconButton, alpha } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import FileDownloadIcon from "@mui/icons-material/FileDownload";

interface ImageLightboxProps {
  /** The image to show; null keeps it closed. */
  url: string | null;
  onClose: () => void;
}

// A full-screen image viewer with a download button. On touch screens, a vertical swipe closes it.
const SWIPE_TO_CLOSE_PX = 80;

export default function ImageLightbox({ url, onClose }: ImageLightboxProps) {
  const touchStartY = useRef<number | null>(null);

  const overlayButton = {
    position: "absolute",
    top: 8,
    zIndex: 1,
    color: "common.white",
    bgcolor: (t: { palette: { common: { black: string } } }) => alpha(t.palette.common.black, 0.55),
    "&:hover": { bgcolor: (t: { palette: { common: { black: string } } }) => alpha(t.palette.common.black, 0.75) },
  } as const;

  return (
    <Dialog
      open={!!url}
      onClose={onClose}
      fullScreen
      PaperProps={{ sx: { bgcolor: "common.black", position: "relative" } }}
    >
      <Box
        sx={{ width: "100%", height: "100vh", position: "relative" }}
        onTouchStart={(e) => {
          touchStartY.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          if (touchStartY.current !== null) {
            if (Math.abs(e.changedTouches[0].clientY - touchStartY.current) > SWIPE_TO_CLOSE_PX) onClose();
            touchStartY.current = null;
          }
        }}
      >
        {url && (
          <IconButton
            component="a"
            href={url}
            download
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            aria-label="Download image"
            sx={{ ...overlayButton, right: 48 }}
          >
            <FileDownloadIcon />
          </IconButton>
        )}
        <IconButton onClick={onClose} size="small" aria-label="Close" sx={{ ...overlayButton, right: 8 }}>
          <CloseIcon />
        </IconButton>
        {url && (
          <Box
            component="img"
            src={url}
            alt=""
            sx={{ width: "100%", height: "100vh", objectFit: "contain", display: "block" }}
          />
        )}
      </Box>
    </Dialog>
  );
}
