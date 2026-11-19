import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import NotesIcon from "@mui/icons-material/Notes";

interface NoteTypeToggleProps {
  isList: boolean;
  onChange: (kind: "note" | "list") => void;
}

/** Note or List, shown while a new note is still empty. */
export default function NoteTypeToggle({ isList, onChange }: NoteTypeToggleProps) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={isList ? "list" : "note"}
      aria-label="Note or list"
      onChange={(_, v: "note" | "list" | null) => v && onChange(v)}
      sx={{ alignSelf: "flex-start" }}
    >
      <ToggleButton value="note" sx={{ gap: 0.75, px: 2, textTransform: "none" }}>
        <NotesIcon fontSize="small" />
        Note
      </ToggleButton>
      <ToggleButton value="list" sx={{ gap: 0.75, px: 2, textTransform: "none" }}>
        <CheckBoxOutlinedIcon fontSize="small" />
        List
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
