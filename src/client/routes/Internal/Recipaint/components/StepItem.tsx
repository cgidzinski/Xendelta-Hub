import { Box, Typography, Checkbox, Chip, Stack } from "@mui/material";
import { RecipeStep } from "../../../../types/RecipeStep";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import ImageGallery from "./ImageGallery";

interface StepItemProps {
  step: RecipeStep;
  index: number;
  isCompleted: boolean;
  onToggle: () => void;
}

/** "Dry brush (Citadel: Nuln Oil)" - the technique line, shown on both layouts. */
function StepTechnique({ step }: { step: RecipeStep }) {
  if (!step.method && !step.paints) return null;
  return (
    <Typography
      variant="caption"
      sx={{ fontStyle: "italic", color: "primary.main", fontWeight: 500, textAlign: "right" }}
    >
      {step.method || ""}
      {step.method && step.paints && " "}
      {step.paints && `(${step.paints})`}
    </Typography>
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
        <StepTechnique step={step} />
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
