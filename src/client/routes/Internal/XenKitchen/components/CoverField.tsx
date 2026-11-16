import { useRef } from "react";
import { Button, Stack, Typography } from "@mui/material";
import UploadProgress from "../../../../components/ui/UploadProgress";
import BookCover, { type BookCoverBook } from "./BookCover";

interface Props {
  /** What the cover looks like now: the picture, or the book's icon and colour when it has none. */
  preview: BookCoverBook;
  busy?: boolean;
  /** 0-100 while a picture is being sent, otherwise null. */
  percent?: number | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}

/** A book's cover with Add, Change and Remove. It only reports what was chosen; the caller decides when to send it. */
export default function CoverField({ preview, busy = false, percent = null, onPick, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Stack direction="row" spacing={2} alignItems="center">
      <BookCover book={preview} size={84} />
      <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle2">Cover</Typography>
        <Typography variant="body2" color="text.secondary">
          A photo for the front of the book. It's cropped to a square.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" disabled={busy} onClick={() => input.current?.click()}>
            {preview.cover_url ? "Change cover" : "Add cover"}
          </Button>
          {preview.cover_url && (
            <Button size="small" color="inherit" disabled={busy} onClick={onRemove}>
              Remove
            </Button>
          )}
        </Stack>
        <UploadProgress percent={percent} label="cover" />
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onPick(file);
          }}
        />
      </Stack>
    </Stack>
  );
}
