import { useMemo, useState } from "react";
import { Box, Button, InputAdornment, List, ListItemButton, ListItemText, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { EMPTY_FILTERS } from "@shared/xenkitchen/kitchen";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useKitchenItems } from "../../../../hooks/xenkitchen/useKitchen";

interface AddMealDialogProps {
  open: boolean;
  bookId: string;
  /** "Wednesday, Mar 4": the day the meal is going on. */
  dayLabel: string;
  onClose: () => void;
  onPick: (itemId: string) => void;
}

/** Pick a recipe from the book to plan for a day. */
export default function AddMealDialog({ open, bookId, dayLabel, onClose, onPick }: AddMealDialogProps) {
  const [q, setQ] = useState("");
  const { items, isLoading } = useKitchenItems(EMPTY_FILTERS, bookId);
  // Only things you cook from a recipe: the "instructions" kind (what's on a box) has no ingredients to shop for.
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((i) => i.layout === "recipe" && (!needle || i.title.toLowerCase().includes(needle)));
  }, [items, q]);

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title={`Plan a meal for ${dayLabel}`}
      actions={<Button onClick={onClose}>Cancel</Button>}
    >
      <TextField
        autoFocus
        fullWidth
        size="small"
        placeholder="Search recipes"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
          htmlInput: { "aria-label": "Search recipes" },
        }}
      />
      <Box sx={{ mt: 1, maxHeight: 360, overflowY: "auto" }}>
        {isLoading ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            Loading…
          </Typography>
        ) : matches.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            {items.length === 0 ? "This book has no recipes yet." : "No recipes match."}
          </Typography>
        ) : (
          <List dense disablePadding>
            {matches.map((item) => (
              <ListItemButton key={item._id} onClick={() => onPick(item._id)}>
                <ListItemText
                  primary={item.title || "Untitled"}
                  secondary={item.servings ? `Makes ${item.servings}` : undefined}
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>
    </ResponsiveDialog>
  );
}
