import { useState } from "react";
import { useParams } from "react-router-dom";
import { Box, Container } from "@mui/material";
import { useTitle } from "../../../hooks/useTitle";
import { usePublicRecipaintRecipe } from "../../../hooks/recipaint/useRecipaint";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import RecipeView from "../../Internal/Recipaint/components/RecipeView";

export default function RecipaintPublic() {
  const { id } = useParams<{ id: string }>();
  const { recipe, isLoading, isError, error, refetch } = usePublicRecipaintRecipe(id);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  useTitle(recipe?.title || "Recipe");

  const handleStepToggle = (index: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading recipe..." />;
  }

  if (isError || !recipe) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <ErrorDisplay
          error={error}
          title="This recipe isn't available"
          onRetry={() => refetch()}
        />
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Box>
        <RecipeView recipe={recipe} completedSteps={completedSteps} onStepToggle={handleStepToggle} />
      </Box>
    </Container>
  );
}
