import { Box, Chip } from "@mui/material";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";

interface NoteChipsProps {
  /** The notebook's name, or null when the note is in none. */
  notebookName: string | null;
  labels: string[];
  readOnly: boolean;
  onRemoveLabel: (label: string) => void;
}

/** The notebook and labels a note has, as chips (labels can be removed unless the note is view-only). */
export default function NoteChips({ notebookName, labels, readOnly, onRemoveLabel }: NoteChipsProps) {
  return (
    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
      {notebookName !== null && <Chip size="small" icon={<MenuBookOutlinedIcon />} label={notebookName} />}
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
