import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  InputAdornment,
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Alert,
} from "@mui/material";
import { Close as CloseIcon, Search as SearchIcon } from "@mui/icons-material";
import { useRecipaint } from "../../../../hooks/recipaint/useRecipaint";
import RecipeCard from "./RecipeCard";
import RecipieList from "./RecipieList";

interface RecipeSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelect: (recipeId: string) => void;
  excludeRecipeId?: string;
}

export default function RecipeSelector({ open, onClose, onSelect, excludeRecipeId }: RecipeSelectorProps) {
  const [search, setSearch] = useState("");
  const { recipes, isLoading, isError, error } = useRecipaint(search || undefined);

  const filteredRecipes = excludeRecipeId ? recipes.filter((recipe) => recipe._id !== excludeRecipeId) : recipes;

  const handleSelect = (recipeId: string) => {
    onSelect(recipeId);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6">Select Recipe to Insert</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent>
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
          sx={{ mb: 3 }}
        />

        <RecipieList
          recipes={filteredRecipes}
          isLoading={isLoading}
          isError={isError}
          error={error}
          handleRecipeClick={handleSelect}
        />
      </DialogContent>
    </Dialog>
  );
}
