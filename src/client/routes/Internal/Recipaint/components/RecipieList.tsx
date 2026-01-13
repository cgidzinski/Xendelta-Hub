import { Box, Typography, Card, CardContent, CircularProgress, Alert } from "@mui/material";
import { Recipe } from "../../../../types/Recipe";
import RecipeCard from "./RecipeCard";

interface RecipieListProps {
  title: string;
  recipes: Recipe[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  handleRecipeClick: (recipeId: string) => void;
}

export default function RecipieList({ title, recipes, isLoading, isError, error, handleRecipeClick }: RecipieListProps) {
  return (
    <Card
      elevation={0}
      sx={{
        mb: 6,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 3,
        overflow: "hidden",
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>
          {title}
        </Typography>

        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "400px" }}>
            <CircularProgress />
          </Box>
        )}

        {isError && (
          <Alert severity="error" sx={{ mb: 4 }}>
            {error?.message || "Failed to load recipes"}
          </Alert>
        )}

        {!isLoading && !isError && recipes.length === 0 && (
          <Alert severity="info">No recipes yet. Create your first recipe!</Alert>
        )}

        {!isLoading && !isError && recipes.length > 0 && (
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 3,
              width: "100%",
              justifyContent: { xs: "flex-start", sm: "center" },
            }}
          >
            {recipes.map((recipe) => (
              <RecipeCard key={recipe._id} recipe={recipe} onClick={() => handleRecipeClick(recipe._id)} />
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
