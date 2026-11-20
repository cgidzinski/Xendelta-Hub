import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  GRID_DIMENSION_LIMIT,
  HUB_SECTIONS,
  parseQuickLinkUrl,
  SEARCH_ENGINES,
  XENSTART_PATH,
  type HubSection,
  type QuickLink,
  type SearchEngine,
  type XenStartAppearance,
} from "@shared/xenstart";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import { BackgroundImage } from "./Appearance";
import { useConfirm } from "../../../components/ui/ConfirmProvider";

const sectionLabels: Record<HubSection, string> = {
  pinned: "Pinned apps",
  attention: "Needs attention",
  activity: "Activity",
};

interface DialogProps {
  onClose: () => void;
  saving: boolean;
  error: string;
}

export function LinkDialog({
  link,
  onClose,
  onSave,
  onRemove,
  saving,
  error,
}: DialogProps & {
  link: QuickLink | null;
  onSave: (label: string, url: string) => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(link?.label ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [urlError, setUrlError] = useState(false);
  const confirm = useConfirm();
  const remove = async () => {
    if (
      link &&
      (await confirm({
        title: "Remove link?",
        message: `Remove ${link.label} from your quick links?`,
        confirmLabel: "Remove",
      }))
    )
      onRemove();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!parseQuickLinkUrl(url)) {
      setUrlError(true);
      return;
    }
    if (label.trim()) onSave(label.trim(), url.trim());
  };

  return (
    <ResponsiveDialog
      open
      maxWidth="xs"
      title={link ? "Edit link" : "Add link"}
      onClose={onClose}
      actions={
        <>
          {link && (
            <Button color="error" disabled={saving} onClick={() => void remove()} sx={{ mr: "auto" }}>
              Remove link
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form="xenstart-link"
            variant="contained"
            disabled={saving || !label.trim() || !url.trim()}
          >
            Save link
          </Button>
        </>
      }
    >
      <Stack id="xenstart-link" component="form" spacing={2} onSubmit={submit} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          autoFocus
          required
          disabled={saving}
          label="Label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          slotProps={{ htmlInput: { maxLength: 80 } }}
        />
        <TextField
          required
          disabled={saving}
          label="Website URL"
          value={url}
          placeholder="https://example.com"
          onChange={(event) => {
            setUrl(event.target.value);
            setUrlError(false);
          }}
          error={urlError}
          helperText={urlError ? "Enter an HTTP or HTTPS website URL." : undefined}
          slotProps={{ htmlInput: { inputMode: "url", maxLength: 2048 } }}
        />
      </Stack>
    </ResponsiveDialog>
  );
}

export function SettingsDialog({
  initialEngine,
  initialSections,
  initialAppearance,
  linkCount,
  onClose,
  onSave,
  saving,
  error,
}: DialogProps & {
  initialEngine: SearchEngine;
  initialSections: HubSection[];
  initialAppearance: XenStartAppearance;
  linkCount: number;
  onSave: (engine: SearchEngine, sections: HubSection[], appearance: XenStartAppearance) => void;
}) {
  const [engine, setEngine] = useState(initialEngine);
  const [sections, setSections] = useState(initialSections);
  const [appearance, setAppearance] = useState(initialAppearance);
  const [tab, setTab] = useState("general");
  const [preview, setPreview] = useState(initialAppearance.backgroundUrl);
  const [backgroundError, setBackgroundError] = useState(false);
  const slots = appearance.rows * appearance.columns;
  const hiddenLinks = Math.max(0, linkCount - slots);
  const backgroundUrl = appearance.backgroundUrl.trim();
  const validBackground = !backgroundUrl || parseQuickLinkUrl(backgroundUrl)?.protocol === "https:";
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const homepage = new URL(XENSTART_PATH, window.location.origin).href;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(homepage);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <ResponsiveDialog
      open
      maxWidth="xs"
      title="Settings"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="xenstart-settings" variant="contained" disabled={saving}>
            Save settings
          </Button>
        </>
      }
    >
      <Stack
        id="xenstart-settings"
        component="form"
        spacing={2}
        sx={{ pt: 1 }}
        onSubmit={(event) => {
          event.preventDefault();
          if (saving) return;
          if (!validBackground) {
            setBackgroundError(true);
            setTab("appearance");
            return;
          }
          onSave(engine, sections, { ...appearance, backgroundUrl });
        }}
      >
        {error && <Alert severity="error">{error}</Alert>}
        <Tabs
          aria-label="XenStart settings"
          value={tab}
          onChange={(_, value: string) => setTab(value)}
          variant="fullWidth"
          sx={{ borderBottom: "1px solid", borderColor: "divider" }}
        >
          {["General", "Layout", "Appearance"].map((name) => (
            <Tab
              key={name}
              label={name}
              value={name.toLowerCase()}
              id={`xenstart-tab-${name.toLowerCase()}`}
              aria-controls={`xenstart-panel-${name.toLowerCase()}`}
              sx={{ minWidth: 0, px: 1 }}
            />
          ))}
        </Tabs>
        <Box
          id="xenstart-panel-general"
          role="tabpanel"
          aria-labelledby="xenstart-tab-general"
          hidden={tab !== "general"}
        >
          <Stack spacing={2}>
            <TextField
              select
              disabled={saving}
              label="Search engine"
              value={engine}
              onChange={(event) => setEngine(event.target.value as SearchEngine)}
            >
              {SEARCH_ENGINES.map((name) => (
                <MenuItem key={name} value={name}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            <Stack component="fieldset" sx={{ m: 0, p: 0, border: 0 }}>
              <Typography component="legend" variant="subtitle2">
                Hub sections
              </Typography>
              {HUB_SECTIONS.map((section) => (
                <FormControlLabel
                  key={section}
                  label={sectionLabels[section]}
                  labelPlacement="start"
                  sx={{ mx: 0, justifyContent: "space-between" }}
                  control={
                    <Switch
                      disabled={saving}
                      checked={sections.includes(section)}
                      onChange={(_, checked) =>
                        setSections((current) =>
                          checked ? [...current, section] : current.filter((item) => item !== section),
                        )
                      }
                    />
                  }
                />
              ))}
            </Stack>
            <Divider />
            <Stack spacing={1} alignItems="flex-start">
              <Typography variant="body2" color="text.secondary">
                Paste this address into your browser’s homepage settings.
              </Typography>
              <Button variant="outlined" onClick={() => void copy()}>
                Copy homepage URL
              </Button>
              {copyState === "copied" && (
                <Typography role="status" variant="body2">
                  Homepage URL copied.
                </Typography>
              )}
              {copyState === "failed" && (
                <TextField
                  label="Homepage URL"
                  fullWidth
                  value={homepage}
                  slotProps={{ input: { readOnly: true } }}
                  onFocus={(event) => event.target.select()}
                />
              )}
            </Stack>
          </Stack>
        </Box>
        <Box id="xenstart-panel-layout" role="tabpanel" aria-labelledby="xenstart-tab-layout" hidden={tab !== "layout"}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              {(["rows", "columns"] as const).map((dimension) => (
                <TextField
                  key={dimension}
                  select
                  fullWidth
                  disabled={saving}
                  label={dimension === "rows" ? "Rows" : "Columns"}
                  value={appearance[dimension]}
                  onChange={(event) => setAppearance({ ...appearance, [dimension]: Number(event.target.value) })}
                >
                  {Array.from({ length: GRID_DIMENSION_LIMIT }, (_, index) => index + 1).map((count) => (
                    <MenuItem key={count} value={count}>
                      {count}
                    </MenuItem>
                  ))}
                </TextField>
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {hiddenLinks
                ? `${slots} visible slots. ${hiddenLinks} saved ${hiddenLinks === 1 ? "link stays" : "links stay"} hidden until there’s room again.`
                : `${slots} slots. Tiles wrap into fewer columns on smaller screens.`}
            </Typography>
          </Stack>
        </Box>
        <Box
          id="xenstart-panel-appearance"
          role="tabpanel"
          aria-labelledby="xenstart-tab-appearance"
          hidden={tab !== "appearance"}
        >
          <Stack spacing={2}>
            <FormControlLabel
              label="Show clock"
              control={
                <Switch
                  checked={appearance.showClock}
                  disabled={saving}
                  onChange={(_, checked) => setAppearance({ ...appearance, showClock: checked })}
                />
              }
            />
            <TextField
              label="Background image URL"
              placeholder="https://example.com/photo.jpg"
              value={appearance.backgroundUrl}
              disabled={saving}
              onChange={(event) => {
                setAppearance({ ...appearance, backgroundUrl: event.target.value });
                setBackgroundError(false);
                if (!event.target.value.trim()) setPreview("");
              }}
              error={backgroundError}
              helperText={
                backgroundError
                  ? "Enter an HTTPS image URL."
                  : "The image fills the page and is dimmed behind the content."
              }
              slotProps={{ htmlInput: { inputMode: "url", maxLength: 2048 } }}
            />
            {backgroundUrl && (
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button
                  variant="outlined"
                  disabled={!validBackground || saving}
                  onClick={() => setPreview(backgroundUrl)}
                >
                  Preview
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setAppearance({ ...appearance, backgroundUrl: "" });
                    setPreview("");
                    setBackgroundError(false);
                  }}
                >
                  Remove image
                </Button>
              </Stack>
            )}
            {preview && <BackgroundImage key={preview} url={preview} preview />}
          </Stack>
        </Box>
      </Stack>
    </ResponsiveDialog>
  );
}
