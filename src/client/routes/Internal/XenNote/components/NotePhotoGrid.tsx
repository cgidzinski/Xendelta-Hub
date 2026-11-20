import { useEffect, useMemo } from "react";
import { Box, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { overlayButtonSx } from "../../../../components/ui/surfaceStyles";
import type { XenNoteImage } from "../../../../types/XenNote";

interface NotePhotoGridProps {
  /** Photos already saved on the note. */
  images: XenNoteImage[];
  /** Photos chosen for a note that is not saved yet. */
  pendingImages: File[];
  readOnly: boolean;
  onRemoveSaved: (imageId: string) => void;
  onRemovePending: (index: number) => void;
}

const thumbSx = { width: 96, height: 96, objectFit: "cover", borderRadius: 1, display: "block" } as const;
// A light button over the photo that gets lighter on hover, never see-through (the design language's button-over-image style).
const removeSx = { position: "absolute", top: 4, right: 4, ...overlayButtonSx.light } as const;

/** The note's photos, saved and not yet saved, each with a remove button. */
export default function NotePhotoGrid({
  images,
  pendingImages,
  readOnly,
  onRemoveSaved,
  onRemovePending,
}: NotePhotoGridProps) {
  const pendingUrls = useMemo(() => pendingImages.map((f) => URL.createObjectURL(f)), [pendingImages]);
  useEffect(() => () => pendingUrls.forEach((u) => URL.revokeObjectURL(u)), [pendingUrls]);

  return (
    <Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
        {images.map((img) => (
          <Box key={img._id} sx={{ position: "relative" }}>
            <Box component="img" src={img.thumbUrl ?? img.url} alt="" sx={thumbSx} />
            {!readOnly && (
              <IconButton size="small" aria-label="Remove photo" onClick={() => onRemoveSaved(img._id)} sx={removeSx}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}
        {pendingUrls.map((url, i) => (
          <Box key={url} sx={{ position: "relative" }}>
            <Box component="img" src={url} alt="" sx={thumbSx} />
            <IconButton size="small" aria-label="Remove photo" onClick={() => onRemovePending(i)} sx={removeSx}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
