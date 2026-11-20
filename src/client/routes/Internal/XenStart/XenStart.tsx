import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Popover,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { Link, useLocation } from "react-router-dom";
import { QUICK_LINK_LIMIT, searchUrl, type QuickLink, type XenStartConfig } from "@shared/xenstart";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useTitle } from "../../../hooks/useTitle";
import { useXenStart } from "../../../hooks/xenstart/useXenStart";
import { rememberRecentApp } from "../../../utils/recentApps";
import { LinkDialog, SettingsDialog } from "./Dialogs";
import QuickLinks, { quickLinkColumns } from "./QuickLinks";

const HubSections = lazy(() => import("./HubSections"));
const iconSx = {
  bgcolor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
  width: 44,
  height: 44,
} as const;
const conflictMessage = "XenStart changed in another tab. Review your changes and save again.";
type Dialog =
  { kind: "link"; link: QuickLink | null; base: XenStartConfig } | { kind: "settings"; base: XenStartConfig };

export default function XenStart() {
  useTitle("XenStart");
  const { pathname } = useLocation();
  useEffect(() => rememberRecentApp(pathname), [pathname]);
  const { query, save } = useXenStart();
  const config = query.data;
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [error, setError] = useState("");
  const [retryAfterConflict, setRetryAfterConflict] = useState(false);
  const saving = save.isPending;

  const openDialog = (next: Dialog) => {
    setError("");
    setRetryAfterConflict(false);
    setDialog(next);
  };
  const closeDialog = () => {
    if (saving) return;
    setDialog(null);
    setError("");
    if (dialog?.kind === "settings") requestAnimationFrame(() => settingsButton.current?.focus());
  };

  const update = async (apply: (latest: XenStartConfig) => XenStartConfig, base?: XenStartConfig) => {
    if (!config || saving) return;
    setError("");
    if (base && !retryAfterConflict && base.revision !== config.revision) {
      setRetryAfterConflict(true);
      setError(conflictMessage);
      return;
    }
    try {
      await save.mutateAsync(apply(config));
      setDialog(null);
      if (dialog?.kind === "settings") requestAnimationFrame(() => settingsButton.current?.focus());
    } catch (error) {
      setRetryAfterConflict(true);
      setError(error instanceof Error ? error.message : "Couldn't save XenStart.");
    }
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const url = config && searchUrl(config.engine, search);
    if (url) window.location.assign(url);
  };

  const move = (from: string, to: string) => {
    void update((latest) => {
      const links = [...latest.links];
      const fromIndex = links.findIndex((link) => link.id === from);
      const toIndex = links.findIndex((link) => link.id === to);
      if (fromIndex < 0 || toIndex < 0) throw new Error("That link is no longer available.");
      links.splice(toIndex, 0, ...links.splice(fromIndex, 1));
      return { ...latest, links };
    });
  };

  return (
    <Box component="main" sx={{ minHeight: "100dvh", px: { xs: 1.5, sm: 3 }, pb: 6 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", pt: { xs: 1.25, sm: 1.75 } }}>
        <IconButton component={Link} to="/internal" aria-label="Open Hub Home" color="primary" sx={iconSx}>
          <HomeOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton
          ref={settingsButton}
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-label="XenStart settings"
          aria-expanded={Boolean(anchor)}
          aria-controls={anchor ? "xenstart-options" : undefined}
          color="primary"
          sx={iconSx}
        >
          <SettingsOutlinedIcon fontSize="small" />
        </IconButton>
        <Popover
          id="xenstart-options"
          open={Boolean(anchor)}
          anchorEl={anchor}
          onClose={() => setAnchor(null)}
          disableRestoreFocus={dialog?.kind === "settings"}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: { sx: { p: 0.75, mt: 0.75, minWidth: 180, border: "1px solid", borderColor: "divider" } },
          }}
        >
          <Stack>
            <FormControlLabel
              label="Link editing"
              labelPlacement="start"
              sx={{ mx: 1, justifyContent: "space-between" }}
              control={
                <Switch
                  checked={editing}
                  disabled={!config || saving}
                  onChange={(_, checked) => {
                    setEditing(checked);
                    setAnchor(null);
                  }}
                />
              }
            />
            <Button
              sx={{ justifyContent: "flex-start", px: 1 }}
              disabled={!config}
              onClick={() => {
                if (!config) return;
                setAnchor(null);
                openDialog({ kind: "settings", base: config });
              }}
            >
              Settings
            </Button>
          </Stack>
        </Popover>
      </Box>
      <Box sx={{ mx: "auto", maxWidth: 800, pt: { xs: 3.25, sm: 6 } }}>
        <Typography component="h1" variant="h4" textAlign="center" sx={{ mb: 2 }}>
          XenStart
        </Typography>
        <Box
          component="form"
          role="search"
          onSubmit={submitSearch}
          sx={{ display: "flex", gap: 0.75, maxWidth: 550, mx: "auto", mb: 4 }}
        >
          <TextField
            fullWidth
            size="small"
            type="search"
            placeholder={config ? `Search with ${config.engine}` : "Search the web"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
              htmlInput: { "aria-label": "Web search" },
            }}
            sx={{ bgcolor: "background.paper" }}
          />
          <Button type="submit" variant="contained" disabled={!config}>
            Search
          </Button>
        </Box>
        <Box component="section" aria-labelledby="xenstart-links-title">
          <Typography id="xenstart-links-title" component="h2" variant="subtitle2" sx={{ mb: 1 }}>
            Quick links
          </Typography>
          {error && !dialog && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}
          {config ? (
            <QuickLinks
              links={config.links}
              editing={editing}
              saving={saving}
              onMove={move}
              onEdit={(link) => openDialog({ kind: "link", link, base: config })}
            />
          ) : query.isError ? (
            <Alert severity="error" action={<Button onClick={() => void query.refetch()}>Retry</Button>}>
              Couldn't load XenStart.
            </Alert>
          ) : (
            <ListSkeleton rows={QUICK_LINK_LIMIT} columns={quickLinkColumns} height={78} gap={1} />
          )}
        </Box>
        {!!config?.sections.length && (
          <Suspense fallback={null}>
            <HubSections sections={config.sections} />
          </Suspense>
        )}
      </Box>
      {dialog?.kind === "link" && (
        <LinkDialog
          link={dialog.link}
          onClose={closeDialog}
          saving={saving}
          error={error}
          onSave={(label, url) =>
            void update((latest) => {
              if (!dialog.link) {
                if (latest.links.length >= QUICK_LINK_LIMIT) throw new Error("Your quick-link grid is full.");
                return { ...latest, links: [...latest.links, { id: crypto.randomUUID(), label, url }] };
              }
              const original = dialog.link;
              const { id } = original;
              if (!latest.links.some((link) => link.id === id))
                throw new Error("That link was removed in another tab.");
              return {
                ...latest,
                links: latest.links.map((link) =>
                  link.id === id
                    ? {
                        ...link,
                        label: label === original.label ? link.label : label,
                        url: url === original.url ? link.url : url,
                      }
                    : link,
                ),
              };
            }, dialog.base)
          }
          onRemove={() =>
            void update(
              (latest) => ({ ...latest, links: latest.links.filter((link) => link.id !== dialog.link?.id) }),
              dialog.base,
            )
          }
        />
      )}
      {dialog?.kind === "settings" && (
        <SettingsDialog
          initialEngine={dialog.base.engine}
          initialSections={dialog.base.sections}
          onClose={closeDialog}
          saving={saving}
          error={error}
          onSave={(engine, sections) =>
            void update((latest) => {
              // On a retry, apply only the switches this user changed.
              const current = new Set(latest.sections);
              for (const section of dialog.base.sections) if (!sections.includes(section)) current.delete(section);
              for (const section of sections) if (!dialog.base.sections.includes(section)) current.add(section);
              return {
                ...latest,
                engine: engine === dialog.base.engine ? latest.engine : engine,
                sections: [...current],
              };
            }, dialog.base)
          }
        />
      )}
    </Box>
  );
}
