import { useState, useEffect } from "react";
import { Box, TextField, Button, IconButton, Card, CardContent, Typography, Chip } from "@mui/material";
import { Delete as DeleteIcon, ArrowUpward as ArrowUpIcon, ArrowDownward as ArrowDownIcon } from "@mui/icons-material";
import { RecipeStep } from "../../../../types/RecipeStep";
import { useRecipaintAssets } from "../../../../hooks/recipaint/useRecipaint";
import ImageGallery from "./ImageGallery";

interface StepEditorProps {
  step: RecipeStep;
  index: number;
  onUpdate: (stepData: RecipeStep) => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

export default function StepEditor({
  step,
  index,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: StepEditorProps) {
  const [text, setText] = useState(step.text || "");
  const [stepName, setStepName] = useState(step.stepName || "");
  const [method, setMethod] = useState(step.method || "");
  const [paints, setPaints] = useState(step.paints || "");
  const [images, setImages] = useState<string[]>(step.images || []);
  const { uploadAsset, isUploadingAsset, deleteAsset } = useRecipaintAssets();

  // Sync state when step changes (e.g., after reordering)
  useEffect(() => {
    setText(step.text || "");
    setStepName(step.stepName || "");
    setMethod(step.method || "");
    setPaints(step.paints || "");
    setImages(step.images || []);
  }, [step.text, step.stepName, step.method, step.paints, step.images, step.index]);

  const updateStep = (updates: Partial<RecipeStep>) => {
    const updatedStep: RecipeStep = {
      index,
      stepName: updates.stepName !== undefined ? updates.stepName : stepName,
      method: updates.method !== undefined ? updates.method : method,
      text: updates.text !== undefined ? updates.text : text,
      paints: updates.paints !== undefined ? updates.paints : paints,
      images: updates.images !== undefined ? updates.images : images,
    };
    onUpdate(updatedStep);
  };

  const handleImageUpload = async (file: File) => {
    const result = await uploadAsset(file);
    const newImages = [...images, result.url];
    setImages(newImages);
    updateStep({ images: newImages });
  };

  const handleImageDelete = (url: string) => {
    deleteAsset(url);
    const newImages = images.filter((u) => u !== url);
    setImages(newImages);
    updateStep({ images: newImages });
  };

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Chip
            label={`Step ${index + 1}`}
            size="small"
            sx={{
              borderRadius: 1,
              fontWeight: 600,
              height: "24px",
            }}
          />
          <Box>
            {onMoveUp && (
              <IconButton size="small" onClick={onMoveUp}>
                <ArrowUpIcon />
              </IconButton>
            )}
            {onMoveDown && (
              <IconButton size="small" onClick={onMoveDown}>
                <ArrowDownIcon />
              </IconButton>
            )}
            <IconButton size="small" color="error" onClick={onDelete}>
              <DeleteIcon />
            </IconButton>
          </Box>
        </Box>

        <TextField
          fullWidth
          label="Step Name"
          value={stepName}
          onChange={(e) => {
            const newValue = e.target.value;
            setStepName(newValue);
            updateStep({ stepName: newValue });
          }}
          size="small"
          sx={{ mb: 1.5 }}
          placeholder="e.g., Base Coat, Highlights"
        />

        <TextField
          fullWidth
          label="Method (e.g., Dry brush, Wash)"
          value={method}
          onChange={(e) => {
            const newValue = e.target.value;
            setMethod(newValue);
            updateStep({ method: newValue });
          }}
          size="small"
          sx={{ mb: 1.5 }}
          placeholder="e.g., Dry brush, Wash, Layering"
        />

        <TextField
          fullWidth
          label="Step Text"
          value={text}
          onChange={(e) => {
            const newValue = e.target.value;
            setText(newValue);
            updateStep({ text: newValue });
          }}
          multiline
          rows={2}
          size="small"
          sx={{ mb: 1.5 }}
        />

        <TextField
          fullWidth
          label="Paints (e.g., Citadel: ghostly green)"
          value={paints}
          onChange={(e) => {
            const newValue = e.target.value;
            setPaints(newValue);
            updateStep({ paints: newValue });
          }}
          size="small"
          sx={{ mb: 1.5 }}
        />

        <Box sx={{ mb: 0 }}>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            Example Images
          </Typography>
          {images.length > 0 && (
            <Box sx={{ mb: 1.5 }}>
              <ImageGallery images={images} dense onDelete={handleImageDelete} />
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
