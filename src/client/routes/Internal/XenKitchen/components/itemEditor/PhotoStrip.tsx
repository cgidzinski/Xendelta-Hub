import { useRef, useState } from "react";
import { Box, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import AddPhotoAlternateIcon from "@mui/icons-material/AddPhotoAlternate";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import StarIcon from "@mui/icons-material/Star";

import { RADIUS } from "../../../../../theme";
import { type KitchenItem } from "../../../../../hooks/xenkitchen/useKitchen";

// ---------- photos ----------

export function PhotoStrip({
  photos,
  newFiles,
  accent,
  canAdd,
  onAdd,
  onRemovePhoto,
  onCoverPhoto,
  onRemoveNew,
  hint,
  wrap = false,
}: {
  photos: KitchenItem["images"];
  newFiles: Array<{ key: string; url: string }>;
  accent: string;
  canAdd: boolean;
  onAdd: (files: FileList | null) => void;
  onRemovePhoto: (id: string) => void;
  onCoverPhoto: (id: string) => void;
  onRemoveNew: (key: string) => void;
  hint: string;
  /** Wrap onto rows of three for a narrow column (the desktop sidebar) instead of scrolling sideways. */
  wrap?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const all = [
    ...photos.map((p) => ({ key: p._id, url: p.url, thumbUrl: p.thumbUrl, existing: true })),
    ...newFiles.map((f) => ({ key: f.key, url: f.url, thumbUrl: null, existing: false })),
  ];

  const tile = wrap
    ? ({ width: "100%", aspectRatio: "1", borderRadius: RADIUS.lg } as const)
    : ({ width: 88, height: 88, borderRadius: RADIUS.lg, flexShrink: 0 } as const);

  return (
    <Box
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onAdd(e.dataTransfer.files);
      }}
      sx={{ borderRadius: RADIUS.xl, outline: dragOver ? `2px dashed ${accent}` : "none", outlineOffset: 4 }}
    >
      <Box
        sx={
          wrap
            ? { display: "grid", gap: 1, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }
            : { display: "flex", gap: 1, overflowX: "auto", pb: 1 }
        }
      >
        {all.map((p, i) => (
          <Box key={p.key} sx={{ ...tile, position: "relative" }}>
            <Box
              component="img"
              src={p.thumbUrl ?? p.url}
              alt=""
              sx={{ ...tile, height: "100%", objectFit: "cover", display: "block" }}
            />
            {i === 0 && (
              <Chip
                size="small"
                icon={<StarIcon sx={{ fontSize: 14 }} />}
                label="Cover"
                sx={{
                  position: "absolute",
                  left: 4,
                  bottom: 4,
                  height: 22,
                  bgcolor: (t) => alpha(t.palette.common.black, 0.6),
                  color: "common.white",
                  "& .MuiChip-icon": { color: "warning.light" },
                }}
              />
            )}
            {!p.existing && (
              <Chip
                size="small"
                label="New"
                sx={{ position: "absolute", left: 4, top: 4, height: 20, bgcolor: accent, color: "common.white" }}
              />
            )}
            <Stack direction="row" sx={{ position: "absolute", right: 2, top: 2 }}>
              {p.existing && i !== 0 && (
                <Tooltip title="Make cover">
                  <IconButton
                    size="small"
                    onClick={() => onCoverPhoto(p.key)}
                    sx={{
                      bgcolor: (t) => alpha(t.palette.common.black, 0.5),
                      color: "common.white",
                      "&:hover": { bgcolor: (t) => alpha(t.palette.common.black, 0.7) },
                      mr: 0.5,
                    }}
                  >
                    <StarIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Remove">
                <IconButton
                  size="small"
                  onClick={() => (p.existing ? onRemovePhoto(p.key) : onRemoveNew(p.key))}
                  sx={{
                    bgcolor: (t) => alpha(t.palette.common.black, 0.5),
                    color: "common.white",
                    "&:hover": { bgcolor: (t) => alpha(t.palette.common.black, 0.7) },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        ))}
        {canAdd && (
          <>
            <Box
              role="button"
              onClick={() => fileInput.current?.click()}
              sx={{
                ...tile,
                border: "2px dashed",
                borderColor: "divider",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5,
                color: "text.secondary",
                textAlign: "center",
                px: 1,
                "&:hover": { borderColor: accent, color: accent },
              }}
            >
              <AddPhotoAlternateIcon />
              <Typography variant="caption">{all.length ? "Add more" : hint}</Typography>
            </Box>
            <Box
              role="button"
              onClick={() => cameraInput.current?.click()}
              sx={{
                ...tile,
                border: "2px dashed",
                borderColor: "divider",
                cursor: "pointer",
                display: { xs: "flex", md: "none" },
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5,
                color: "text.secondary",
                "&:hover": { borderColor: accent, color: accent },
              }}
            >
              <PhotoCameraIcon />
              <Typography variant="caption">Camera</Typography>
            </Box>
          </>
        )}
      </Box>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
    </Box>
  );
}
