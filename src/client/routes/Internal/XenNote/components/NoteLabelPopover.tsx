import { Autocomplete, Box, Popover, TextField } from "@mui/material";

interface NoteLabelPopoverProps {
  anchor: HTMLElement | null;
  options: string[];
  value: string[];
  onChange: (labels: string[]) => void;
  onClose: () => void;
}

/** Add or remove a note's labels, with the labels already used suggested. */
export default function NoteLabelPopover({ anchor, options, value, onChange, onClose }: NoteLabelPopoverProps) {
  return (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "left" }}
      transformOrigin={{ vertical: "bottom", horizontal: "left" }}
    >
      <Box sx={{ p: 1.5, width: 280 }}>
        <Autocomplete
          multiple
          freeSolo
          size="small"
          options={options}
          value={value}
          onChange={(_, v) => onChange(v as string[])}
          renderTags={() => null}
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              placeholder="Add a label"
              slotProps={{ htmlInput: { ...params.inputProps, "aria-label": "Add a label" } }}
            />
          )}
        />
      </Box>
    </Popover>
  );
}
