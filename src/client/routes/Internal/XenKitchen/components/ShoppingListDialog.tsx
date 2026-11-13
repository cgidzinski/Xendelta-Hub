import { useEffect } from "react";
import { Alert, Box, Button, CircularProgress, List, ListItem, ListItemText, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import { shoppingLineText } from "@shared/xenkitchen/shopping";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { useShoppingList } from "../../../../hooks/xenkitchen/usePlan";
import { useXenNoteActions } from "../../../../hooks/xennote/useXenNote";

// The most items a XenNote checklist holds (MAX_CHECKLIST_ITEMS in src/shared/xennote/notes.ts).
const NOTE_MAX_ITEMS = 200;

interface ShoppingListDialogProps {
  open: boolean;
  bookId: string;
  from: string;
  to: string;
  /** "Mar 2 – Mar 8", for the title of the note. */
  rangeLabel: string;
  onClose: () => void;
}

/** What to buy for the meals planned in a range, to copy or to send to XenNote as a checklist to tick off in the shop. */
export default function ShoppingListDialog({ open, bookId, from, to, rangeLabel, onClose }: ShoppingListDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const { createNote } = useXenNoteActions();
  const list = useShoppingList();
  const { mutate, reset } = list;

  useEffect(() => {
    if (open) mutate({ bookId, from, to });
    else reset();
  }, [open, bookId, from, to, mutate, reset]);

  const lines = list.data?.lines ?? [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lines.map(shoppingLineText).join("\n"));
      enqueueSnackbar("Copied", { variant: "success" });
    } catch {
      enqueueSnackbar("Couldn't copy. Select the text instead.", { variant: "error" });
    }
  };

  const sendToNotes = async () => {
    try {
      await createNote.mutateAsync({
        type: "checklist",
        title: `Shopping list: ${rangeLabel}`,
        checklist: lines.slice(0, NOTE_MAX_ITEMS).map((l) => ({ text: shoppingLineText(l), done: false })),
      });
      enqueueSnackbar(
        lines.length > NOTE_MAX_ITEMS ? `Saved to XenNote (the first ${NOTE_MAX_ITEMS} items)` : "Saved to XenNote",
        { variant: "success" },
      );
      onClose();
      navigate("/internal/xennote");
    } catch (e) {
      enqueueSnackbar((e as Error).message || "Couldn't save the list", { variant: "error" });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title={`Shopping list: ${rangeLabel}`}
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button onClick={copy} disabled={lines.length === 0}>
            Copy
          </Button>
          <Button variant="contained" onClick={sendToNotes} disabled={lines.length === 0 || createNote.isPending}>
            Send to XenNote
          </Button>
        </>
      }
    >
      {list.isPending && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
          <CircularProgress />
        </Box>
      )}
      {list.isError && <Alert severity="error">{(list.error as Error).message || "Couldn't make the list"}</Alert>}
      {list.data && lines.length === 0 && (
        <Typography color="text.secondary">
          {list.data.meals === 0 ? "No meals are planned for this week." : "The planned meals have no ingredients."}
        </Typography>
      )}
      {lines.length > 0 && (
        <>
          <Typography variant="body2" color="text.secondary">
            For {list.data!.meals} {list.data!.meals === 1 ? "meal" : "meals"}. The same ingredient in the same unit is
            added together.
          </Typography>
          <List dense>
            {lines.map((l) => (
              <ListItem key={`${l.name}|${l.unit}`} disableGutters>
                <ListItemText primary={shoppingLineText(l)} secondary={l.sources.join(", ")} />
              </ListItem>
            ))}
          </List>
        </>
      )}
    </ResponsiveDialog>
  );
}
