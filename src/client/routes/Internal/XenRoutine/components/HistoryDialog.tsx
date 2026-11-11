import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import type { Routine } from "../../../../hooks/xenroutine/useRoutines";

interface Props {
  open: boolean;
  routine: Routine | null;
  onClose: () => void;
}

export default function HistoryDialog({ open, routine, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>History{routine ? ` — ${routine.name}` : ""}</DialogTitle>
      <DialogContent>
        {routine && routine.notes && (
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap", mb: 1 }}>
            {routine.notes}
          </Typography>
        )}
        {routine && routine.history.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing recorded yet.
          </Typography>
        ) : (
          <List dense>
            {routine?.history.map((h, i) => (
              <ListItem key={i} disableGutters>
                <ListItemText
                  primary={`${h.action === "done" ? "Done" : `Postponed to ${h.due_at ? format(new Date(h.due_at), "PP") : "?"}`} · ${format(new Date(h.at), "PP")}`}
                  secondary={[h.by_username && `by ${h.by_username}`, h.note].filter(Boolean).join(" — ") || undefined}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
