import { Card, CardContent, Typography, Box } from "@mui/material";
import StepItem from "./StepItem";
import { RecipeStep } from "../../../../types/RecipeStep";

interface RecipeStepsProps {
  steps: RecipeStep[];
  completedSteps: Set<number>;
  onStepToggle: (index: number) => void;
}

export default function RecipeSteps({ steps, completedSteps, onStepToggle }: RecipeStepsProps) {
  if (!steps || steps.length === 0) {
    return (
      <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            No steps yet.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3 }}>
      <CardContent>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
          Steps
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
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
      </CardContent>
    </Card>
  );
}
