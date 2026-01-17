import { useState } from "react";
import { useParams } from "react-router-dom";
import { Container, Box, Typography, CircularProgress, Alert, Card, CardContent, Avatar } from "@mui/material";
import { useTitle } from "../../../hooks/useTitle";
import { usePublicRecipaintRecipe } from "../../../hooks/recipaint/useRecipaint";
import RecipeSteps from "../../Internal/Recipaint/components/RecipeSteps";
import ImageGallery from "../../Internal/Recipaint/components/ImageGallery";

export default function RecipaintPublic() {
  const { id } = useParams<{ id: string }>();
  const { recipe, isLoading, isError, error } = usePublicRecipaintRecipe(id);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  useTitle(recipe?.title || "Recipe");

  const handleStepToggle = (index: number) => {
    setCompletedSteps((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (isError || !recipe) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 4 }}>
          {error?.message || "Failed to load recipe"}
        </Alert>
      </Container>
    );
  }

  const author = recipe.author;
  const originalRecipeId = recipe.originalRecipeId;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <Typography variant="h4" sx={{ flexGrow: 1, fontWeight: 700 }}>
          {recipe.title}
        </Typography>
      </Box>

      {/* Author and Original Recipe Link */}
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        {author && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Avatar src={author.avatar} alt={author.username} sx={{ width: 32, height: 32 }}>
              {author.username.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Created by <strong>{author.username}</strong>
            </Typography>
          </Box>
        )}
      </Box>

      {(recipe.showcase && recipe.showcase.length > 0) || recipe.description ? (
        <Card
          elevation={0}
          sx={{
            mb: 4,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <CardContent sx={{ p: 3 }}>
            {recipe.showcase && recipe.showcase.length > 0 && (
              <Box sx={{ mb: recipe.description ? 3 : 0 }}>
                <ImageGallery images={recipe.showcase} />
              </Box>
            )}
            {recipe.description && (
              <Typography
                variant="body1"
                sx={{
                  color: "text.primary",
                  lineHeight: 1.8,
                  fontSize: "1.1rem",
                }}
              >
                {recipe.description}
              </Typography>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Box>
        <RecipeSteps steps={recipe.steps} completedSteps={completedSteps} onStepToggle={handleStepToggle} />
      </Box>
    </Container>
  );
}
