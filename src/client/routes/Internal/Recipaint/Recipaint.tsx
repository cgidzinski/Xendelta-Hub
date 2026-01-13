import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  TextField,
  InputAdornment,
  Box,
  CircularProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Card,
  CardContent,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { useTitle } from "../../../hooks/useTitle";
import { useRecipaint, usePublicRecipes, useCreateRecipe } from "../../../hooks/recipaint/useRecipaint";
import { useSnackbar } from "notistack";
import RecipeCard from "./components/RecipeCard";
import RecipieList from "./components/RecipieList";

export default function Recipaint() {
  useTitle("Recipaint");
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [recipeName, setRecipeName] = useState("");
  const { recipes, isLoading, isError, error } = useRecipaint(search || undefined);
  const {
    recipes: publicRecipes,
    isLoading: isLoadingPublic,
    isError: isErrorPublic,
    error: errorPublic,
  } = usePublicRecipes();
  const createRecipe = useCreateRecipe();

  const handleRecipeClick = (recipeId: string) => {
    navigate(`/internal/recipaint/${recipeId}`);
  };

  const handleOpenCreateDialog = () => {
    setCreateDialogOpen(true);
    setRecipeName("");
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setRecipeName("");
  };

  const handleCreateRecipe = () => {
    createRecipe.mutate(
      {
        title: recipeName.trim(),
        description: "",
        showcase: [],
        steps: [],
        isPublic: false,
      },
      {
        onSuccess: (newRecipe) => {
          handleCloseCreateDialog();
          navigate(`/internal/recipaint/${newRecipe._id}`);
        },
        onError: (error: Error) => {
          enqueueSnackbar(error.message || "Failed to create recipe", { variant: "error" });
        },
      }
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
          Recipaint
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenCreateDialog}>
          New Recipe
        </Button>
      </Box>

      <Dialog open={createDialogOpen} onClose={handleCloseCreateDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="h6">Create New Recipe</Typography>
            <IconButton onClick={handleCloseCreateDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Recipe Name"
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter" && recipeName.trim()) {
                handleCreateRecipe();
              }
            }}
            sx={{ mt: 2 }}
            placeholder="Enter recipe name..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreateRecipe}
            disabled={!recipeName.trim() || createRecipe.isPending}
          >
            {createRecipe.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
      <TextField
        fullWidth
        placeholder="Search recipes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 4 }}
      />

      <RecipieList
        title="My Recipes"
        recipes={recipes}
        isLoading={isLoading}
        isError={isError}
        error={error}
        handleRecipeClick={handleRecipeClick}
      />
      {publicRecipes.length > 0 && (
        <RecipieList
          title="Public Recipes"
          recipes={publicRecipes}
          isLoading={isLoadingPublic}
          isError={isErrorPublic}
          error={errorPublic}
          handleRecipeClick={handleRecipeClick}
        />
      )}
    </Container>
  );
}
