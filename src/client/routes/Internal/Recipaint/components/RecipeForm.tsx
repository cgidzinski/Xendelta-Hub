import { useState, useEffect } from "react";
import { Box, TextField, Button, Typography, Card, CardContent, FormControlLabel, Switch } from "@mui/material";
import { Delete as DeleteIcon, Save as SaveIcon } from "@mui/icons-material";
import { Recipe } from "../../../../types/Recipe";
import { RecipeStep } from "../../../../types/RecipeStep";
import { useRecipaintAssets } from "../../../../hooks/recipaint/useRecipaint";
import StepEditor from "./StepEditor";

interface RecipeFormProps {
  recipe: Recipe;
  onSave: (data: any) => void;
  onDelete?: () => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}

export default function RecipeForm({
  recipe,
  onSave,
  onDelete,
  isSaving = false,
  isDeleting = false,
}: RecipeFormProps) {
  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description || "");
  const [showcase, setShowcase] = useState<string[]>(recipe.showcase || []);
  const [steps, setSteps] = useState<RecipeStep[]>(recipe.steps || []);
  const [isPublic, setIsPublic] = useState(recipe.isPublic || false);
  const { uploadAsset, isUploadingAsset, deleteAsset } = useRecipaintAssets();

  useEffect(() => {
    setTitle(recipe.title);
    setDescription(recipe.description || "");
    setShowcase(recipe.showcase || []);
    setSteps(recipe.steps || []);
    setIsPublic(recipe.isPublic || false);
  }, [recipe]);

  const handleShowcaseUpload = async (file: File) => {
    const result = await uploadAsset(file);
    setShowcase((prev) => [...prev, result.url]);
  };

  const handleShowcaseDelete = (url: string) => {
    deleteAsset(url);
    setShowcase((prev) => prev.filter((u) => u !== url));
  };

  const handleAddStep = () => {
    const newStep = {
      index: steps.length,
      stepName: "",
      method: "",
      images: [],
      text: "",
      paints: "",
    };
    setSteps((prev) => [...prev, newStep]);
  };

  const handleUpdateStep = (index: number, stepData: any) => {
    setSteps((prev) => {
      const newSteps = [...prev];
      newSteps[index] = stepData;
      return newSteps;
    });
  };

  const handleDeleteStep = (index: number) => {
    setSteps((prev) => {
      const newSteps = prev.filter((_, i) => i !== index);
      // Re-index steps
      return newSteps.map((step, i) => ({
        ...step,
        index: i,
      }));
    });
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    setSteps((prev) => {
      const newSteps = [...prev];
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= newSteps.length) return prev;
      [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
      // Re-index steps
      return newSteps.map((step, i) => ({
        ...step,
        index: i,
      }));
    });
  };

  const handleSave = () => {
    onSave({
      title,
      description,
      showcase,
      steps,
      isPublic,
    });
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
          }
          label="Public"
          labelPlacement="start"
        />
        <Box sx={{ display: "flex", gap: 2 }}>
          {onDelete && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={isSaving || !title.trim()}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </Box>
      </Box>
      <TextField
        fullWidth
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        sx={{ mb: 3 }}
        required
      />

      <TextField
        fullWidth
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        multiline
        rows={4}
        sx={{ mb: 3 }}
      />

      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Showcase Images
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
            {showcase.map((url, index) => (
              <Box key={index} sx={{ position: "relative" }}>
                <img
                  src={url}
                  alt={`Showcase ${index + 1}`}
                  style={{
                    width: "150px",
                    height: "150px",
                    objectFit: "cover",
                    borderRadius: "8px",
                  }}
                />
                <Button
                  size="small"
                  color="error"
                  onClick={() => handleShowcaseDelete(url)}
                  sx={{ position: "absolute", top: 0, right: 0 }}
                >
                  <DeleteIcon fontSize="small" />
                </Button>
              </Box>
            ))}
          </Box>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleShowcaseUpload(file);
              }
            }}
            style={{ display: "none" }}
            id="showcase-upload"
          />
          <label htmlFor="showcase-upload">
            <Button variant="outlined" component="span" disabled={isUploadingAsset}>
              {isUploadingAsset ? "Uploading..." : "Add Image"}
            </Button>
          </label>
        </CardContent>
      </Card>

      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Steps
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 2 }}>
            {steps.map((step, index) => (
              <StepEditor
                key={`step-${index}`}
                step={step}
                index={index}
                onUpdate={(stepData) => handleUpdateStep(index, stepData)}
                onDelete={() => handleDeleteStep(index)}
                onMoveUp={index > 0 ? () => handleMoveStep(index, "up") : undefined}
                onMoveDown={index < steps.length - 1 ? () => handleMoveStep(index, "down") : undefined}
              />
            ))}
            {steps.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No steps yet. Add your first step!
              </Typography>
            )}
          </Box>
          <Button variant="contained" onClick={handleAddStep} fullWidth>
            Add Step
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}
