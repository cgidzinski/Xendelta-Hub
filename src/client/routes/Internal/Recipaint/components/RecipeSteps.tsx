import { Box, Typography, LinearProgress, Button, Stack, Card } from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import ChecklistIcon from "@mui/icons-material/Checklist";
import StepItem from "./StepItem";
import { RecipeStep } from "../../../../types/RecipeStep";
import { cardSx, sectionLabelSx, emptyStateSx, emptyStateIconCircleSx } from "../../../../components/ui/surfaceStyles";

interface RecipeStepsProps {
  steps: RecipeStep[];
  completedSteps: Set<number>;
  onStepToggle: (index: number) => void;
  onResetProgress?: () => void;
}

export default function RecipeSteps({ steps, completedSteps, onStepToggle, onResetProgress }: RecipeStepsProps) {
  if (!steps || steps.length === 0) {
    return (
      <Card variant="outlined" sx={cardSx}>
        <Box sx={emptyStateSx}>
          <Box sx={emptyStateIconCircleSx}>
            <ChecklistIcon color="disabled" />
          </Box>
          <Typography variant="subtitle1">No steps yet</Typography>
          <Typography variant="body2" color="text.secondary">
            Steps are the paint scheme: base coat, wash, highlights.
          </Typography>
        </Box>
      </Card>
    );
  }

  const doneCount = steps.filter((_, index) => completedSteps.has(index)).length;
  const percent = (doneCount / steps.length) * 100;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
        <Typography variant="caption" sx={sectionLabelSx}>
          Steps
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="caption" color="text.secondary">
            {doneCount} of {steps.length} done
          </Typography>
          {onResetProgress && doneCount > 0 && (
            <Button size="small" startIcon={<RestartAltIcon />} onClick={onResetProgress} sx={{ textTransform: "none" }}>
              Reset
            </Button>
          )}
        </Stack>
      </Stack>

      <LinearProgress
        variant="determinate"
        value={percent}
        color={doneCount === steps.length ? "success" : "primary"}
        // Neutral track: MUI's default determinate track is a tint of the bar colour, which
        // made an empty bar read as a full one.
        sx={{
          height: 6,
          borderRadius: 3,
          mb: 2,
          bgcolor: "action.hover",
          "& .MuiLinearProgress-bar": { borderRadius: 3 },
        }}
      />

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {steps.map((step, index) => (
          <StepItem
            key={index}
            step={step}
            index={index}
            isCompleted={completedSteps.has(index)}
            onToggle={() => onStepToggle(index)}
          />
        ))}
      </Box>
    </Box>
  );
}
