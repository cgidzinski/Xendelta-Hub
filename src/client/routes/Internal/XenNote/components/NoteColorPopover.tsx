import { Box, IconButton, Popover } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { NOTE_COLORS } from "@shared/xennote/notes";
import { NOTE_COLOR_LABELS, swatchColor } from "../noteColors";

interface NoteColorPopoverProps {
  anchor: HTMLElement | null;
  value: string;
  alignRight?: boolean;
  onPick: (color: (typeof NOTE_COLORS)[number]) => void;
  onClose: () => void;
}

/** The row of colour swatches for a note. */
export default function NoteColorPopover({ anchor, value, alignRight, onPick, onClose }: NoteColorPopoverProps) {
  const theme = useTheme();
  const horizontal = alignRight ? "right" : "left";
  return (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal }}
      transformOrigin={{ vertical: "bottom", horizontal }}
    >
      <Box sx={{ display: "flex", gap: 1, p: 1.5 }} role="group" aria-label="Note colour">
        {NOTE_COLORS.map((c) => {
          const main = swatchColor(theme, c);
          return (
            <IconButton
              key={c}
              size="small"
              aria-label={`${NOTE_COLOR_LABELS[c]} colour`}
              aria-pressed={value === c}
              onClick={() => onPick(c)}
              sx={{
                width: 28,
                height: 28,
                bgcolor: main ?? "background.paper",
                border: 2,
                borderColor: value === c ? "text.primary" : "divider",
              }}
            />
          );
        })}
      </Box>
    </Popover>
  );
}
