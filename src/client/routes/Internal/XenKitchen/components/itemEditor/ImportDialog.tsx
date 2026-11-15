import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import LinkIcon from "@mui/icons-material/Link";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import { MAX_RECIPE_SCAN_PHOTOS } from "@shared/xenkitchen/kitchen";
import { COST_CENTERS, billedRate, formatGems } from "@shared/billing";

/** What reading one recipe photo (or a few pages of one recipe) costs, from the live price. */
const SCAN_GEMS = billedRate(COST_CENTERS.find((c) => c.id === "recipe_scans")!);
import ResponsiveDialog from "../../../../../components/ui/ResponsiveDialog";
import { RADIUS } from "../../../../../theme";
import {
  useImportKitchenRecipe,
  useImportKitchenRecipeFromPhoto,
  usePhotoImportEnabled,
  type ImportedKitchenRecipe,
} from "../../../../../hooks/xenkitchen/useKitchen";

export type ImportMode = "url" | "photo";

interface ImportDialogProps {
  open: boolean;
  /** Which way to start: a web address or photos. */
  mode?: ImportMode;
  /** A web address to read straight away (pasted into the recipe's name). */
  initialUrl?: string;
  onClose: () => void;
  /** The recipe that was read, and the first photo it was read from (so it can become the item's picture). */
  onImported: (recipe: ImportedKitchenRecipe, photo?: File) => void;
}

const isWebAddress = (text: string) => /^https?:\/\/\S+$/i.test(text.trim());

/**
 * Fill the editor from a recipe somewhere else: its web address, or photos of it (a recipe card, a few cookbook
 * pages). Either way nothing is saved — the editor opens with the result for a person to check and change.
 */
export function ImportDialog({ open, mode = "url", initialUrl, onClose, onImported }: ImportDialogProps) {
  const photoImport = usePhotoImportEnabled();
  const importUrl = useImportKitchenRecipe();
  const importPhoto = useImportKitchenRecipeFromPhoto();
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState<ImportMode>(mode);
  const [url, setUrl] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const error = (importUrl.error ?? importPhoto.error) as (Error & { message: string }) | null;
  const busy = importUrl.isPending || importPhoto.isPending;
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  const previews = useMemo(() => photos.map((file) => URL.createObjectURL(file)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const readUrl = (address: string) => {
    if (!address.trim() || busy) return;
    importPhoto.reset();
    importUrl.mutate(address.trim(), {
      onSuccess: (recipe) => {
        onImported(recipe);
        reset();
        onClose();
      },
    });
  };

  // Each time it opens: start on the asked-for way in, and read a pasted address at once.
  useEffect(() => {
    if (!open) return;
    setTab(mode === "photo" && photoImport ? "photo" : "url");
    if (initialUrl) {
      setUrl(initialUrl);
      readUrl(initialUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = () => {
    importUrl.reset();
    importPhoto.reset();
    setUrl("");
    setPhotos([]);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const picked = [...files].filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    const room = MAX_RECIPE_SCAN_PHOTOS - photos.length;
    if (picked.length > room)
      enqueueSnackbar(`Up to ${MAX_RECIPE_SCAN_PHOTOS} photos of one recipe`, { variant: "info" });
    if (picked.length) {
      importPhoto.reset();
      setPhotos((prev) => [...prev, ...picked.slice(0, room)]);
    }
  };

  const readPhotos = () => {
    if (!photos.length || busy) return;
    importUrl.reset();
    importPhoto.mutate(photos, {
      onSuccess: (recipe) => {
        onImported(recipe, photos[0]);
        enqueueSnackbar("Recipe read. Have a look, then save it.", { variant: "success" });
        reset();
        onClose();
      },
    });
  };

  const pasteFromClipboard = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) setUrl(text);
      if (isWebAddress(text)) readUrl(text);
    } catch {
      /* the browser said no: typing still works */
    }
  };

  const tile = {
    aspectRatio: "3 / 4",
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    position: "relative",
  } as const;

  return (
    <ResponsiveDialog
      open={open}
      onClose={close}
      title="Import a recipe"
      actions={
        <>
          <Button onClick={close} disabled={busy}>
            Cancel
          </Button>
          {tab === "url" ? (
            <Button
              type="submit"
              form="import-url-form"
              variant="contained"
              disabled={!url.trim() || busy}
              startIcon={importUrl.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {importUrl.isPending ? "Reading the page" : "Import"}
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={readPhotos}
              disabled={!photos.length || busy}
              startIcon={importPhoto.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {importPhoto.isPending
                ? "Reading"
                : photos.length > 1
                  ? `Read ${photos.length} photos`
                  : "Read the photo"}
            </Button>
          )}
        </>
      }
    >
      {photoImport && (
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          color="primary"
          value={tab}
          onChange={(_e, value: ImportMode | null) => value && !busy && setTab(value)}
          sx={{ mb: 2.5 }}
        >
          <ToggleButton value="url" sx={{ gap: 1, textTransform: "none" }}>
            <LinkIcon fontSize="small" />
            From a link
          </ToggleButton>
          <ToggleButton value="photo" sx={{ gap: 1, textTransform: "none" }}>
            <PhotoCameraOutlinedIcon fontSize="small" />
            From photos
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      {tab === "url" && (
        <form
          id="import-url-form"
          onSubmit={(e) => {
            e.preventDefault();
            readUrl(url);
          }}
        >
          <TextField
            autoFocus
            fullWidth
            type="url"
            label="Recipe page address"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            helperText="Works with most recipe sites. You can check and change everything before you save."
            slotProps={{
              htmlInput: { maxLength: 2000, autoComplete: "off", inputMode: "url" },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: canPaste ? (
                  <InputAdornment position="end">
                    <Tooltip title="Paste">
                      <span>
                        <IconButton edge="end" onClick={pasteFromClipboard} disabled={busy} aria-label="Paste">
                          <ContentPasteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
        </form>
      )}

      {tab === "photo" && (
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            A recipe card or a screenshot, or up to {MAX_RECIPE_SCAN_PHOTOS} pages of a cookbook in order. The words are
            read off them for you to check before saving. Reading uses about {formatGems(SCAN_GEMS)} from your free
            allowance for the month.
          </Typography>
          <Box
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!busy) addPhotos(e.dataTransfer.files);
            }}
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: `repeat(${MAX_RECIPE_SCAN_PHOTOS}, minmax(0, 1fr))`,
              borderRadius: RADIUS.xl,
              outline: dragOver ? "2px dashed" : "none",
              outlineColor: "primary.main",
              outlineOffset: 4,
            }}
          >
            {photos.map((file, i) => (
              <Box key={`${file.name}-${i}`} sx={{ ...tile, border: "1px solid", borderColor: "divider" }}>
                <Box
                  component="img"
                  src={previews[i]}
                  alt={`Page ${i + 1}`}
                  sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {photos.length > 1 && (
                  <Typography
                    variant="caption"
                    sx={{
                      position: "absolute",
                      left: 4,
                      bottom: 4,
                      px: 0.75,
                      borderRadius: RADIUS.sm,
                      fontWeight: 700,
                      color: "common.white",
                      bgcolor: (t) => alpha(t.palette.common.black, 0.6),
                    }}
                  >
                    {i + 1}
                  </Typography>
                )}
                <IconButton
                  size="small"
                  aria-label={`Remove photo ${i + 1}`}
                  disabled={busy}
                  onClick={() => {
                    importPhoto.reset();
                    setPhotos((prev) => prev.filter((_, j) => j !== i));
                  }}
                  sx={{
                    position: "absolute",
                    right: 2,
                    top: 2,
                    color: "common.white",
                    bgcolor: (t) => alpha(t.palette.common.black, 0.5),
                    "&:hover": { bgcolor: (t) => alpha(t.palette.common.black, 0.7) },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            ))}
            {photos.length < MAX_RECIPE_SCAN_PHOTOS && (
              <Box
                role="button"
                tabIndex={0}
                aria-label={photos.length ? "Add another page" : "Choose or take a photo"}
                onClick={() => !busy && fileInput.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!busy) fileInput.current?.click();
                  }
                }}
                sx={{
                  ...tile,
                  // With nothing chosen yet, the add tile is the whole drop area.
                  ...(photos.length ? {} : { gridColumn: "1 / -1", aspectRatio: "auto", minHeight: 160 }),
                  border: "2px dashed",
                  borderColor: "divider",
                  cursor: busy ? "default" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                  px: 1,
                  textAlign: "center",
                  color: "text.secondary",
                  "&:hover, &:focus-visible": busy ? {} : { borderColor: "primary.main", color: "primary.main" },
                  outline: "none",
                }}
              >
                <AddPhotoAlternateOutlinedIcon fontSize={photos.length ? "medium" : "large"} />
                <Typography variant="caption">
                  {photos.length ? "Add a page" : "Choose or take photos, or drop them here"}
                </Typography>
              </Box>
            )}
          </Box>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept="image/*"
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
          <Typography variant="caption" color="text.secondary">
            The photos are sent to Cloudflare to be read, then thrown away. The first one is kept as the recipe's
            picture only if you save it.
          </Typography>
        </Stack>
      )}

      {busy && (
        <Box sx={{ mt: 2.5 }}>
          <LinearProgress sx={{ borderRadius: RADIUS.pill }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
            {importUrl.isPending
              ? "Reading the recipe off the page…"
              : photos.length > 1
                ? `Reading ${photos.length} photos. This can take up to a minute.`
                : "Reading the photo. This can take a little while."}
          </Typography>
        </Box>
      )}

      {error && !busy && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message || "Couldn't read that recipe"}
        </Alert>
      )}
    </ResponsiveDialog>
  );
}
