import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, InputAdornment, Popover, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import type { ChatGif } from "@shared/gif";
import { GIF_QUERY_MAX } from "@shared/gif";
import EmptyState from "../ui/EmptyState";
import { useGifSearch } from "../../hooks/chat/useGifs";

interface Props {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onPick: (gif: ChatGif) => void;
}

/** A GIF picker: trending ones to start, search as you type. A pick sends it at once. */
export default function GifPicker({ anchorEl, onClose, onPick }: Props) {
  const open = !!anchorEl;
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const search = useGifSearch(q, open);
  const gifs = search.data?.pages.flatMap((p) => p.gifs) ?? [];

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "left" }}
      transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      slotProps={{
        paper: {
          role: "dialog",
          "aria-label": "GIFs",
          sx: {
            mt: -1,
            width: { xs: "min(360px, calc(100vw - 16px))", sm: 380 },
            height: 440,
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <Box sx={{ p: 1.5, pb: 1 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search GIFs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          slotProps={{
            htmlInput: { "aria-label": "Search GIFs", maxLength: GIF_QUERY_MAX },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1.5 }}>
        {search.isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} aria-label="Loading GIFs" />
          </Box>
        ) : search.isError ? (
          <EmptyState
            title="Couldn't load GIFs"
            description={(search.error as any)?.response?.data?.message || "Try again in a moment."}
            sx={{ py: 3 }}
          />
        ) : gifs.length === 0 ? (
          <EmptyState title="No GIFs found" description="Try different words." sx={{ py: 3 }} />
        ) : (
          <>
            <Box sx={{ columnCount: 2, columnGap: 1 }}>
              {gifs.map((g) => (
                <Box
                  key={g.url}
                  component="button"
                  type="button"
                  onClick={() => {
                    onPick(g);
                    onClose();
                  }}
                  aria-label={g.title || "GIF"}
                  sx={{
                    display: "block",
                    width: "100%",
                    mb: 1,
                    p: 0,
                    border: 0,
                    borderRadius: 1,
                    overflow: "hidden",
                    cursor: "pointer",
                    bgcolor: "action.hover",
                    breakInside: "avoid",
                    "&:focus-visible": { outline: 2, outlineColor: "primary.main" },
                  }}
                >
                  <picture>
                    <source media="(prefers-reduced-motion: reduce)" srcSet={g.stillUrl} />
                    <Box
                      component="img"
                      src={g.url}
                      alt=""
                      loading="lazy"
                      width={g.width}
                      height={g.height}
                      sx={{ display: "block", width: "100%", height: "auto" }}
                    />
                  </picture>
                </Box>
              ))}
            </Box>
            {search.hasNextPage && (
              <Box sx={{ display: "flex", justifyContent: "center", pb: 1 }}>
                <Button size="small" onClick={() => search.fetchNextPage()} disabled={search.isFetchingNextPage}>
                  Show more
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ px: 1.5, py: 0.75, borderTop: 1, borderColor: "divider" }}
      >
        Powered by GIPHY
      </Typography>
    </Popover>
  );
}
