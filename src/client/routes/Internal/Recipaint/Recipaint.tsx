import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import ClearIcon from "@mui/icons-material/Clear";
import SortIcon from "@mui/icons-material/Sort";
import { useTitle } from "../../../hooks/useTitle";
import { useRecipaint, usePublicRecipes, useCreateRecipe } from "../../../hooks/recipaint/useRecipaint";
import { useSnackbar } from "notistack";
import RecipeList from "./components/RecipeList";
import {
  RECIPE_FILTERS,
  RECIPE_SORTS,
  RecipeFilter,
  RecipeSort,
  applyRecipeFilters,
} from "./recipeFilters";

export default function Recipaint() {
  useTitle("Recipaint");
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<RecipeFilter>("all");
  const [sort, setSort] = useState<RecipeSort>("updated");
  const [sortAnchor, setSortAnchor] = useState<null | HTMLElement>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [recipeName, setRecipeName] = useState("");

  // The search box drives a server query; without this it fired one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { recipes, isLoading, isError, error } = useRecipaint(debouncedSearch || undefined);
  const {
    recipes: publicRecipes,
    isLoading: isLoadingPublic,
    isError: isErrorPublic,
    error: errorPublic,
  } = usePublicRecipes();
  const createRecipe = useCreateRecipe();

  const visibleRecipes = useMemo(() => applyRecipeFilters(recipes, filter, sort), [recipes, filter, sort]);
  // Someone else's recipes are public by definition, so only the sort applies here.
  const visiblePublicRecipes = useMemo(() => applyRecipeFilters(publicRecipes, "all", sort), [publicRecipes, sort]);

  const activeSortLabel = RECIPE_SORTS.find((s) => s.value === sort)?.label ?? "Sort";

  const handleRecipeClick = (recipeId: string) => {
    navigate(`/internal/recipaint/${recipeId}`);
  };

  const handleCloseCreateDialog = () => {
    setCreateDialogOpen(false);
    setRecipeName("");
  };

  const handleCreateRecipe = () => {
    createRecipe.mutate(
      { title: recipeName.trim(), description: "", showcase: [], steps: [], isPublic: false },
      {
        onSuccess: (newRecipe) => {
          handleCloseCreateDialog();
          navigate(`/internal/recipaint/${newRecipe._id}`);
        },
        onError: (error: Error) => {
          enqueueSnackbar(error.message || "Failed to create recipe", { variant: "error" });
        },
      },
    );
  };

  return (
    <Box sx={{ p: 2, width: "100%" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Typography variant="h6">Recipaint</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setCreateDialogOpen(true);
            setRecipeName("");
          }}
          sx={{ flexShrink: 0 }}
        >
          New recipe
        </Button>
      </Stack>

      <TextField
        fullWidth
        size="small"
        placeholder="Search recipes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 1.5 }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" aria-label="Clear search" onClick={() => setSearch("")}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          },
        }}
      />

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3, flexWrap: "wrap", rowGap: 1 }}>
        {RECIPE_FILTERS.map((f) => (
          <Chip
            key={f.value}
            label={f.label}
            size="small"
            variant={filter === f.value ? "filled" : "outlined"}
            color={filter === f.value ? "primary" : "default"}
            onClick={() => setFilter(f.value)}
          />
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          startIcon={<SortIcon />}
          onClick={(e) => setSortAnchor(e.currentTarget)}
          sx={{ flexShrink: 0, textTransform: "none" }}
        >
          {activeSortLabel}
        </Button>
        <Menu anchorEl={sortAnchor} open={Boolean(sortAnchor)} onClose={() => setSortAnchor(null)}>
          {RECIPE_SORTS.map((s) => (
            <MenuItem
              key={s.value}
              selected={s.value === sort}
              onClick={() => {
                setSort(s.value);
                setSortAnchor(null);
              }}
            >
              {s.label}
            </MenuItem>
          ))}
        </Menu>
      </Stack>

      <RecipeList
        title="My recipes"
        recipes={visibleRecipes}
        isLoading={isLoading}
        isError={isError}
        error={error}
        emptyTitle={debouncedSearch || filter !== "all" ? "Nothing matches" : "No recipes yet"}
        emptyHint={
          debouncedSearch || filter !== "all"
            ? "Try a different search or filter."
            : "A recipe is the step-by-step paint scheme for a model."
        }
        onRecipeClick={handleRecipeClick}
      />

      {(isLoadingPublic || visiblePublicRecipes.length > 0) && (
        <RecipeList
          title="Public recipes"
          recipes={visiblePublicRecipes}
          isLoading={isLoadingPublic}
          isError={isErrorPublic}
          error={errorPublic}
          emptyTitle="Nothing shared yet"
          emptyHint="Public recipes from other painters show up here."
          onRecipeClick={handleRecipeClick}
        />
      )}

      <Dialog open={createDialogOpen} onClose={handleCloseCreateDialog} maxWidth="xs" fullWidth>
        <DialogTitle>New recipe</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Name"
            placeholder="Ultramarines Intercessor"
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && recipeName.trim() && !createRecipe.isPending) {
                handleCreateRecipe();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCreateDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateRecipe} disabled={!recipeName.trim() || createRecipe.isPending}>
            {createRecipe.isPending ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
