import { useState, type FormEvent } from "react";
import { Alert, Box, Button, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import { parseQuickLinkUrl, XENSTART_PATH, type QuickLink, type RegionStyles } from "@shared/xenstart";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { BackgroundImage } from "./Appearance";
import RegionLayoutSettings from "./RegionLayoutSettings";

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
  initialBackground,
  initialRegionStyles,
  onClose,
  onSave,
  saving,
  error,
}: DialogProps & {
  initialBackground: string;
  initialRegionStyles?: RegionStyles;
  onSave: (backgroundUrl: string, regionStyles: RegionStyles) => void;
}) {
  const [tab, setTab] = useState("general");
  const [regionStyles, setRegionStyles] = useState(initialRegionStyles ?? {});
  const [value, setValue] = useState(initialBackground);
  const [preview, setPreview] = useState(initialBackground);
  const [backgroundError, setBackgroundError] = useState(false);
  const backgroundUrl = value.trim();
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
          onSave(backgroundUrl, regionStyles);
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
          <Tab id="xenstart-general-tab" aria-controls="xenstart-general-panel" value="general" label="General" />
          <Tab id="xenstart-layout-tab" aria-controls="xenstart-layout-panel" value="layout" label="Layout" />
          <Tab
            id="xenstart-appearance-tab"
            aria-controls="xenstart-appearance-panel"
            value="appearance"
            label="Appearance"
          />
        </Tabs>
        <Box
          id="xenstart-general-panel"
          role="tabpanel"
          aria-labelledby="xenstart-general-tab"
          hidden={tab !== "general"}
        >
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
        </Box>
        <Box id="xenstart-layout-panel" role="tabpanel" aria-labelledby="xenstart-layout-tab" hidden={tab !== "layout"}>
          <RegionLayoutSettings styles={regionStyles} onChange={setRegionStyles} saving={saving} />
        </Box>
        <Box
          id="xenstart-appearance-panel"
          role="tabpanel"
          aria-labelledby="xenstart-appearance-tab"
          hidden={tab !== "appearance"}
        >
          <Stack spacing={2}>
            <TextField
              label="Background image URL"
              placeholder="https://example.com/photo.jpg"
              value={value}
              disabled={saving}
              onChange={(event) => {
                setValue(event.target.value);
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
                    setValue("");
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
