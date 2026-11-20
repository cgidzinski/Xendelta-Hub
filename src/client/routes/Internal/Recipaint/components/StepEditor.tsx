import { memo } from "react";
import type { PointerEvent } from "react";
import { Autocomplete, Box, TextField, IconButton, Card, CardContent, Typography, Chip } from "@mui/material";
import {
  Delete as DeleteIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  DragIndicator as DragIndicatorIcon,
} from "@mui/icons-material";
import { RecipeStep } from "../../../../types/RecipeStep";
import { PAINT_METHODS } from "@shared/recipaint/paints";
import type { StepAction } from "./stepsReducer";
import ImageUploader from "./ImageUploader";
import PaintListEditor from "./PaintListEditor";

interface StepEditorProps {
  step: RecipeStep;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dispatch: (action: StepAction) => void;
  /** Starts dragging this step to a new place; must be stable to keep the memo. No handle when absent. */
  onDragHandle?: (index: number, e: PointerEvent) => void;
}

/**
 * Fully controlled: every field reads straight from `step` and writes through `dispatch`.
 * It used to mirror each field into local state and resync from props, which fought with
 * reordering. Memoized so a keystroke in one step doesn't re-render the whole list.
 */
function StepEditor({ step, index, canMoveUp, canMoveDown, dispatch, onDragHandle }: StepEditorProps) {
  const update = (updates: Partial<RecipeStep>) => {
    dispatch({ type: "update", index, step: { ...step, ...updates } });
  };

  const handleImageRemove = (url: string) => {
    update({ images: (step.images || []).filter((u) => u !== url) });
  };

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            {onDragHandle && (
              // Pointer-only: the arrow buttons are the keyboard and screen-reader way to reorder.
              <Box
                aria-hidden
                title="Drag to reorder"
                onPointerDown={(e) => onDragHandle(index, e)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // A finger-sized target; touch-action: none lets a finger drag the step instead of scrolling.
                  width: 32,
                  height: 32,
                  ml: -1,
                  borderRadius: 1,
                  color: "text.secondary",
                  cursor: "grab",
                  touchAction: "none",
                  "&:hover": { bgcolor: "action.hover" },
                  "&:active": { cursor: "grabbing" },
                }}
              >
                <DragIndicatorIcon fontSize="small" />
              </Box>
            )}
            <Chip label={`Step ${index + 1}`} size="small" sx={{ borderRadius: 1, fontWeight: 600, height: "24px" }} />
          </Box>
          <Box>
            {canMoveUp && (
              <IconButton
                size="small"
                aria-label={`Move step ${index + 1} up`}
                onClick={() => dispatch({ type: "move", index, direction: "up" })}
              >
                <ArrowUpIcon />
              </IconButton>
            )}
            {canMoveDown && (
              <IconButton
                size="small"
                aria-label={`Move step ${index + 1} down`}
                onClick={() => dispatch({ type: "move", index, direction: "down" })}
              >
                <ArrowDownIcon />
              </IconButton>
            )}
            <IconButton
              size="small"
              color="error"
              aria-label={`Delete step ${index + 1}`}
              onClick={() => dispatch({ type: "delete", index })}
            >
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

        {/* freeSolo: the presets are a starting point, not a closed set - anything can be typed. */}
        <Autocomplete
          freeSolo
          size="small"
          options={[...PAINT_METHODS]}
          value={step.method || ""}
          onInputChange={(_, value) => update({ method: value })}
          sx={{ mb: 1.5 }}
          renderInput={(params) => <TextField {...params} label="Method" placeholder="Drybrush, Wash, Layer..." />}
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

        <Box sx={{ mb: 2 }}>
          <PaintListEditor paints={step.paints || []} onChange={(paints) => update({ paints })} />
        </Box>

        <Box sx={{ mb: 0 }}>
          <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
            Example images
          </Typography>
          <ImageUploader
            images={step.images || []}
            onChange={(images) => update({ images })}
            onRemove={handleImageRemove}
            dense
          />
        </Box>
      </CardContent>
    </Card>
  );
}

export default memo(StepEditor);
