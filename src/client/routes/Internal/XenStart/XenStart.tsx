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
} from "@mui/material";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { Link, useLocation } from "react-router-dom";
import {
  DEFAULT_APPEARANCE,
  defaultXenStartConfig,
  searchUrl,
  widgetLayout,
  WIDGET_REGIONS,
  WIDGET_TYPES,
  type QuickLink,
  type WidgetRegion,
  type WidgetType,
  type XenStartConfig,
} from "@shared/xenstart";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useTitle } from "../../../hooks/useTitle";
import { useXenStart } from "../../../hooks/xenstart/useXenStart";
import { RADIUS } from "../../../theme";
import { rememberRecentApp } from "../../../utils/recentApps";
import { LinkDialog, SettingsDialog } from "./Dialogs";
import QuickLinks, { quickLinkColumns } from "./QuickLinks";
import { BackgroundImage, Clock } from "./Appearance";

import HubWidgetProvider from "./HubWidgetProvider";
import WidgetBoard from "./WidgetBoard";
import { WidgetPicker, WidgetSettings } from "./WidgetDialogs";

const HubWidget = lazy(() => import("./HubSections"));
const iconSx = {
  bgcolor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
  width: 44,
  height: 44,
} as const;
const conflictMessage = "XenStart changed in another tab. Review your changes and save again.";
type Dialog =
  | { kind: "link"; link: QuickLink | null; base: XenStartConfig }
  | { kind: "settings"; base: XenStartConfig }
  | { kind: "picker"; region: WidgetRegion; base: XenStartConfig }
  | { kind: "widget"; widget: WidgetType; region: WidgetRegion; base: XenStartConfig };

export default function XenStart() {
  useTitle("XenStart");
  const { pathname } = useLocation();
  useEffect(() => rememberRecentApp(pathname), [pathname]);
  const { query, save } = useXenStart();
  const config = query.data;
  const appearance = config?.appearance ?? DEFAULT_APPEARANCE;
  const layout = widgetLayout(config ?? defaultXenStartConfig());
  const placed = WIDGET_REGIONS.flatMap((region) => layout[region]);
  const available = WIDGET_TYPES.filter((widget) => !placed.includes(widget));
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

  const update = async (apply: (latest: XenStartConfig) => XenStartConfig, base?: XenStartConfig, focusId?: string) => {
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
      if (dialog?.kind === "settings" || focusId) {
        requestAnimationFrame(() => {
          const target = focusId ? document.getElementById(focusId) : null;
          if (target && !target.matches(":disabled")) target.focus();
          else settingsButton.current?.focus();
        });
      }
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

  const renderWidget = (widget: WidgetType, region: WidgetRegion) => {
    const compact = region === "left" || region === "right";
    if (widget === "clock") return <Clock compact={compact} format={config?.clockFormat} />;
    if (widget === "search")
      return (
        <Box component="form" role="search" onSubmit={submitSearch} sx={{ maxWidth: 550, mx: "auto", width: "100%" }}>
          <TextField
            fullWidth
            type="search"
            placeholder={config ? `Search with ${config.engine}` : "Search the web"}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{
              input: {
                sx: { bgcolor: "background.paper", borderRadius: RADIUS.pill, pl: 2 },
                startAdornment: (
                  <InputAdornment position="start" sx={{ mr: 1.25, color: "text.secondary" }}>
                    <SearchIcon fontSize="small" aria-hidden />
                  </InputAdornment>
                ),
              },
              htmlInput: { "aria-label": "Web search", enterKeyHint: "search" },
            }}
          />
        </Box>
      );
    if (widget === "links")
      return (
        <Box component="section" aria-label="Quick links">
          {config ? (
            <QuickLinks
              links={config.links}
              rows={appearance.rows}
              columns={appearance.columns}
              compact={compact}
              editing={editing}
              saving={saving}
              onMove={move}
              onEdit={(link) => openDialog({ kind: "link", link, base: config })}
            />
          ) : (
            <ListSkeleton
              rows={appearance.rows * appearance.columns}
              columns={quickLinkColumns(appearance.columns)}
              height={78}
              gap={1}
            />
          )}
        </Box>
      );
    return (
      <Suspense fallback={null}>
        <HubWidget widget={widget} compact={compact} />
      </Suspense>
    );
  };

  return (
    <Box
      component="main"
      aria-label="XenStart"
      sx={{ position: "relative", isolation: "isolate", minHeight: "100dvh", px: { xs: 1.5, sm: 3 }, pb: 6 }}
    >
      {appearance.backgroundUrl && <BackgroundImage key={appearance.backgroundUrl} url={appearance.backgroundUrl} />}
      <Box sx={{ display: "flex", justifyContent: "space-between", pt: { xs: 1.25, sm: 1.75 } }}>
        <IconButton component={Link} to="/internal" aria-label="Open Hub Home" color="primary" sx={iconSx}>
          <HomeOutlinedIcon fontSize="small" />
        </IconButton>
        <Stack direction="row" alignItems="center" spacing={1}>
          {editing && (
            <Button
              variant="contained"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                settingsButton.current?.focus();
              }}
              sx={{ minHeight: 44, borderRadius: RADIUS.pill, px: 2 }}
            >
              Done
            </Button>
          )}
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
        </Stack>
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
              label="Edit mode"
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
      <Box sx={{ pt: { xs: 3.25, sm: 6 } }}>
        {error && !dialog && (
          <Alert severity="error" sx={{ maxWidth: 800, mx: "auto", mb: 2 }}>
            {error}
          </Alert>
        )}
        {query.isError && !config ? (
          <Alert
            severity="error"
            sx={{ maxWidth: 800, mx: "auto" }}
            action={<Button onClick={() => void query.refetch()}>Retry</Button>}
          >
            Couldn't load XenStart.
          </Alert>
        ) : (
          <HubWidgetProvider enabled={placed.includes("pinned") || placed.includes("attention")}>
            <WidgetBoard
              layout={layout}
              editing={editing}
              saving={saving}
              canAdd={available.length > 0}
              onAdd={(region) => config && openDialog({ kind: "picker", region, base: config })}
              onEdit={(widget, region) => config && openDialog({ kind: "widget", widget, region, base: config })}
              renderWidget={renderWidget}
            />
          </HubWidgetProvider>
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
                if (latest.links.length >= latest.appearance.rows * latest.appearance.columns)
                  throw new Error("Your quick-link grid is full.");
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
          initialBackground={dialog.base.appearance.backgroundUrl}
          onClose={closeDialog}
          saving={saving}
          error={error}
          onSave={(backgroundUrl) =>
            void update(
              (latest) => ({
                ...latest,
                appearance: {
                  ...latest.appearance,
                  backgroundUrl:
                    backgroundUrl === dialog.base.appearance.backgroundUrl
                      ? latest.appearance.backgroundUrl
                      : backgroundUrl,
                },
              }),
              dialog.base,
            )
          }
        />
      )}
      {dialog?.kind === "picker" && (
        <WidgetPicker
          region={dialog.region}
          available={available}
          onClose={closeDialog}
          saving={saving}
          error={error}
          onAdd={(widget) =>
            void update(
              (latest) => {
                const current = widgetLayout(latest);
                if (WIDGET_REGIONS.some((region) => current[region].includes(widget)))
                  throw new Error("This widget is already on the page.");
                return { ...latest, layout: { ...current, [dialog.region]: [...current[dialog.region], widget] } };
              },
              dialog.base,
              `xenstart-edit-${widget}`,
            )
          }
        />
      )}
      {dialog?.kind === "widget" && (
        <WidgetSettings
          widget={dialog.widget}
          config={dialog.base}
          linkCount={config?.links.length ?? 0}
          onClose={closeDialog}
          saving={saving}
          error={error}
          onRemove={() =>
            void update(
              (latest) => {
                const current = widgetLayout(latest);
                const region = WIDGET_REGIONS.find((region) => current[region].includes(dialog.widget));
                return region
                  ? {
                      ...latest,
                      layout: { ...current, [region]: current[region].filter((widget) => widget !== dialog.widget) },
                    }
                  : latest;
              },
              dialog.base,
              `xenstart-add-${dialog.region}`,
            )
          }
          onSave={({ engine, rows, columns, clockFormat }) =>
            void update((latest) => {
              if (!WIDGET_REGIONS.some((region) => widgetLayout(latest)[region].includes(dialog.widget)))
                throw new Error("This widget was removed in another tab.");
              return {
                ...latest,
                engine: engine === dialog.base.engine ? latest.engine : engine,
                clockFormat: clockFormat === (dialog.base.clockFormat ?? "locale") ? latest.clockFormat : clockFormat,
                appearance: {
                  ...latest.appearance,
                  rows: rows === dialog.base.appearance.rows ? latest.appearance.rows : rows,
                  columns: columns === dialog.base.appearance.columns ? latest.appearance.columns : columns,
                },
              };
            }, dialog.base)
          }
        />
      )}
    </Box>
  );
}
