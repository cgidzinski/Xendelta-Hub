import { Box, Typography, Checkbox, Chip, Stack, Tooltip } from "@mui/material";
import { RecipeStep } from "../../../../types/RecipeStep";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import ImageGallery from "./ImageGallery";
import PaintChip from "./PaintChip";
import { cleanPaints, formatPaint } from "../../../../../shared/recipaint/paints";

interface StepItemProps {
  step: RecipeStep;
  index: number;
  isCompleted: boolean;
  onToggle: () => void;
}

/** The technique line: how it's applied, plus the paints as swatches. */
function StepTechnique({ step, compact = false }: { step: RecipeStep; compact?: boolean }) {
  const paints = cleanPaints(step.paints);
  if (!step.method && paints.length === 0) return null;

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.5}
      sx={{ flexWrap: "wrap", rowGap: 0.5, justifyContent: { sm: "flex-end" } }}
    >
      {step.method && (
        <Typography variant="caption" sx={{ fontStyle: "italic", color: "primary.main", fontWeight: 500 }}>
          {step.method}
        </Typography>
      )}
      {/* A collapsed row shows swatches only - the names are already above it in full. */}
      {compact
        ? paints.map((paint, i) => (
            <Tooltip key={i} title={formatPaint(paint)}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  border: "1px solid",
                  borderColor: "divider",
                  backgroundColor: paint.hex || "transparent",
                }}
              />
            </Tooltip>
          ))
        : paints.map((paint, i) => <PaintChip key={i} paint={paint} />)}
    </Stack>
  );
}

export default function StepItem({ step, index, isCompleted, onToggle }: StepItemProps) {
  // Completed steps collapse to a single line so the remaining work stays in view.
  if (isCompleted) {
    return (
      <Box
        sx={{
          ...cardSx,
          py: 0.5,
          px: 1,
          backgroundColor: "action.selected",
          display: "flex",
          alignItems: "center",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Checkbox checked onChange={onToggle} color="success" size="small" />
        <Chip label={index + 1} size="small" sx={{ borderRadius: 1, fontWeight: 600, height: 22, minWidth: 28 }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0 }} noWrap>
          {step.stepName || step.text || `Step ${index + 1}`}
        </Typography>
        <StepTechnique step={step} compact />
      </Box>
    );
  }

  return (
    <Box sx={{ ...cardSx, p: 2 }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Checkbox checked={false} onChange={onToggle} color="success" sx={{ mt: -0.5, ml: -1 }} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
            spacing={0.5}
            sx={{ mb: 1 }}
          >
            <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
              <Chip
                label={index + 1}
                size="small"
                sx={{ borderRadius: 1, fontWeight: 600, height: 22, minWidth: 28 }}
              />
              {step.stepName && (
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {step.stepName}
                </Typography>
              )}
            </Stack>
            <StepTechnique step={step} />
          </Stack>

          {step.text && (
            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
              {step.text}
            </Typography>
          )}

          {step.images && step.images.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <ImageGallery images={step.images} dense />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
