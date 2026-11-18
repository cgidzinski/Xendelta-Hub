import { Box } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { RADIUS } from "../../../../theme";
import { CategoryIconView } from "./kitchenIcons";

export interface BookCoverBook {
  icon: string;
  color: string;
  cover_url?: string | null;
}

interface BookCoverProps {
  book: BookCoverBook;
  /** Side length in px or any CSS length. Default fills its container. */
  size?: number | string | Record<string, number | string>;
}

/**
 * A recipe book's cover, always a square: its picture when it has one, otherwise a square tinted with the book's colour and
 * showing its icon. Used by the book picker, the book settings, the shared page and the PDF.
 */
export default function BookCover({ book, size = "100%" }: BookCoverProps) {
  return (
    <Box
      sx={{
        position: "relative",
        width: size,
        aspectRatio: "1 / 1",
        borderRadius: RADIUS.md,
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        bgcolor: alpha(book.color, 0.16),
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {book.cover_url ? (
        <Box
          component="img"
          src={book.cover_url}
          alt=""
          loading="lazy"
          sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <CategoryIconView icon={book.icon} sx={{ color: book.color, width: "50%", height: "50%" }} />
      )}
    </Box>
  );
}
