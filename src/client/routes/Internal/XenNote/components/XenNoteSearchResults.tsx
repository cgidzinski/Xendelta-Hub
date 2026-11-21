import { useEffect, useState } from "react";
import {
  Box,
  IconButton,
  InputAdornment,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import CloseIcon from "@mui/icons-material/Close";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../../../../hooks/search/useSearch";
import { useXenNoteSearch } from "../searchContext";
import EmptyState from "../../../../components/ui/EmptyState";
import ListSkeleton from "../../../../components/ui/ListSkeleton";

/** Wait for typing to pause before searching: the server is asked once per pause, not per key. */
function useDebounced(value: string, ms = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

// What the rail search finds: everything a person has in XenNote, nothing from other apps.
const SCOPE = ["notes", "notebooks", "pages"];

/** The search results filling the main window while someone types in the rail search. */
export default function XenNoteSearchResults() {
  const { query, setQuery } = useXenNoteSearch();
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("md"));
  const q = query.trim();
  const debounced = useDebounced(q);
  const search = useSearch(debounced);

  const groups = (q.length >= 2 ? (search.data ?? []) : []).filter((group) => SCOPE.includes(group.kind));
  const searching = q.length >= 2 && (search.isFetching || debounced !== q);

  const go = (link: string) => {
    setQuery("");
    navigate(link);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100dvh - 64px)",
        height: { md: "calc(100dvh - 64px)" },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 3,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <SearchIcon color="action" />
        {phone ? (
          <TextField
            autoFocus
            fullWidth
            size="small"
            variant="standard"
            placeholder="Search XenNote…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            slotProps={{
              htmlInput: { "aria-label": "Search XenNote", autoComplete: "off", spellCheck: false },
              input: {
                disableUnderline: true,
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label="Clear the search" edge="end" onClick={() => setQuery("")}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
        ) : (
          <Typography variant="subtitle1" noWrap sx={{ flex: 1 }}>
            Search XenNote
          </Typography>
        )}
        {!phone && (
          <IconButton aria-label="Close the search" onClick={() => setQuery("")}>
            <CloseIcon />
          </IconButton>
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 2, maxWidth: 900, width: "100%", mx: "auto" }}>
        {searching ? (
          <ListSkeleton rows={6} height={56} />
        ) : search.isError ? (
          <Typography color="error" variant="body2">
            Search isn't available right now.
          </Typography>
        ) : q.length >= 2 && groups.length === 0 ? (
          <EmptyState
            icon={<SearchIcon />}
            title={`Nothing found for “${q}”`}
            description="Try a different word, or search a notebook or page name."
          />
        ) : (
          groups.map((group) => (
            <Box key={group.kind} component="section" sx={{ mb: 3 }}>
              <Typography variant="overline" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                {group.label}
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {group.hits.map((hit) => (
                  <ListItemButton
                    key={hit.id}
                    onClick={() => go(hit.link)}
                    sx={{ border: 1, borderColor: "divider", borderRadius: 2, px: 1.5 }}
                  >
                    <ListItemText
                      primary={hit.title}
                      secondary={hit.subtitle}
                      slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                    />
                  </ListItemButton>
                ))}
              </Box>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}
