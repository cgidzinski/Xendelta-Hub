import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Container,
  Box,
  Button,
  IconButton,
  Typography,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Avatar,
  Chip,
} from "@mui/material";
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  ContentCopy as CloneIcon,
  Link as LinkIcon,
} from "@mui/icons-material";
import { useTitle } from "../../../hooks/useTitle";
import { useRecipaintRecipe, useUpdateRecipe, useDeleteRecipe, useCloneRecipe } from "../../../hooks/recipaint/useRecipaint";
import { useSnackbar } from "notistack";
import { useAuth } from "../../../contexts/AuthContext";
import RecipeSteps from "./components/RecipeSteps";
import RecipeForm from "./components/RecipeForm";
import ImageGallery from "./components/ImageGallery";

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { recipe, isLoading, isError, error } = useRecipaintRecipe(id);
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const cloneRecipe = useCloneRecipe();
  const [isEditMode, setIsEditMode] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Check if current user is the owner
  const isOwner = recipe && user && (
    (recipe.owner && typeof recipe.owner === "object" && recipe.owner._id === user.id) ||
    (typeof recipe.owner === "string" && recipe.owner === user.id)
  );

  useTitle(recipe?.title || "Recipe");

  const handleBackClick = () => {
    if (isEditMode) {
      setIsEditMode(false);
      return;
    }
    navigate("/internal/recipaint");
  };

  const handleEditClick = () => {
    setIsEditMode(true);
  };

  const handleCloneClick = async () => {
    if (!id) return;
    
    cloneRecipe.mutate(id, {
      onSuccess: (clonedRecipe) => {
        enqueueSnackbar("Recipe cloned successfully", { variant: "success" });
        navigate(`/internal/recipaint/${clonedRecipe._id}`);
      },
      onError: (error: Error) => {
        enqueueSnackbar(error.message || "Failed to clone recipe", { variant: "error" });
      },
    });
  };

  const handleSave = async (formData: any) => {
    if (!id) return;
    
    updateRecipe.mutate(
      {
        id,
        data: formData,
      },
      {
        onSuccess: () => {
          setIsEditMode(false);
          enqueueSnackbar("Recipe updated successfully", { variant: "success" });
        },
        onError: (error: Error) => {
          enqueueSnackbar(error.message || "Failed to update recipe", { variant: "error" });
        },
      }
    );
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this recipe?")) {
      return;
    }

    deleteRecipe.mutate(id, {
      onSuccess: () => {
        enqueueSnackbar("Recipe deleted successfully", { variant: "success" });
        navigate("/internal/recipaint");
      },
      onError: (error: Error) => {
        enqueueSnackbar(error.message || "Failed to delete recipe", { variant: "error" });
      },
    });
  };

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
        <Button startIcon={<ArrowBackIcon />} onClick={handleBackClick}>
          Back to Recipes
        </Button>
      </Container>
    );
  }

  if (isEditMode) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
          <IconButton onClick={handleBackClick}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Edit Recipe
          </Typography>
        </Box>
        <RecipeForm
          recipe={recipe}
          onSave={handleSave}
          onDelete={handleDelete}
          isSaving={updateRecipe.isPending}
          isDeleting={deleteRecipe.isPending}
        />
      </Container>
    );
  }

  const author = recipe.author;
  const originalRecipeId = recipe.originalRecipeId;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2 }}>
        <IconButton onClick={handleBackClick}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ flexGrow: 1, fontWeight: 700 }}>
          {recipe.title}
        </Typography>
        {isOwner ? (
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={handleEditClick}
          >
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
      </Box>

      {/* Author and Original Recipe Link */}
      <Box sx={{ mb: 3, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
        {author && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Avatar
              src={author.avatar}
              alt={author.username}
              sx={{ width: 32, height: 32 }}
            >
              {author.username.charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Created by <strong>{author.username}</strong>
            </Typography>
          </Box>
        )}
        {originalRecipeId && (
          <Button
            component={Link}
            to={`/internal/recipaint/${originalRecipeId}`}
            size="small"
            startIcon={<LinkIcon />}
            variant="outlined"
          >
            View Original Recipe
          </Button>
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
        <RecipeSteps
          steps={recipe.steps}
          completedSteps={completedSteps}
          onStepToggle={handleStepToggle}
        />
      </Box>
    </Container>
  );
}
