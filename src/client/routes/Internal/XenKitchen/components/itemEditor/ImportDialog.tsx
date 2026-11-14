import { useState } from "react";
import { Alert, Button, CircularProgress, IconButton, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import CloseIcon from "@mui/icons-material/Close";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../../components/ui/ResponsiveDialog";
import {
  useImportKitchenRecipe,
  useImportKitchenRecipeFromPhoto,
  usePhotoImportEnabled,
  type ImportedKitchenRecipe,
} from "../../../../../hooks/xenkitchen/useKitchen";

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** The recipe that was read, and the photo it was read from (so it can become the item's picture). */
  onImported: (recipe: ImportedKitchenRecipe, photo?: File) => void;
}

/**
 * Fill the editor from a recipe somewhere else: its web address, or a photo of it (a recipe card, a cookbook page).
 * Either way nothing is saved — the editor opens with the result for a person to check and change.
 */
export function ImportDialog({ open, onClose, onImported }: ImportDialogProps) {
  const photoImport = usePhotoImportEnabled();
  const importUrl = useImportKitchenRecipe();
  const importPhoto = useImportKitchenRecipeFromPhoto();
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState<"url" | "photo">("url");
  const [url, setUrl] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const error = (importUrl.error ?? importPhoto.error) as (Error & { message: string }) | null;
  const busy = importUrl.isPending || importPhoto.isPending;

  const close = () => {
    if (busy) return;
    importUrl.reset();
    importPhoto.reset();
    setUrl("");
    setPhoto(null);
    onClose();
  };

  const submitUrl = (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim() || busy) return;
    importUrl.mutate(url.trim(), {
      onSuccess: (recipe) => {
        onImported(recipe);
        setUrl("");
        importUrl.reset();
        onClose();
      },
    });
  };

  const submitPhoto = () => {
    if (!photo || busy) return;
    importPhoto.mutate(photo, {
      onSuccess: (recipe) => {
        onImported(recipe, photo);
        enqueueSnackbar("Recipe read. Have a look, then save it.", { variant: "success" });
        setPhoto(null);
        importPhoto.reset();
        onClose();
      },
    });
  };

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
              onClick={submitPhoto}
              disabled={!photo || busy}
              startIcon={importPhoto.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {importPhoto.isPending ? "Reading the photo" : "Read the photo"}
            </Button>
          )}
        </>
      }
    >
      <Tabs value={tab} onChange={(_e, value: "url" | "photo") => setTab(value)} sx={{ mb: 2 }}>
        <Tab value="url" label="From a web address" />
        {photoImport && <Tab value="photo" label="From a photo" />}
      </Tabs>

      {tab === "url" && (
        <form id="import-url-form" onSubmit={submitUrl}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Paste the address of a recipe page. The recipe is filled in for you to check and change before you save it.
            Works with most recipe sites.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="url"
            label="Recipe page address"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 2000, autoComplete: "off", inputMode: "url" } }}
          />
        </form>
      )}

      {tab === "photo" && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Take a photo of a recipe card or a page of a cookbook, or pick a screenshot. The words are read off it and
            filled in for you to check before saving.
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" component="label" startIcon={<PhotoCameraOutlinedIcon />} disabled={busy}>
              {photo ? "Choose another" : "Choose or take a photo"}
              <input
                type="file"
                hidden
                accept="image/*"
                capture="environment"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </Button>
            {photo && (
              <IconButton size="small" aria-label="Remove the photo" onClick={() => setPhoto(null)} disabled={busy}>
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
            {photo && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {photo.name}
              </Typography>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            The photo is sent to Cloudflare to be read, then thrown away. It is only kept if you save the recipe with
            it.
          </Typography>
        </Stack>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error.message || "Couldn't read that recipe"}
        </Alert>
      )}
    </ResponsiveDialog>
  );
}
