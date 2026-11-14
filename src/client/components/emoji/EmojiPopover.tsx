import { Popover } from "@mui/material";
import type { CustomEmoji } from "@shared/emoji";
import EmojiPicker from "./EmojiPicker";

interface EmojiPopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onPick: (emoji: string) => void;
  /** The custom emoji to offer, and what picking one does (it closes the popover too). */
  custom?: CustomEmoji[];
  onPickCustom?: (emoji: CustomEmoji) => void;
  /** Which way it opens from the button. */
  placement?: "above" | "below";
}

/** The emoji picker in a popover under (or over) the button that opened it. It closes after a pick. */
export default function EmojiPopover({
  anchorEl,
  onClose,
  onPick,
  custom,
  onPickCustom,
  placement = "above",
}: EmojiPopoverProps) {
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
        custom={custom}
        onPickCustom={
          onPickCustom &&
          ((emoji) => {
            onPickCustom(emoji);
            onClose();
          })
        }
        onPick={(emoji) => {
          onPick(emoji);
          onClose();
        }}
      />
    </Popover>
  );
}
