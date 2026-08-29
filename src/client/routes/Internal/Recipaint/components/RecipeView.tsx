import { ReactNode } from "react";
import { Box, Typography, Chip, Avatar, Stack, Card, Button } from "@mui/material";
import LinkIcon from "@mui/icons-material/Link";
import { Link } from "react-router-dom";
import { Recipe } from "../../../../types/Recipe";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import ImageGallery from "./ImageGallery";
import RecipeSteps from "./RecipeSteps";

interface RecipeViewProps {
  recipe: Recipe;
  completedSteps: Set<number>;
  onStepToggle: (index: number) => void;
  onResetProgress?: () => void;
  /** Buttons for this surface (Edit/Clone internally, Clone on the public page). */
  actions?: ReactNode;
  /** Leading control, e.g. the back arrow. Omitted on the public page. */
  leading?: ReactNode;
  showVisibility?: boolean;
  originalRecipeHref?: string | null;
}

/**
 * The read-only recipe presentation, shared by the internal detail page and the public
 * share page so the two can't drift apart. Everything surface-specific comes in via slots.
 */
export default function RecipeView({
  recipe,
  completedSteps,
  onStepToggle,
  onResetProgress,
  actions,
  leading,
  showVisibility = false,
  originalRecipeHref,
}: RecipeViewProps) {
  const author = recipe.author;
  const hasIntro = Boolean((recipe.showcase && recipe.showcase.length > 0) || recipe.description);

  return (
    <>
      {/* Title and actions are siblings, not nested inside the heading - the old markup put
          buttons and chips inside an <h4>, which wrapped badly on a phone. */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "stretch", sm: "center" }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          {leading}
          <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 0, wordBreak: "break-word" }}>
            {recipe.title}
          </Typography>
          {showVisibility && (
            <Chip
              size="small"
              color={recipe.isPublic ? "success" : "default"}
              label={recipe.isPublic ? "Public" : "Private"}
              variant="outlined"
              sx={{ flexShrink: 0 }}
            />
          )}
        </Stack>
        {actions && (
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0, justifyContent: { xs: "flex-end", sm: "initial" } }}>
            {actions}
          </Stack>
        )}
      </Stack>

      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3, flexWrap: "wrap", rowGap: 1 }}>
        {author && (
          <Stack direction="row" alignItems="center" spacing={1}>
            <Avatar src={author.avatar} alt={author.username} sx={{ width: 28, height: 28, fontSize: 13 }}>
              {author.username.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="body2" color="text.secondary">
              Created by <strong>{author.username}</strong>
            </Typography>
          </Stack>
        )}
        {originalRecipeHref && (
          <Button component={Link} to={originalRecipeHref} size="small" startIcon={<LinkIcon />} variant="outlined">
            View original
          </Button>
        )}
      </Stack>

      {hasIntro && (
        <Card variant="outlined" sx={{ ...cardSx, p: 2, mb: 3 }}>
          {recipe.showcase && recipe.showcase.length > 0 && (
            <Box sx={{ mb: recipe.description ? 2 : 0 }}>
              <ImageGallery images={recipe.showcase} />
            </Box>
          )}
          {recipe.description && (
            <Typography variant="body1" sx={{ lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {recipe.description}
            </Typography>
          )}
        </Card>
      )}

      <RecipeSteps
        steps={recipe.steps}
        completedSteps={completedSteps}
        onStepToggle={onStepToggle}
        onResetProgress={onResetProgress}
      />
    </>
  );
}
