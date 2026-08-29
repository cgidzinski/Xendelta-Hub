import { memo } from "react";
import { Box, TextField, Button, IconButton, Card, CardContent, Typography, Chip } from "@mui/material";
import { Delete as DeleteIcon, ArrowUpward as ArrowUpIcon, ArrowDownward as ArrowDownIcon } from "@mui/icons-material";
import { RecipeStep } from "../../../../types/RecipeStep";
import { useRecipaintAssets } from "../../../../hooks/recipaint/useRecipaint";
import type { StepAction } from "./RecipeForm";
import ImageGallery from "./ImageGallery";

interface StepEditorProps {
  step: RecipeStep;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dispatch: (action: StepAction) => void;
  /** Reports an image the user removed. Deleting it is the form's call, after the save lands. */
  onAssetRemoved: (url: string) => void;
}

/**
 * Fully controlled: every field reads straight from `step` and writes through `dispatch`.
 * It used to mirror each field into local state and resync from props, which fought with
 * reordering. Memoized so a keystroke in one step doesn't re-render the whole list.
 */
function StepEditor({ step, index, canMoveUp, canMoveDown, dispatch, onAssetRemoved }: StepEditorProps) {
  const { uploadAsset, isUploadingAsset } = useRecipaintAssets();

  const update = (updates: Partial<RecipeStep>) => {
    dispatch({ type: "update", index, step: { ...step, ...updates } });
  };

  const handleImageUpload = async (file: File) => {
    const result = await uploadAsset(file);
    update({ images: [...(step.images || []), result.url] });
  };

  const handleImageDelete = (url: string) => {
    onAssetRemoved(url);
    update({ images: (step.images || []).filter((u) => u !== url) });
  };

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Chip label={`Step ${index + 1}`} size="small" sx={{ borderRadius: 1, fontWeight: 600, height: "24px" }} />
          <Box>
            {canMoveUp && (
              <IconButton size="small" onClick={() => dispatch({ type: "move", index, direction: "up" })}>
                <ArrowUpIcon />
              </IconButton>
            )}
            {canMoveDown && (
              <IconButton size="small" onClick={() => dispatch({ type: "move", index, direction: "down" })}>
                <ArrowDownIcon />
              </IconButton>
            )}
            <IconButton size="small" color="error" onClick={() => dispatch({ type: "delete", index })}>
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>

        <TextField
          fullWidth
          label="Step Name"
          value={step.stepName || ""}
          onChange={(e) => update({ stepName: e.target.value })}
          size="small"
          sx={{ mb: 1.5 }}
          placeholder="e.g., Base Coat, Highlights"
        />

        <TextField
          fullWidth
          label="Method (e.g., Dry brush, Wash)"
          value={step.method || ""}
          onChange={(e) => update({ method: e.target.value })}
          size="small"
          sx={{ mb: 1.5 }}
          placeholder="e.g., Dry brush, Wash, Layering"
        />

        <TextField
          fullWidth
          label="Step Text"
          value={step.text || ""}
          onChange={(e) => update({ text: e.target.value })}
          multiline
          rows={2}
          size="small"
          sx={{ mb: 1.5 }}
        />

        <TextField
          fullWidth
          label="Paints (e.g., Citadel: ghostly green)"
          value={step.paints || ""}
          onChange={(e) => update({ paints: e.target.value })}
          size="small"
          sx={{ mb: 1.5 }}
        />

        <Box sx={{ mb: 0 }}>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            Example Images
          </Typography>
          {step.images && step.images.length > 0 && (
            <Box sx={{ mb: 1.5 }}>
              <ImageGallery images={step.images} dense onDelete={handleImageDelete} />
            </Box>
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleImageUpload(file);
              }
            }}
            style={{ display: "none" }}
            id={`step-image-upload-${index}`}
          />
          <label htmlFor={`step-image-upload-${index}`}>
            <Button variant="outlined" component="span" size="small" disabled={isUploadingAsset}>
              {isUploadingAsset ? "Uploading..." : "Add Image"}
            </Button>
          </label>
        </Box>
      </CardContent>
    </Card>
  );
}

export default memo(StepEditor);
