import { useEffect, useState } from "react";
import { Box, Chip, IconButton, InputAdornment, TextField, Typography } from "@mui/material";
import ClearIcon from "@mui/icons-material/Clear";
import SearchIcon from "@mui/icons-material/Search";
import ErrorDisplay from "../../../../components/ErrorDisplay";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import EmptyState from "../../../../components/ui/EmptyState";
import { useNotebookSearch } from "../../../../hooks/xennote/usePages";
import type { PageHit } from "../../../../types/XenNotePage";
import { pageTitle } from "./pageTree";

const DELAY_MS = 250;

/** The text being searched, once typing has paused. */
export function useDebounced(value: string, ms = DELAY_MS): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
}

/** The field above the page list. */
export function SearchBox({ value, onChange }: SearchBoxProps) {
  return (
    <TextField
      fullWidth
      size="small"
      placeholder="Search pages"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === "Escape" && onChange("")}
      slotProps={{
        htmlInput: { "aria-label": "Search pages" },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <IconButton size="small" aria-label="Clear the search" onClick={() => onChange("")}>
              <ClearIcon fontSize="small" />
            </IconButton>
          ) : undefined,
        },
      }}
    />
  );
}

interface SearchResultsProps {
  query: string;
  notebookId: string;
  onOpen: (hit: PageHit) => void;
}

/** What a search found, in this notebook or in all the person's notebooks. */
export default function SearchResults({ query, notebookId, onOpen }: SearchResultsProps) {
  const [everywhere, setEverywhere] = useState(false);
  const q = useDebounced(query.trim());
  const { data, isPending, isError, error, refetch } = useNotebookSearch(q, {
    notebook: everywhere ? undefined : notebookId,
  });

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", gap: 0.75 }} role="group" aria-label="Where to look">
        <Chip
          size="small"
          label="This notebook"
          color={everywhere ? "default" : "primary"}
          variant={everywhere ? "outlined" : "filled"}
          onClick={() => setEverywhere(false)}
        />
        <Chip
          size="small"
          label="All notebooks"
          color={everywhere ? "primary" : "default"}
          variant={everywhere ? "filled" : "outlined"}
          onClick={() => setEverywhere(true)}
        />
      </Box>
      {isPending && q ? (
        <ListSkeleton rows={3} height={64} />
      ) : isError ? (
        <ErrorDisplay error={error ?? null} title="Couldn't search" onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title="No pages found"
          description={everywhere ? "Nothing matches in any of your notebooks." : "Try all notebooks."}
        />
      ) : (
        (data ?? []).map((hit) => (
          <Box
            key={hit.id}
            component="button"
            type="button"
            onClick={() => onOpen(hit)}
            sx={{
              all: "unset",
              boxSizing: "border-box",
              display: "block",
              width: "100%",
              p: 1.25,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
              "&:focus-visible": { outline: 2, outlineStyle: "solid", outlineColor: "primary.main" },
            }}
          >
            <Typography sx={{ fontWeight: 500 }} noWrap>
              {pageTitle(hit.title)}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" noWrap>
              {[hit.notebook_name, hit.section_name].filter(Boolean).join(" / ")}
              {hit.matched_alias ? ` · also called "${hit.matched_alias}"` : ""}
            </Typography>
            {hit.snippet && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
              >
                {hit.snippet}
              </Typography>
            )}
          </Box>
        ))
      )}
    </Box>
  );
}
