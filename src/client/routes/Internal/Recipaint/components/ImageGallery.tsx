import { useState } from "react";
import { Box, Dialog, IconButton, useMediaQuery, useTheme } from "@mui/material";
import {
  Close as CloseIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";

interface ImageGalleryProps {
  images: string[];
  dense?: boolean; // If true, uses 128x128 instead of default size
  onDelete?: (imageUrl: string) => void; // Optional delete handler
}

export default function ImageGallery({ images, dense = false, onDelete }: ImageGalleryProps) {
  const finalImageSize = dense ? 128 : 256;
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  if (!images || images.length === 0) {
    return null;
  }

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  const handlePrevious = () => {
    setSelectedIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setSelectedIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          flexDirection: "row",
          gap: 2,
          justifyContent: "flex-start",
          alignItems: "flex-start",
        }}
      >
        {images.map((image, index) => (
          <Box
            key={index}
            sx={{
              width: `${finalImageSize}px`,
              height: `${finalImageSize}px`,
              flexShrink: 0,
              borderRadius: "8px",
              overflow: "hidden",
              cursor: "pointer",
              position: "relative",
              "&:hover": {
                opacity: 0.8,
              },
            }}
            onClick={() => handleImageClick(index)}
          >
            <img
              src={image}
              alt={`Image ${index + 1}`}
              loading="lazy"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "8px",
              }}
            />
            {onDelete && (
              <IconButton
                size="small"
                color="error"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(image);
                }}
                sx={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  zIndex: 1,
                  backgroundColor: "rgba(0,0,0,0.5)",
                  "&:hover": {
                    backgroundColor: "rgba(0,0,0,0.7)",
                  },
                }}
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
        PaperProps={{
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
        }}
      >
        <IconButton
          onClick={handleClose}
          sx={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 1,
            color: "white",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            "&:hover": {
              backgroundColor: "rgba(0, 0, 0, 0.7)",
            },
          }}
        >
          <CloseIcon />
        </IconButton>

        {images.length > 1 && (
          <>
            <IconButton
              onClick={handlePrevious}
              sx={{
                position: "absolute",
                left: 16,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 1,
                color: "white",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.7)",
                },
              }}
            >
              <ChevronLeftIcon />
            </IconButton>
            <IconButton
              onClick={handleNext}
              sx={{
                position: "absolute",
                right: 16,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 1,
                color: "white",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.7)",
                },
              }}
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
          <img
            src={images[selectedIndex]}
            alt={`Image ${selectedIndex + 1}`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              borderRadius: "8px",
            }}
            onClick={handleClose}
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
            {images.map((_, index) => (
              <Box
                key={index}
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
