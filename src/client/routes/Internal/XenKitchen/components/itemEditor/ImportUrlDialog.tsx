import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { useImportKitchenRecipe, type ImportedKitchenRecipe } from "../../../../../hooks/xenkitchen/useKitchen";

interface ImportUrlDialogProps {
  open: boolean;
  onClose: () => void;
  /** The recipe found on the page, to fill the editor with. */
  onImported: (recipe: ImportedKitchenRecipe) => void;
}

/** Paste a recipe page's address; the server reads the recipe from it and the editor opens it for review. */
export function ImportUrlDialog({ open, onClose, onImported }: ImportUrlDialogProps) {
  const [url, setUrl] = useState("");
  const importRecipe = useImportKitchenRecipe();
  const error = importRecipe.error as (Error & { message: string }) | null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim() || importRecipe.isPending) return;
    importRecipe.mutate(url.trim(), {
      onSuccess: (recipe) => {
        onImported(recipe);
        setUrl("");
        importRecipe.reset();
        onClose();
      },
    });
  };

  const close = () => {
    if (importRecipe.isPending) return;
    importRecipe.reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={submit}>
        <DialogTitle>Import from a web address</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Paste the address of a recipe page. The recipe is filled in below for you to check and change before you
            save it. Works with most recipe sites.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            type="url"
            label="Recipe page address"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={importRecipe.isPending}
            slotProps={{ htmlInput: { maxLength: 2000, autoComplete: "off", inputMode: "url" } }}
          />
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error.message || "Couldn't import that page"}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={importRecipe.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!url.trim() || importRecipe.isPending}
            startIcon={importRecipe.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {importRecipe.isPending ? "Reading the page" : "Import"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
