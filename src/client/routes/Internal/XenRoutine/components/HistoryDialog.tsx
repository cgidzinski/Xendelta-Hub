import { useState } from "react";
import {
  Box,
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
import ImageLightbox from "../../../../components/ui/ImageLightbox";
import type { Routine } from "../../../../hooks/xenroutine/useRoutines";
import { stepsLabel } from "../../../../hooks/xenroutine/routineViews";

interface Props {
  open: boolean;
  routine: Routine | null;
  onClose: () => void;
}

export default function HistoryDialog({ open, routine, onClose }: Props) {
  const [viewing, setViewing] = useState<string | null>(null);
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
              <ListItem key={i} disableGutters sx={{ display: "block" }}>
                <ListItemText
                  primary={`${h.action === "done" ? "Done" : `Postponed to ${h.due_at ? format(new Date(h.due_at), "PP") : "?"}`} · ${format(new Date(h.at), "PP")}`}
                  secondary={
                    [
                      h.by_username && `by ${h.by_username}`,
                      // A routine with a checklist: how many steps were ticked, and which.
                      h.steps_total
                        ? `${stepsLabel(h.steps_done?.length ?? 0, h.steps_total)}${h.steps_done?.length ? ` (${h.steps_done.join(", ")})` : ""}`
                        : null,
                      h.note,
                    ]
                      .filter(Boolean)
                      .join(" — ") || undefined
                  }
                />
                {h.images && h.images.length > 0 && (
                  <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.75 }}>
                    {h.images.map((img, n) => (
                      <Box
                        key={img.file_id}
                        component="img"
                        src={img.url}
                        alt={`Photo ${n + 1} from ${format(new Date(h.at), "PP")}`}
                        loading="lazy"
                        onClick={() => setViewing(img.url)}
                        sx={{
                          width: 64,
                          height: 64,
                          objectFit: "cover",
                          borderRadius: 1,
                          cursor: "pointer",
                          border: 1,
                          borderColor: "divider",
                        }}
                      />
                    ))}
                  </Box>
                )}
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
      <ImageLightbox url={viewing} onClose={() => setViewing(null)} />
    </Dialog>
  );
}
