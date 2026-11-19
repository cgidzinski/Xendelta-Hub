import { useRef } from "react";
import { Box } from "@mui/material";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import { clickableRowProps } from "../../utils/keyboard";

interface PWAImageCaptureProps {
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const tileStyle = {
  width: 80,
  height: 80,
  flexShrink: 0,
  border: "2px dashed",
  borderColor: "divider",
  borderRadius: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "text.secondary",
  "&:hover": { borderColor: "primary.main", color: "primary.main" },
  transition: "all 0.2s",
} as const;

export default function PWAImageCapture({ onChange }: PWAImageCaptureProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={onChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={onChange}
      />

      <Box {...clickableRowProps(() => cameraInputRef.current?.click())} aria-label="Take a photo" sx={tileStyle}>
        <CameraAltIcon />
      </Box>

      <Box
        {...clickableRowProps(() => galleryInputRef.current?.click())}
        aria-label="Choose from gallery"
        sx={tileStyle}
      >
        <AddPhotoAlternateIcon />
      </Box>
    </>
  );
}
