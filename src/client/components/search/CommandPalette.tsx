import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Dialog,
  InputBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import SubdirectoryArrowLeftIcon from "@mui/icons-material/SubdirectoryArrowLeft";
import { useNavigate } from "react-router-dom";
import { useSearch } from "../../hooks/search/useSearch";
import { matchCommands } from "./commands";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface Row {
  id: string;
  title: string;
  subtitle?: string;
  path: string;
  /** The section this row sits under. */
  section: string;
  icon?: React.ElementType;
}

/** Wait for typing to pause before searching: the server is asked once per pause, not per key. */
function useDebounced(value: string, ms = 220) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Ctrl/Cmd+K: one box to jump to an app or page, or to find a person, note, notebook, file, recipe, routine, expense or
 * budget item. Arrow keys move, Enter opens, Escape closes.
 */
export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const q = query.trim();
  const debounced = useDebounced(open ? q : "");
  const canSearch = open && q.length >= 2 && q.length <= 100;
  const queryReady = canSearch && debounced === q;
  const search = useSearch(queryReady ? q : "");
  const groups = queryReady && !search.isError ? search.data : undefined;

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedId(null);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const commands = matchCommands(q).map<Row>((c) => ({
      id: c.id,
      title: c.label,
      path: c.path,
      section: "Go to",
      icon: c.icon,
    }));
    const found = (groups ?? []).flatMap((g) =>
      g.hits.map<Row>((h) => ({
        id: `${g.kind}:${h.id}`,
        title: h.title,
        subtitle: h.subtitle,
        path: h.link,
        section: g.label,
      })),
    );
    return [...commands.slice(0, q ? 5 : commands.length), ...found];
  }, [q, groups]);

  const active = Math.max(
    0,
    rows.findIndex((row) => row.id === selectedId),
  );
  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, rows]);

  const go = (row: Row | undefined) => {
    if (!row) return;
    onClose();
    navigate(row.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedId(rows[Math.min(rows.length - 1, active + 1)]?.id ?? null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedId(rows[Math.max(0, active - 1)]?.id ?? null);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(rows[active]);
    }
  };

  const failed = queryReady && (search.isError || search.isPaused);
  const searching = canSearch && !failed && (!queryReady || search.isPending);
  const noResults = queryReady && !failed && search.isSuccess && rows.length === 0;
  let lastSection = "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={phone}
      fullWidth
      maxWidth="sm"
      aria-label="Search"
      slotProps={{ paper: { sx: phone ? {} : { position: "absolute", top: "12vh", m: 0, maxHeight: "70vh" } } }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 1.25,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <SearchIcon color="action" />
        <InputBase
          autoFocus
          fullWidth
          placeholder="Search or jump to…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedId(null);
          }}
          onKeyDown={onKeyDown}
          inputProps={{
            role: "combobox",
            "aria-label": "Search",
            "aria-expanded": true,
            "aria-controls": "command-palette-list",
            "aria-activedescendant": rows[active] ? `palette-row-${active}` : undefined,
            autoComplete: "off",
            spellCheck: false,
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: { xs: "none", sm: "block" }, whiteSpace: "nowrap" }}
        >
          Esc to close
        </Typography>
      </Box>
      <List
        ref={listRef}
        id="command-palette-list"
        role="listbox"
        aria-label="Results"
        disablePadding
        sx={{ overflowY: "auto", py: 0.5 }}
      >
        {rows.map((row, i) => {
          const header = row.section !== lastSection;
          lastSection = row.section;
          return (
            <Box key={row.id} component="li" sx={{ listStyle: "none" }}>
              {header && (
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ display: "block", px: 2, pt: 1.25, lineHeight: 1.6 }}
                >
                  {row.section}
                </Typography>
              )}
              <ListItemButton
                id={`palette-row-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                selected={i === active}
                onMouseMove={() => i !== active && setSelectedId(row.id)}
                onClick={() => go(row)}
                sx={{ py: 0.75 }}
              >
                {row.icon && (
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <row.icon fontSize="small" />
                  </ListItemIcon>
                )}
                <ListItemText
                  primary={row.title}
                  secondary={row.subtitle}
                  slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                />
                {i === active && <SubdirectoryArrowLeftIcon fontSize="small" color="action" />}
              </ListItemButton>
            </Box>
          );
        })}
      </List>
      {(searching || noResults || failed || q.length > 100) && (
        <Typography role="status" color={failed ? "error" : "text.secondary"} sx={{ px: 2, py: 2 }}>
          {searching && "Searching…"}
          {noResults && `Nothing found for “${q}”.`}
          {failed && "Search isn't available right now."}
          {q.length > 100 && "Use 100 characters or fewer to search within apps."}
        </Typography>
      )}
    </Dialog>
  );
}
