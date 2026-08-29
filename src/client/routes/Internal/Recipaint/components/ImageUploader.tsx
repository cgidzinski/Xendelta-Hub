import { useRef, useState } from "react";
import { Box, IconButton, Typography, CircularProgress, Stack } from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useSnackbar } from "notistack";
import PWAImageCapture from "../../../../pwa/components/PWAImageCapture";
import { useRecipaintAssets } from "../../../../hooks/recipaint/useRecipaint";
import { MAX_RECIPAINT_ASSET_SIZE, thumbUrlFor } from "../../../../../shared/recipaint/assetUrls";

interface ImageUploaderProps {
  images: string[];
  /** Receives the full next list - additions and reorders both come through here. */
  onChange: (next: string[]) => void;
  /** Reports a removal. The caller decides when to actually destroy the asset. */
  onRemove: (url: string) => void;
  dense?: boolean;
  hint?: string;
}

const REORDER_MIME = "application/x-recipaint-image-index";

export default function ImageUploader({ images, onChange, onRemove, dense = false, hint }: ImageUploaderProps) {
  const { uploadAsset } = useRecipaintAssets();
  const { enqueueSnackbar } = useSnackbar();
  const [pendingCount, setPendingCount] = useState(0);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragIndex = useRef<number | null>(null);
  // Uploads resolve asynchronously, so append against the newest list rather than the one
  // captured when the upload started - two overlapping batches would otherwise lose images.
  const latestImages = useRef(images);
  latestImages.current = images;

  const tile = dense ? 96 : 132;

  const uploadFiles = async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length !== files.length) {
      enqueueSnackbar("Only image files can be added", { variant: "warning" });
    }
    const withinLimit = imageFiles.filter((f) => f.size <= MAX_RECIPAINT_ASSET_SIZE);
    if (withinLimit.length !== imageFiles.length) {
      enqueueSnackbar(`Some images were over ${MAX_RECIPAINT_ASSET_SIZE / 1024 / 1024}MB and were skipped`, {
        variant: "warning",
      });
    }
    if (withinLimit.length === 0) return;

    setPendingCount((n) => n + withinLimit.length);
    const results = await Promise.allSettled(withinLimit.map((file) => uploadAsset(file)));
    setPendingCount((n) => Math.max(0, n - withinLimit.length));

    const uploaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.url] : []));
    const failed = results.length - uploaded.length;
    if (failed > 0) {
      enqueueSnackbar(`${failed} image${failed === 1 ? "" : "s"} failed to upload`, { variant: "error" });
    }
    if (uploaded.length > 0) {
      onChange([...latestImages.current, ...uploaded]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Reset so picking the same file twice in a row still fires a change event.
    e.target.value = "";
    if (files.length) uploadFiles(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    setIsDropTarget(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return; // a tile reorder, handled on the tile itself
    e.preventDefault();
    uploadFiles(files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files || []);
    if (files.length === 0) return;
    e.preventDefault();
    uploadFiles(files);
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const next = [...latestImages.current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <Box
      onDragOver={(e) => {
        // Only light up for an actual file drag, not a tile being reordered.
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setIsDropTarget(true);
        }
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={-1}
      sx={{
        border: "1px dashed",
        borderColor: isDropTarget ? "primary.main" : "divider",
        backgroundColor: isDropTarget ? "action.hover" : "transparent",
        borderRadius: 2,
        p: 1.5,
        transition: "border-color 0.15s ease, background-color 0.15s ease",
        outline: "none",
      }}
    >
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "flex-start" }}>
        {images.map((url, index) => (
          <Box
            key={`${url}-${index}`}
            draggable
            onDragStart={(e) => {
              dragIndex.current = index;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData(REORDER_MIME, String(index));
            }}
            onDragOver={(e) => {
              if (dragIndex.current !== null) e.preventDefault();
            }}
            onDrop={(e) => {
              if (dragIndex.current === null) return;
              e.preventDefault();
              e.stopPropagation();
              reorder(dragIndex.current, index);
              dragIndex.current = null;
            }}
            onDragEnd={() => {
              dragIndex.current = null;
            }}
            sx={{
              position: "relative",
              width: tile,
              height: tile,
              flexShrink: 0,
              borderRadius: 2,
              overflow: "hidden",
              cursor: "grab",
              "&:active": { cursor: "grabbing" },
              "&:hover .image-uploader-controls": { opacity: 1 },
            }}
          >
            <Box
              component="img"
              src={thumbUrlFor(url)}
              alt={`Image ${index + 1}`}
              loading="lazy"
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
            />
            <Box
              className="image-uploader-controls"
              sx={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                transition: "opacity 0.15s ease",
                background: "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.15))",
              }}
            >
              <DragIndicatorIcon sx={{ position: "absolute", top: 4, left: 4, fontSize: 18, color: "white" }} />
              <IconButton
                size="small"
                aria-label="Remove image"
                onClick={() => onRemove(url)}
                sx={{ position: "absolute", top: 0, right: 0, color: "error.light" }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        ))}

        {Array.from({ length: pendingCount }).map((_, i) => (
          <Box
            key={`pending-${i}`}
            sx={{
              width: tile,
              height: tile,
              flexShrink: 0,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress size={20} />
          </Box>
        ))}

        <Stack direction="row" spacing={1}>
          <PWAImageCapture onChange={handleInputChange} />
        </Stack>
      </Box>

      <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
        {hint || "Drop, paste or pick images. Drag a tile to reorder."}
      </Typography>
    </Box>
  );
}
