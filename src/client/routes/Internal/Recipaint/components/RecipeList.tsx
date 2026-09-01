import { Box, Typography, Skeleton, Stack } from "@mui/material";
import BrushIcon from "@mui/icons-material/Brush";
import { RecipeSummary } from "../../../../types/Recipe";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import { sectionLabelSx, emptyStateSx, emptyStateIconCircleSx } from "../../../../components/ui/surfaceStyles";
import RecipeCard from "./RecipeCard";

interface RecipeListProps {
  title: string;
  recipes: RecipeSummary[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  emptyTitle: string;
  emptyHint: string;
  onRecipeClick: (recipeId: string) => void;
}

// Cards fill their track, so the column count follows the viewport instead of a fixed width.
const gridSx = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fill, minmax(240px, 1fr))" },
  gap: 2,
  alignItems: "stretch",
};

export default function RecipeList({
  title,
  recipes,
  isLoading,
  isError,
  error,
  emptyTitle,
  emptyHint,
  onRecipeClick,
}: RecipeListProps) {
  return (
    <Box sx={{ mb: 4 }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="caption" sx={sectionLabelSx}>
          {title}
        </Typography>
        {!isLoading && !isError && recipes.length > 0 && (
          <Typography variant="caption" color="text.disabled">
            {recipes.length} recipe{recipes.length === 1 ? "" : "s"}
          </Typography>
        )}
      </Stack>

      {isLoading && (
        <Box sx={gridSx}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={260} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {isError && <ErrorDisplay error={error} title="Couldn't load recipes" />}

      {!isLoading && !isError && recipes.length === 0 && (
        <Box sx={emptyStateSx}>
          <Box sx={emptyStateIconCircleSx}>
            <BrushIcon color="disabled" />
          </Box>
          <Typography variant="subtitle1">{emptyTitle}</Typography>
          <Typography variant="body2" color="text.secondary">
            {emptyHint}
          </Typography>
        </Box>
      )}

      {!isLoading && !isError && recipes.length > 0 && (
        <Box sx={gridSx}>
          {recipes.map((recipe) => (
            <RecipeCard key={recipe._id} recipe={recipe} onClick={() => onRecipeClick(recipe._id)} />
          ))}
        </Box>
      )}
    </Box>
  );
}
