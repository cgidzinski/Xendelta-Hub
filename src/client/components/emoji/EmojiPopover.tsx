import { Popover } from "@mui/material";
import EmojiPicker from "./EmojiPicker";

interface EmojiPopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onPick: (emoji: string) => void;
  /** Which way it opens from the button. */
  placement?: "above" | "below";
}

/** The emoji picker in a popover under (or over) the button that opened it. It closes after a pick. */
export default function EmojiPopover({ anchorEl, onClose, onPick, placement = "above" }: EmojiPopoverProps) {
  return (
    <Popover
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: placement === "above" ? "top" : "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: placement === "above" ? "bottom" : "top", horizontal: "left" }}
      slotProps={{ paper: { sx: { mt: placement === "above" ? -1 : 1 } } }}
    >
      <EmojiPicker
        autoFocus
        onPick={(emoji) => {
          onPick(emoji);
          onClose();
        }}
      />
    </Popover>
  );
}
