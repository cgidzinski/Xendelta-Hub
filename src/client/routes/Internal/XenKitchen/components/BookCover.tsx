import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { RADIUS } from "../../../../theme";
import { CategoryIconView } from "./kitchenIcons";

export interface BookCoverBook {
  name: string;
  icon: string;
  color: string;
  cover_url?: string | null;
}

interface BookCoverProps {
  book: BookCoverBook;
  /** Width in px or any CSS length; the height follows (3:4). Default fills its container. */
  width?: number | string | Record<string, number | string>;
  /** Write the book's name on a generated cover. Off for small tiles that print the name beside the cover. */
  showTitle?: boolean;
}

/**
 * A recipe book's cover, always 3:4. The picture when the book has one; otherwise a cover made from its colour, icon and
 * name, with a spine down the left, so every book still looks like a book. Used on the shelf, the shared page and the PDF.
 */
export default function BookCover({ book, width = "100%", showTitle = false }: BookCoverProps) {
  return (
    <Box
      sx={{
        position: "relative",
        width,
        aspectRatio: "3 / 4",
        borderRadius: RADIUS.md,
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        bgcolor: alpha(book.color, 0.16),
        flexShrink: 0,
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
        <>
          <Box sx={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "9%", bgcolor: book.color }} />
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              pl: "9%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              p: 1,
            }}
          >
            <CategoryIconView icon={book.icon} sx={{ color: book.color, fontSize: showTitle ? 40 : "42%" }} />
            {showTitle && (
              <Typography
                variant="subtitle2"
                sx={{
                  textAlign: "center",
                  fontWeight: 700,
                  px: 1,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {book.name}
              </Typography>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
