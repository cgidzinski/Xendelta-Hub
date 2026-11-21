import { Box, IconButton, InputAdornment, TextField } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { useXenNoteSearch } from "../searchContext";

/** The XenNote search at the top of the rail; what is typed opens results in the main window. */
export default function NoteRailSearch() {
  const { query, setQuery } = useXenNoteSearch();
  return (
    <Box sx={{ flexShrink: 0, mb: 0.75 }}>
      <TextField
        fullWidth
        size="small"
        placeholder="Search XenNote…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        slotProps={{
          htmlInput: { "aria-label": "Search XenNote", autoComplete: "off", spellCheck: false },
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
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
      {/* Sits level with the Sections and Pages rules, inset from both sides. */}
      <Box sx={{ height: "1px", bgcolor: "divider", mt: 0 }} />
    </Box>
  );
}
