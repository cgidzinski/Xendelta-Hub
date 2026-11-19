import { Stack, TextField } from "@mui/material";
import type { XenNoteLink } from "../../../../types/XenNote";

interface NoteLinkFieldsProps {
  link: XenNoteLink;
  error: boolean;
  readOnly: boolean;
  onChange: (link: XenNoteLink) => void;
}

/** The web address, title and description of a link note. */
export default function NoteLinkFields({ link, error, readOnly, onChange }: NoteLinkFieldsProps) {
  return (
    <Stack spacing={1.5}>
      <TextField
        label="Web address"
        placeholder="https://"
        value={link.url}
        onChange={(e) => onChange({ ...link, url: e.target.value })}
        error={error}
        helperText={error ? "Use a web address that starts with http:// or https://" : " "}
        fullWidth
        disabled={readOnly}
      />
      <TextField
        label="Link title"
        value={link.title}
        onChange={(e) => onChange({ ...link, title: e.target.value })}
        fullWidth
        disabled={readOnly}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <TextField
        label="Description"
        value={link.description}
        onChange={(e) => onChange({ ...link, description: e.target.value })}
        fullWidth
        multiline
        minRows={2}
        disabled={readOnly}
        slotProps={{ htmlInput: { maxLength: 1000 } }}
      />
    </Stack>
  );
}
