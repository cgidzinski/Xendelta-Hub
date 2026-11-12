import { useState } from "react";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from "@mui/material";
import { sectionLabelSx } from "../../../../../components/ui/surfaceStyles";
import { parseIngredientBlock } from "@shared/xenkitchen/kitchen";

export function PasteDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (rows: ReturnType<typeof parseIngredientBlock>) => void;
}) {
  const [text, setText] = useState("");
  const parsed = parseIngredientBlock(text);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Paste ingredients</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          One per line. Quantities and units are split out for you.
        </Typography>
        <TextField
          multiline
          minRows={6}
          fullWidth
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"2 cups flour\n1 tsp salt\n3 eggs, beaten"}
        />
        {parsed.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ ...sectionLabelSx, mb: 0.5 }}>
              Preview
            </Typography>
            {parsed.slice(0, 8).map((p, i) => (
              <Typography key={i} variant="body2">
                <b>{[p.quantity, p.unit].filter(Boolean).join(" ")}</b> {p.name}
                {p.note && <span style={{ opacity: 0.6 }}>, {p.note}</span>}
              </Typography>
            ))}
            {parsed.length > 8 && (
              <Typography variant="caption" color="text.secondary">
                …and {parsed.length - 8} more
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!parsed.length}
          onClick={() => {
            onAdd(parsed);
            setText("");
            onClose();
          }}
        >
          Add {parsed.length || ""}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
