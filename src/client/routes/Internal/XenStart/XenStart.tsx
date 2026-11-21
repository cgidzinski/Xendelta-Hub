import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Box, Button, IconButton, InputAdornment, Popover, Stack, TextField } from "@mui/material";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { Link, useLocation } from "react-router-dom";
import {
  DEFAULT_APPEARANCE,
  DEFAULT_BACKGROUND_FIT,
  defaultXenStartConfig,
  linksFromSlots,
  moveQuickLink,
  parseQuickLinkUrl,
  quickLinkSlots,
  searchUrl,
  widgetLayout,
  mergeRegionStyles,
  WIDGET_REGIONS,
  WIDGET_TYPES,
  type QuickLink,
  type RegionStyles,
  type WidgetRegion,
  type WidgetType,
  type XenStartConfig,
} from "@shared/xenstart";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { useTitle } from "../../../hooks/useTitle";
import { useXenStart } from "../../../hooks/xenstart/useXenStart";
import { RADIUS } from "../../../theme";
import { rememberRecentApp } from "../../../utils/recentApps";
import { LinkDialog, SettingsDialog, type BackgroundDraft } from "./Dialogs";
import QuickLinks, { quickLinkColumns } from "./QuickLinks";
import { BackgroundImage, Clock } from "./Appearance";

import HubWidgetProvider from "./HubWidgetProvider";
import WidgetBoard, { widgetNames } from "./WidgetBoard";
import WidgetControls from "./WidgetControls";
import { WidgetPicker } from "./WidgetDialogs";

const HubWidget = lazy(() => import("./HubSections"));
const TodayWidget = lazy(() => import("./TodayWidget"));
const iconSx = {
  bgcolor: "background.paper",
  border: "1px solid",
  borderColor: "divider",
  width: 44,
  height: 44,
} as const;
const conflictMessage = "XenStart changed in another tab. Review your changes and save again.";
type Dialog =
  | { kind: "link"; link: QuickLink | null; slot: number; base: XenStartConfig }
  | { kind: "settings"; base: XenStartConfig; regionStyles: RegionStyles; background: BackgroundDraft }
  | { kind: "picker"; region: WidgetRegion; base: XenStartConfig };

export default function XenStart() {
  useTitle("XenStart");
  const { pathname } = useLocation();
  useEffect(() => rememberRecentApp(pathname), [pathname]);
  const { query, save, background } = useXenStart();
  const confirm = useConfirm();
  const config = query.data;
  const appearance = config?.appearance ?? DEFAULT_APPEARANCE;
  const layout = widgetLayout(config ?? defaultXenStartConfig());
  const placed = WIDGET_REGIONS.flatMap((region) => layout[region]);
  const available = WIDGET_TYPES.filter((widget) => !placed.includes(widget));
  const [editing, setEditing] = useState(false);
  const [pendingLinks, setPendingLinks] = useState<{ revision: number; links: QuickLink[] }>();
  const [search, setSearch] = useState("");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const backgroundDraft = dialog?.kind === "settings" ? dialog.background : undefined;
  const draftUrl = backgroundDraft?.backgroundUrl.trim();
  const imageUrl =
    draftUrl !== undefined && (!draftUrl || parseQuickLinkUrl(draftUrl)?.protocol === "https:")
      ? draftUrl
      : appearance.backgroundUrl;
  const imageBlob = backgroundDraft?.file ?? (imageUrl || backgroundDraft?.clearUpload ? undefined : background);
  const imageFit = backgroundDraft?.backgroundFit ?? config?.backgroundFit;
  const imageKey =
    imageBlob instanceof File
      ? `${imageBlob.name}:${imageBlob.lastModified}:${imageBlob.size}`
      : imageBlob
        ? config?.backgroundImageId
        : imageUrl;
  const regionStyles =
    dialog?.kind === "settings"
      ? mergeRegionStyles(dialog.base.regionStyles ?? {}, dialog.regionStyles, config?.regionStyles ?? {})
      : config?.regionStyles;
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

  const update = async (
    apply: (latest: XenStartConfig) => XenStartConfig,
    base?: XenStartConfig,
    focusId?: string,
    background?: File,
  ) => {
    if (!config || saving) return;
    setError("");
    if (base && !retryAfterConflict && base.revision !== config.revision) {
      setRetryAfterConflict(true);
      setError(conflictMessage);
      return;
    }
    try {
      await save.mutateAsync({ config: apply(config), background });
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

  const move = (from: string, to: number) => {
    if (pendingLinks) return;
    void update((latest) => {
      const links = moveQuickLink(latest.links, from, to, latest.appearance.rows * latest.appearance.columns);
      if (!links) throw new Error("That quick-link spot is no longer available.");
      setPendingLinks({ revision: latest.revision, links });
      return { ...latest, links };
    }).finally(() => setPendingLinks(undefined));
  };

  const removeWidget = async (widget: WidgetType, region: WidgetRegion) => {
    if (
      !(await confirm({
        title: `Remove ${widgetNames[widget]}?`,
        message: "You can add this widget back to any region.",
        confirmLabel: "Remove from page",
      }))
    )
      return;
    await update(
      (latest) => {
        const current = widgetLayout(latest);
        const placement = WIDGET_REGIONS.find((region) => current[region].includes(widget));
        if (!placement) return latest;
        return { ...latest, layout: { ...current, [placement]: current[placement].filter((item) => item !== widget) } };
      },
      undefined,
      `xenstart-add-${region}`,
    );
  };

  const renderWidget = (widget: WidgetType, region: WidgetRegion) => {
    const compact = region === "left" || region === "right";
    if (widget === "today")
      return (
        <Suspense fallback={<ListSkeleton rows={2} height={48} />}>
          <TodayWidget />
        </Suspense>
      );
    if (widget === "clock") return <Clock format={config?.clockFormat} size={config?.clockSize} />;
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
              links={pendingLinks?.revision === config.revision ? pendingLinks.links : config.links}
              rows={appearance.rows}
              columns={appearance.columns}
              size={config.linkTileSize}
              compact={compact}
              editing={editing}
              saving={saving}
              onMove={move}
              onEdit={(link, slot) => openDialog({ kind: "link", link, slot, base: config })}
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
      sx={{
        position: "relative",
        isolation: "isolate",
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
        px: { xs: 1.5, sm: 3 },
        pb: 6,
      }}
    >
      {imageBlob || imageUrl ? <BackgroundImage key={imageKey} blob={imageBlob} url={imageUrl} fit={imageFit} /> : null}
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
            <Button
              sx={{ justifyContent: "flex-start", px: 1 }}
              disabled={!config || saving}
              onClick={() => {
                setEditing(!editing);
                setAnchor(null);
              }}
            >
              {editing ? "Exit edit mode" : "Enter edit mode"}
            </Button>
            <Button
              sx={{ justifyContent: "flex-start", px: 1 }}
              disabled={!config}
              onClick={() => {
                if (!config) return;
                setAnchor(null);
                openDialog({
                  kind: "settings",
                  base: config,
                  regionStyles: config.regionStyles ?? {},
                  background: {
                    backgroundUrl: config.appearance.backgroundUrl,
                    backgroundFit: config.backgroundFit ?? DEFAULT_BACKGROUND_FIT,
                    clearUpload: false,
                  },
                });
              }}
            >
              Settings
            </Button>
          </Stack>
        </Popover>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", flexGrow: 1, pt: { xs: 3.25, sm: 6 } }}>
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
              styles={regionStyles}
              editing={editing}
              saving={saving}
              canAdd={available.length > 0}
              onAdd={(region) => config && openDialog({ kind: "picker", region, base: config })}
              onRemove={(widget, region) => void removeWidget(widget, region)}
              renderControls={(widget) =>
                config && (
                  <WidgetControls
                    widget={widget}
                    config={config}
                    saving={saving}
                    update={(apply) => void update(apply)}
                  />
                )
              }
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
          onSave={({ label, url, iconUrl }) =>
            void update((latest) => {
              if (!dialog.link) {
                const slots = quickLinkSlots(latest.links);
                if (dialog.slot >= latest.appearance.rows * latest.appearance.columns || slots[dialog.slot])
                  throw new Error("That quick-link spot is no longer available.");
                slots[dialog.slot] = { id: crypto.randomUUID(), label, url, iconUrl };
                return { ...latest, links: linksFromSlots(slots) };
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
                        iconUrl: url === original.url ? link.iconUrl : iconUrl,
                      }
                    : link,
                ),
              };
            }, dialog.base)
          }
          onRemove={() =>
            void update(
              (latest) => ({
                ...latest,
                links: linksFromSlots(quickLinkSlots(latest.links)).filter((link) => link.id !== dialog.link?.id),
              }),
              dialog.base,
            )
          }
        />
      )}
      {dialog?.kind === "settings" && (
        <SettingsDialog
          background={dialog.background}
          onBackgroundChange={(background) =>
            setDialog((current) => (current?.kind === "settings" ? { ...current, background } : current))
          }
          backgroundPreview={
            imageBlob || imageUrl ? (
              <BackgroundImage key={imageKey} blob={imageBlob} url={imageUrl} fit={imageFit} preview />
            ) : null
          }
          hasUpload={!!dialog.base.backgroundImageId}
          regionStyles={dialog.regionStyles}
          onRegionStylesChange={(styles) =>
            setDialog((current) => (current?.kind === "settings" ? { ...current, regionStyles: styles } : current))
          }
          onClose={closeDialog}
          saving={saving}
          error={error}
          onSave={() => {
            const { backgroundUrl: value, backgroundFit, clearUpload, file } = dialog.background;
            const backgroundUrl = value.trim();
            void update(
              (latest) => ({
                ...latest,
                regionStyles,
                backgroundImageId: clearUpload ? null : latest.backgroundImageId,
                backgroundFit:
                  backgroundFit === (dialog.base.backgroundFit ?? DEFAULT_BACKGROUND_FIT)
                    ? latest.backgroundFit
                    : backgroundFit,
                appearance: {
                  ...latest.appearance,
                  backgroundUrl:
                    backgroundUrl === dialog.base.appearance.backgroundUrl
                      ? latest.appearance.backgroundUrl
                      : backgroundUrl,
                },
              }),
              dialog.base,
              undefined,
              file,
            );
          }}
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
              `xenstart-remove-${widget}`,
            )
          }
        />
      )}
    </Box>
  );
}
