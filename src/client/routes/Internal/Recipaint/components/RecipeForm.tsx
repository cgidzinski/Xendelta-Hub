import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Box, TextField, Button, Typography, Card, CardContent, FormControlLabel, Switch } from "@mui/material";
import { Delete as DeleteIcon, Save as SaveIcon } from "@mui/icons-material";
import { Recipe } from "../../../../types/Recipe";
import { RecipeStep } from "../../../../types/RecipeStep";
import { useRecipaintAssets } from "../../../../hooks/recipaint/useRecipaint";
import { cleanPaints } from "../../../../../shared/recipaint/paints";
import ImageUploader from "./ImageUploader";
import StepEditor from "./StepEditor";
import { cardSx } from "../../../../components/ui/surfaceStyles";

export interface RecipeFormData {
  title: string;
  description: string;
  showcase: string[];
  steps: RecipeStep[];
  isPublic: boolean;
}

interface RecipeFormProps {
  recipe: Recipe;
  /** Must resolve only once the recipe is persisted - removed images are destroyed after it settles. */
  onSave: (data: RecipeFormData) => Promise<unknown>;
  onDelete?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  isSaving?: boolean;
  isDeleting?: boolean;
}

type StepAction =
  | { type: "reset"; steps: RecipeStep[] }
  | { type: "add" }
  | { type: "update"; index: number; step: RecipeStep }
  | { type: "delete"; index: number }
  | { type: "move"; index: number; direction: "up" | "down" };

const emptyStep = (index: number): RecipeStep => ({
  index,
  stepName: "",
  method: "",
  images: [],
  text: "",
  paints: [],
});

// `index` is persisted on each step, so anything that shifts positions has to renumber.
const reindex = (steps: RecipeStep[]): RecipeStep[] => steps.map((step, i) => (step.index === i ? step : { ...step, index: i }));

function stepsReducer(steps: RecipeStep[], action: StepAction): RecipeStep[] {
  switch (action.type) {
    case "reset":
      return action.steps;
    case "add":
      return [...steps, emptyStep(steps.length)];
    case "update": {
      // Replace one entry so the other steps keep their object identity and memoized
      // StepEditors skip re-rendering - otherwise every keystroke re-rendered every step.
      const next = [...steps];
      next[action.index] = action.step;
      return next;
    }
    case "delete":
      return reindex(steps.filter((_, i) => i !== action.index));
    case "move": {
      const target = action.direction === "up" ? action.index - 1 : action.index + 1;
      if (target < 0 || target >= steps.length) return steps;
      const next = [...steps];
      [next[action.index], next[target]] = [next[target], next[action.index]];
      return reindex(next);
    }
  }
}

export default function RecipeForm({
  recipe,
  onSave,
  onDelete,
  onDirtyChange,
  isSaving = false,
  isDeleting = false,
}: RecipeFormProps) {
  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description || "");
  const [showcase, setShowcase] = useState<string[]>(recipe.showcase || []);
  const [steps, dispatchSteps] = useReducer(stepsReducer, recipe.steps || []);
  const [isPublic, setIsPublic] = useState(recipe.isPublic || false);
  const { deleteAsset } = useRecipaintAssets();

  // Images the user removed in this editing session. They are only destroyed once the
  // save lands: deleting on click meant abandoning the edit left the saved recipe
  // pointing at an object that no longer exists, i.e. a permanently broken image.
  const pendingDeletions = useRef<string[]>([]);

  useEffect(() => {
    setTitle(recipe.title);
    setDescription(recipe.description || "");
    setShowcase(recipe.showcase || []);
    dispatchSteps({ type: "reset", steps: recipe.steps || [] });
    setIsPublic(recipe.isPublic || false);
    pendingDeletions.current = [];
  }, [recipe]);

  const isDirty = useMemo(() => {
    const saved = {
      title: recipe.title,
      description: recipe.description || "",
      showcase: recipe.showcase || [],
      steps: recipe.steps || [],
      isPublic: recipe.isPublic || false,
    };
    return JSON.stringify(saved) !== JSON.stringify({ title, description, showcase, steps, isPublic });
  }, [recipe, title, description, showcase, steps, isPublic]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleAssetRemoved = (url: string) => {
    pendingDeletions.current.push(url);
  };

  const handleShowcaseDelete = (url: string) => {
    handleAssetRemoved(url);
    setShowcase((prev) => prev.filter((u) => u !== url));
  };

  const handleSave = async () => {
    // Half-typed paint rows are editor state, not data - drop them at the boundary.
    const cleanedSteps = steps.map((step) => ({ ...step, paints: cleanPaints(step.paints) }));
    try {
      await onSave({ title, description, showcase, steps: cleanedSteps, isPublic });
    } catch {
      // onSave surfaces its own error. Keep the pending deletions so a later successful
      // save still cleans up, and leave the removed images in place until then.
      return;
    }
    pendingDeletions.current.forEach((url) => deleteAsset(url));
    pendingDeletions.current = [];
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <FormControlLabel
          control={<Switch checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />}
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
          <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} disabled={isSaving || !title.trim()}>
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

      <Card variant="outlined" sx={{ ...cardSx, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 1.5, fontWeight: 600 }}>
            Showcase images
          </Typography>
          <ImageUploader
            images={showcase}
            onChange={setShowcase}
            onRemove={handleShowcaseDelete}
            hint="The first image is the cover on your recipe card. Drop, paste or pick images; drag to reorder."
          />
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ ...cardSx, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Steps
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 2 }}>
            {steps.map((step, index) => (
              <StepEditor
                key={`step-${index}`}
                step={step}
                index={index}
                canMoveUp={index > 0}
                canMoveDown={index < steps.length - 1}
                dispatch={dispatchSteps}
                onAssetRemoved={handleAssetRemoved}
              />
            ))}
            {steps.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No steps yet. Add your first step!
              </Typography>
            )}
          </Box>
          <Button variant="contained" onClick={() => dispatchSteps({ type: "add" })} fullWidth>
            Add Step
          </Button>
        </CardContent>
      </Card>
    </Box>
  );
}

export type { StepAction };
