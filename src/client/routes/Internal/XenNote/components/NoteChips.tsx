import { Box, Chip } from "@mui/material";

interface NoteChipsProps {
  labels: string[];
  readOnly: boolean;
  onRemoveLabel: (label: string) => void;
}

/** The labels a note has, as chips (labels can be removed unless the note is view-only). */
export default function NoteChips({ labels, readOnly, onRemoveLabel }: NoteChipsProps) {
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
      {labels.map((label) => (
        <Chip
          key={label}
          size="small"
          variant="outlined"
          label={label}
          onDelete={readOnly ? undefined : () => onRemoveLabel(label)}
        />
      ))}
    </Box>
  );
}
