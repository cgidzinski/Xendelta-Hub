import { useEffect, useRef, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PrintIcon from "@mui/icons-material/Print";
import { useNavigate } from "react-router-dom";
import BookPrintView, { type CookbookBook } from "./BookPrintView";
import type { CookbookSection } from "./cookbook";

interface Props {
  book: CookbookBook;
  owner?: string | null;
  sections: CookbookSection[];
  photos: boolean;
  /** Where "Back" goes. */
  backTo: string;
}

/** Wait for every picture on the page, but never longer than a few seconds (a broken link must not block printing). */
async function picturesReady(): Promise<void> {
  const waits = Array.from(document.images).map((img) => img.decode().catch(() => undefined));
  await Promise.race([Promise.all(waits), new Promise((resolve) => setTimeout(resolve, 6000))]);
}

/**
 * The cookbook on its own page, with a bar to go back or print. Once the pictures have loaded it opens the browser's print
 * window; "Save as PDF" there makes the file. The bar is left out of the printout.
 */
export default function CookbookPrint({ book, owner, sections, photos, backTo }: Props) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const printed = useRef(false);

  useEffect(() => {
    let live = true;
    void picturesReady().then(() => {
      if (!live) return;
      setReady(true);
      if (!printed.current) {
        printed.current = true;
        // A beat so the pages are laid out before the print window takes its picture of them.
        setTimeout(() => window.print(), 150);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <Box
      sx={{
        bgcolor: "background.default",
        minHeight: "100vh",
        pb: 4,
        "@media print": { bgcolor: "common.white", pb: 0 },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ p: 1.5, maxWidth: 800, mx: "auto", "@media print": { display: "none" } }}
      >
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)}>
          Back
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
          {ready ? "In the print window, choose Save as PDF." : "Getting the pictures ready…"}
        </Typography>
        <Button variant="contained" startIcon={<PrintIcon />} disabled={!ready} onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </Stack>
      <BookPrintView book={book} owner={owner} sections={sections} photos={photos} />
    </Box>
  );
}
