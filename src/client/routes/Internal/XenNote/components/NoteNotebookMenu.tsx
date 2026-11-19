import { Menu, MenuItem } from "@mui/material";

interface NoteNotebookMenuProps {
  anchor: HTMLElement | null;
  /** The notebooks the person can put notes in. */
  notebooks: Array<{ _id: string; name: string }>;
  value: string | null | undefined;
  /** `null` means private (no notebook). */
  onPick: (notebookId: string | null) => void;
  onClose: () => void;
}

/** Choose which notebook a note lives in, or keep it private. */
export default function NoteNotebookMenu({ anchor, notebooks, value, onPick, onClose }: NoteNotebookMenuProps) {
  return (
    <Menu anchorEl={anchor} open={!!anchor} onClose={onClose}>
      {[{ _id: "", name: "Private (only me)" }, ...notebooks].map((b) => (
        <MenuItem key={b._id} selected={(value ?? "") === b._id} onClick={() => onPick(b._id || null)}>
          {b.name}
        </MenuItem>
      ))}
    </Menu>
  );
}
