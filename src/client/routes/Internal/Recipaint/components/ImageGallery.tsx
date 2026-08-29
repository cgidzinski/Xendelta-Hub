import { useCallback, useEffect, useState } from "react";
import { Box, Dialog, IconButton, useMediaQuery, useTheme } from "@mui/material";
import { thumbUrlFor } from "../../../../../shared/recipaint/assetUrls";
import {
  Close as CloseIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";

interface ImageGalleryProps {
  images: string[];
  dense?: boolean; // Smaller tiles, for step-level galleries
  onDelete?: (imageUrl: string) => void;
}

const overlayButtonSx = {
  zIndex: 1,
  color: "white",
  backgroundColor: "rgba(0, 0, 0, 0.5)",
  "&:hover": { backgroundColor: "rgba(0, 0, 0, 0.7)" },
};

export default function ImageGallery({ images, dense = false, onDelete }: ImageGalleryProps) {
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  const handleClose = useCallback(() => setOpen(false), []);
  const handlePrevious = useCallback(
    () => setSelectedIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1)),
    [images.length],
  );
  const handleNext = useCallback(
    () => setSelectedIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1)),
    [images.length],
  );

  // Arrow keys page through the lightbox; MUI's Dialog only gives us Escape for free.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrevious();
      else if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handlePrevious, handleNext]);

  if (!images || images.length === 0) {
    return null;
  }

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
    setOpen(true);
  };

  return (
    <>
      <Box
        sx={{
          // Fluid tracks bounded on both ends: tiles never overflow a narrow phone and
          // never blow up to fill a wide desktop.
          display: "grid",
          gridTemplateColumns: dense
            ? "repeat(auto-fill, minmax(88px, 128px))"
            : "repeat(auto-fill, minmax(150px, 256px))",
          gap: 2,
        }}
      >
        {images.map((image, index) => (
          <Box
            key={`${image}-${index}`}
            sx={{
              position: "relative",
              aspectRatio: "1 / 1",
              borderRadius: 2,
              overflow: "hidden",
              cursor: "pointer",
              "&:hover": { opacity: 0.85 },
            }}
            onClick={() => handleImageClick(index)}
          >
            <Box
              component="img"
              src={thumbUrlFor(image)}
              alt={`Image ${index + 1}`}
              loading="lazy"
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            {onDelete && (
              <IconButton
                size="small"
                color="error"
                aria-label="Remove image"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(image);
                }}
                sx={{ position: "absolute", top: 4, right: 4, ...overlayButtonSx }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}
      </Box>

      <Dialog
        open={open}
        onClose={handleClose}
        fullScreen={fullScreen}
        maxWidth={false}
        slotProps={{
          paper: {
            sx: {
              backgroundColor: "rgba(0, 0, 0, 0.9)",
              position: "relative",
              margin: 0,
              maxWidth: "100vw",
              maxHeight: "100vh",
              width: "100%",
              height: "100%",
              overflow: "hidden",
            },
          },
        }}
      >
        <IconButton onClick={handleClose} aria-label="Close" sx={{ position: "absolute", top: 16, right: 16, ...overlayButtonSx }}>
          <CloseIcon />
        </IconButton>

        {images.length > 1 && (
          <>
            <IconButton
              onClick={handlePrevious}
              aria-label="Previous image"
              sx={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", ...overlayButtonSx }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              onClick={handleNext}
              aria-label="Next image"
              sx={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", ...overlayButtonSx }}
            >
              <ChevronRightIcon />
            </IconButton>
          </>
        )}

        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            height: "100%",
            p: 4,
            boxSizing: "border-box",
            overflow: "hidden",
          }}
          onClick={handleClose}
        >
          <Box
            component="img"
            src={images[selectedIndex]}
            alt={`Image ${selectedIndex + 1}`}
            sx={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 2 }}
          />
        </Box>

        {images.length > 1 && (
          <Box
            sx={{
              position: "absolute",
              bottom: 16,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              gap: 1,
              zIndex: 1,
            }}
          >
            {images.map((image, index) => (
              <Box
                key={`${image}-${index}`}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: index === selectedIndex ? "white" : "rgba(255, 255, 255, 0.5)",
                  cursor: "pointer",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIndex(index);
                }}
              />
            ))}
          </Box>
        )}
      </Dialog>
    </>
  );
}
