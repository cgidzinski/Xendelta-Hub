import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Box, TextField, Button, Typography, Card, CardContent, FormControlLabel, Switch } from "@mui/material";
import { Delete as DeleteIcon, Save as SaveIcon } from "@mui/icons-material";
import { Recipe } from "../../../../types/Recipe";
import { RecipeStep } from "../../../../types/RecipeStep";
import { cleanPaints } from "@shared/recipaint/paints";
import ImageUploader from "./ImageUploader";
import StepEditor from "./StepEditor";
import { stepsReducer } from "./stepsReducer";
import { STEP_ITEM_ATTR, useStepDrag } from "./useStepDrag";
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
  const moveStep = useCallback((from: number, to: number) => dispatchSteps({ type: "moveTo", from, to }), []);
  const { listRef, drag, start: startDrag } = useStepDrag(moveStep);
  // Removed images are deleted by the server when the save lands (it compares the recipe before and after), so
  // abandoning an edit never breaks the saved recipe.

  useEffect(() => {
    setTitle(recipe.title);
    setDescription(recipe.description || "");
    setShowcase(recipe.showcase || []);
    dispatchSteps({ type: "reset", steps: recipe.steps || [] });
    setIsPublic(recipe.isPublic || false);
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

  const handleShowcaseDelete = (url: string) => {
    setShowcase((prev) => prev.filter((u) => u !== url));
  };

  const handleSave = async () => {
    // Half-typed paint rows are editor state, not data - drop them at the boundary.
    const cleanedSteps = steps.map((step) => ({ ...step, paints: cleanPaints(step.paints) }));
    try {
      await onSave({ title, description, showcase, steps: cleanedSteps, isPublic });
    } catch {
      // onSave surfaces its own error.
    }
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
          <Box ref={listRef} sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 2 }}>
            {steps.map((step, index) => (
              // The wrapper carries the drag styling so the memoized StepEditor's props don't change mid-drag.
              <Box
                key={`step-${index}`}
                {...{ [STEP_ITEM_ATTR]: "" }}
                sx={{
                  position: "relative",
                  opacity: drag?.from === index ? 0.5 : 1,
                  transition: "opacity 120ms",
                  ...dropLineSx(
                    drag?.slot === index
                      ? "top"
                      : drag?.slot === steps.length && index === steps.length - 1
                        ? "bottom"
                        : null,
                  ),
                }}
              >
                {/* While dragging, each card shows only its header and step name so several fit on screen. */}
                <Box
                  sx={
                    drag
                      ? {
                          maxHeight: COLLAPSED_STEP_HEIGHT,
                          overflow: "hidden",
                          borderRadius: 2,
                          borderBottom: "1px solid",
                          borderColor: "divider",
                        }
                      : undefined
                  }
                >
                  <StepEditor
                    step={step}
                    index={index}
                    canMoveUp={index > 0}
                    canMoveDown={index < steps.length - 1}
                    dispatch={dispatchSteps}
                    onDragHandle={steps.length > 1 ? startDrag : undefined}
                  />
                </Box>
              </Box>
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

export type { StepAction } from "./stepsReducer";

/** A step card cut off just below its Step Name field (px). */
const COLLAPSED_STEP_HEIGHT = 112;

/** A line in the gap above or below a step card, showing where a dragged step will land. */
function dropLineSx(edge: "top" | "bottom" | null) {
  if (!edge) return {};
  return {
    "&::after": {
      content: '""',
      position: "absolute",
      left: 0,
      right: 0,
      // Centred in the 16px gap between cards.
      [edge]: "-9px",
      height: "3px",
      borderRadius: 1,
      bgcolor: "primary.main",
      pointerEvents: "none",
    },
  };
}
