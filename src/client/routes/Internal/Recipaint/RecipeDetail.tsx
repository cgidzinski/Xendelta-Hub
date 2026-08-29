import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  IconButton,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  ContentCopy as CloneIcon,
  Share as ShareIcon,
  Brush as BrushIcon,
} from "@mui/icons-material";
import { useTitle } from "../../../hooks/useTitle";
import {
  useRecipaintRecipe,
  useUpdateRecipe,
  useDeleteRecipe,
  useCloneRecipe,
} from "../../../hooks/recipaint/useRecipaint";
import { useSnackbar } from "notistack";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";
import { useRecipeProgress } from "../../../hooks/recipaint/useRecipeProgress";
import RecipeForm, { RecipeFormData } from "./components/RecipeForm";
import RecipeView from "./components/RecipeView";

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { recipe, isLoading, isError, error, refetch } = useRecipaintRecipe(id);
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const cloneRecipe = useCloneRecipe();
  const [isEditMode, setIsEditMode] = useState(false);
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { completedSteps, toggleStep, resetProgress } = useRecipeProgress(id);

  const isOwner =
    recipe &&
    user &&
    ((recipe.owner && typeof recipe.owner === "object" && recipe.owner._id === user.id) ||
      (typeof recipe.owner === "string" && recipe.owner === user.id));

  useTitle(recipe?.title || "Recipe");

  const handleBackClick = () => {
    if (isEditMode) {
      if (isFormDirty && !window.confirm("You have unsaved changes. Discard them?")) {
        return;
      }
      setIsFormDirty(false);
      setIsEditMode(false);
      return;
    }
    navigate("/internal/recipaint");
  };

  const handleCloneClick = () => {
    if (!id) return;
    cloneRecipe.mutate(id, {
      onSuccess: (clonedRecipe) => {
        enqueueSnackbar("Recipe cloned", { variant: "success" });
        navigate(`/internal/recipaint/${clonedRecipe._id}`);
      },
      onError: (error: Error) => {
        enqueueSnackbar(error.message || "Failed to clone recipe", { variant: "error" });
      },
    });
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/recipaint/${id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      enqueueSnackbar(
        recipe?.isPublic ? "Link copied to clipboard" : "Link copied - make the recipe public so others can open it",
        { variant: recipe?.isPublic ? "success" : "info" },
      );
    } catch {
      enqueueSnackbar("Couldn't copy the link", { variant: "error" });
    }
  };

  // Returns a promise so RecipeForm can wait for the save to land before destroying
  // the images the user removed. Rejecting on failure keeps those images alive.
  const handleSave = async (formData: RecipeFormData) => {
    if (!id) return;
    try {
      await updateRecipe.mutateAsync({ id, data: formData });
      setIsFormDirty(false);
      setIsEditMode(false);
      enqueueSnackbar("Recipe updated", { variant: "success" });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : "Failed to update recipe", { variant: "error" });
      throw error;
    }
  };

  const handleDelete = () => {
    if (!id) return;
    deleteRecipe.mutate(id, {
      onSuccess: () => {
        setDeleteDialogOpen(false);
        enqueueSnackbar("Recipe deleted", { variant: "success" });
        navigate("/internal/recipaint");
      },
      onError: (error: Error) => {
        enqueueSnackbar(error.message || "Failed to delete recipe", { variant: "error" });
      },
    });
  };

  if (isLoading) {
    return <LoadingSpinner message="Loading recipe..." />;
  }

  if (isError || !recipe) {
    return (
      <Box sx={{ p: 2, width: "100%" }}>
        <ErrorDisplay error={error} title="Couldn't load this recipe" onRetry={() => refetch()} />
        <Box sx={{ display: "flex", justifyContent: "center" }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/internal/recipaint")}>
            Back to recipes
          </Button>
        </Box>
      </Box>
    );
  }

  if (isEditMode) {
    return (
      <Box sx={{ p: 2, width: "100%" }}>
        <Box sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton onClick={handleBackClick} aria-label="Back">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Edit recipe
          </Typography>
        </Box>
        <RecipeForm
          recipe={recipe}
          onSave={handleSave}
          onDelete={() => setDeleteDialogOpen(true)}
          onDirtyChange={setIsFormDirty}
          isSaving={updateRecipe.isPending}
          isDeleting={deleteRecipe.isPending}
        />
        <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete recipe</DialogTitle>
          <DialogContent>
            <Typography>
              Delete "{recipe.title}"? Its steps and images go with it. This can't be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDelete} color="error" variant="contained" disabled={deleteRecipe.isPending}>
              {deleteRecipe.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, width: "100%" }}>
      <RecipeView
        recipe={recipe}
        completedSteps={completedSteps}
        onStepToggle={toggleStep}
        onResetProgress={resetProgress}
        showVisibility
        originalRecipeHref={recipe.originalRecipeId ? `/internal/recipaint/${recipe.originalRecipeId}` : null}
        leading={
          <IconButton onClick={handleBackClick} aria-label="Back" edge="start">
            <ArrowBackIcon />
          </IconButton>
        }
        actions={
          <>
            {recipe.steps.length > 0 && (
              <Button
                variant="outlined"
                startIcon={<BrushIcon />}
                onClick={() => navigate(`/internal/recipaint/${id}/paint`)}
              >
                Paint along
              </Button>
            )}
            <Tooltip title="Copy share link">
              <IconButton onClick={handleShare} aria-label="Copy share link">
                <ShareIcon />
              </IconButton>
            </Tooltip>
            {isOwner ? (
              <Button variant="contained" startIcon={<EditIcon />} onClick={() => setIsEditMode(true)}>
                Edit
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={<CloneIcon />}
                onClick={handleCloneClick}
                disabled={cloneRecipe.isPending}
              >
                {cloneRecipe.isPending ? "Cloning..." : "Clone"}
              </Button>
            )}
          </>
        }
      />
    </Box>
  );
}
