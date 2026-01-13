import {
  Box,
  Typography,
  Checkbox,
  Chip,
} from "@mui/material";
import { RecipeStep } from "../../../../types/RecipeStep";
import ImageGallery from "./ImageGallery";

interface StepItemProps {
  step: RecipeStep;
  index: number;
  isCompleted: boolean;
  onToggle: () => void;
}

export default function StepItem({ step, index, isCompleted, onToggle }: StepItemProps) {
  if (isCompleted) {
    // Compact layout when completed - single line
    return (
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          py: 1,
          px: 2,
          backgroundColor: "action.selected",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Checkbox checked={isCompleted} onChange={onToggle} color="success" />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexGrow: 1 }}>
          <Chip
            label={`Step ${index + 1}`}
            size="small"
            sx={{
              borderRadius: 1,
              fontWeight: 600,
              height: "24px",
            }}
          />
          {step.stepName && (
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {step.stepName}
            </Typography>
          )}
        </Box>
        {(step.method || step.paints) && (
          <Typography 
            variant="caption" 
            sx={{ 
              fontStyle: "italic",
              color: "primary.main",
              fontWeight: 500,
            }}
          >
            {step.method || ""}
            {step.method && step.paints && " "}
            {step.paints && `(${step.paints})`}
          </Typography>
        )}
      </Box>
    );
  }

  // Full expanded layout when not completed
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        p: 2,
        backgroundColor: "transparent",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
        <Checkbox checked={isCompleted} onChange={onToggle} color="success" sx={{ mt: 0.5 }} />
        <Box sx={{ flexGrow: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Chip
                label={`Step ${index + 1}`}
                size="small"
                sx={{
                  borderRadius: 1,
                  fontWeight: 600,
                  height: "24px",
                }}
              />
              {step.stepName && (
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {step.stepName}
                </Typography>
              )}
            </Box>
            {(step.method || step.paints) && (
              <Typography 
                variant="caption" 
                sx={{ 
                  fontStyle: "italic",
                  color: "primary.main",
                  fontWeight: 500,
                }}
              >
                {step.method || ""}
                {step.method && step.paints && " "}
                {step.paints && `(${step.paints})`}
              </Typography>
            )}
          </Box>
          <Typography 
            variant="body1" 
            sx={{ 
              mb: step.images && step.images.length > 0 ? 2 : 0,
              textDecoration: isCompleted ? "line-through" : "none",
            }}
          >
            {step.text}
          </Typography>
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
