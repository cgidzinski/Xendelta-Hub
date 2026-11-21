import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Box, Button, InputAdornment, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import UploadOutlinedIcon from "@mui/icons-material/UploadOutlined";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BACKGROUND_FITS,
  BACKGROUND_UPLOAD_LIMIT,
  parseQuickLinkUrl,
  XENSTART_PATH,
  type BackgroundFit,
  type BookmarkMetadata,
  type QuickLink,
  type RegionStyles,
} from "@shared/xenstart";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import SectionCard from "../../../components/ui/SectionCard";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import { api } from "../../../config/api";
import { xenstartKeys } from "../../../hooks/xenstart/keys";
import { LinkIconImage } from "./QuickLinks";
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
  onSave: (bookmark: BookmarkMetadata & { url: string }) => void;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState<string>();
  const [url, setUrl] = useState(link?.url ?? "");
  const [urlError, setUrlError] = useState(false);
  const [lookup, setLookup] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const parsed = parseQuickLinkUrl(url);
  const changedUrl = url.trim() !== link?.url;
  const client = useQueryClient();
  const options = (address: string) => ({
    queryKey: [...xenstartKeys.all, "bookmark", address],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      api.post<BookmarkMetadata>("/api/xenstart/bookmark", { url: address }, { signal }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const metadata = useQuery({ ...options(lookup), enabled: !!lookup && changedUrl && lookup === parsed?.href });
  const suggestion = changedUrl
    ? ((lookup === parsed?.href ? metadata.data?.label : undefined) ??
      parsed?.hostname.replace(/^www\./i, "").slice(0, 80))
    : link?.label;
  const disabled = saving || submitting;
  useEffect(() => {
    if (!changedUrl || !parsed?.href) return;
    const address = parsed.href;
    const timer = window.setTimeout(() => setLookup(address), 450);
    return () => window.clearTimeout(timer);
  }, [changedUrl, parsed?.href]);

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
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    if (!parsed) {
      setUrlError(true);
      return;
    }
    setSubmitting(true);
    try {
      const details = changedUrl ? await client.fetchQuery(options(parsed.href)).catch(() => undefined) : link;
      onSave({
        label: label?.trim() || details?.label || parsed.hostname.replace(/^www\./i, "").slice(0, 80),
        url: url.trim(),
        iconUrl: details?.iconUrl,
      });
    } finally {
      setSubmitting(false);
    }
  };
  const previewIcon =
    (changedUrl ? (lookup === parsed?.href ? metadata.data?.iconUrl : undefined) : link?.iconUrl) ??
    (parsed ? new URL("/favicon.ico", parsed).href : undefined);

  return (
    <ResponsiveDialog
      open
      maxWidth="xs"
      title={link ? "Edit link" : "Add link"}
      onClose={() => !disabled && onClose()}
      actions={
        <>
          {link && (
            <Button color="error" disabled={disabled} onClick={() => void remove()} sx={{ mr: "auto" }}>
              Remove link
            </Button>
          )}
          <Button disabled={disabled} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="xenstart-link" variant="contained" disabled={disabled || !url.trim()}>
            {submitting ? "Looking up website…" : saving ? "Saving…" : "Save link"}
          </Button>
        </>
      }
    >
      <Stack id="xenstart-link" component="form" spacing={2} onSubmit={(event) => void submit(event)} sx={{ pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          autoFocus
          required
          disabled={disabled}
          label="Website URL"
          value={url}
          placeholder="https://example.com"
          onChange={(event) => {
            setUrl(event.target.value);
            setUrlError(false);
          }}
          error={urlError}
          helperText={urlError ? "Enter an HTTP or HTTPS website URL." : "XenStart fills in the title and icon."}
          slotProps={{ htmlInput: { inputMode: "url", maxLength: 2048 } }}
        />
        <TextField
          disabled={disabled}
          label="Title"
          value={label ?? suggestion ?? ""}
          onChange={(event) => setLabel(event.target.value)}
          slotProps={{
            htmlInput: { maxLength: 80 },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIconImage key={previewIcon} url={previewIcon} />
                </InputAdornment>
              ),
            },
          }}
        />
      </Stack>
    </ResponsiveDialog>
  );
}

const backgroundFitLabels: Record<BackgroundFit, string> = {
  cover: "Fill screen",
  contain: "Fit to screen",
  fill: "Stretch",
  none: "Actual size",
};

export interface BackgroundDraft {
  backgroundUrl: string;
  backgroundFit: BackgroundFit;
  clearUpload: boolean;
  file?: File;
}

export function SettingsDialog({
  background,
  onBackgroundChange,
  backgroundPreview,
  hasUpload,
  regionStyles,
  onRegionStylesChange,
  onClose,
  onSave,
  saving,
  error,
}: DialogProps & {
  background: BackgroundDraft;
  onBackgroundChange: (background: BackgroundDraft) => void;
  backgroundPreview: ReactNode;
  hasUpload: boolean;
  regionStyles: RegionStyles;
  onRegionStylesChange: (styles: RegionStyles) => void;
  onSave: () => void;
}) {
  const [tab, setTab] = useState("general");
  const { backgroundUrl, backgroundFit, clearUpload, file } = background;
  const [backgroundError, setBackgroundError] = useState("");
  const trimmedUrl = backgroundUrl.trim();
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
      title="XenStart settings"
      onClose={onClose}
      slotProps={{ paper: { sx: { bgcolor: "background.paper", backgroundImage: "none" } } }}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form="xenstart-settings" variant="contained" disabled={saving}>
            Done
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
          if (trimmedUrl && parseQuickLinkUrl(trimmedUrl)?.protocol !== "https:") {
            setBackgroundError("Enter an HTTPS image URL.");
            setTab("appearance");
            return;
          }
          onSave();
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
          <SectionCard title="Browser homepage" description="Paste this address into your browser’s homepage settings.">
            <TextField
              label="Homepage URL"
              fullWidth
              size="small"
              value={homepage}
              slotProps={{ input: { readOnly: true } }}
              onFocus={(event) => event.target.select()}
            />
            <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap">
              <Button variant="outlined" startIcon={<ContentCopyOutlinedIcon />} onClick={() => void copy()}>
                Copy address
              </Button>
              {copyState !== "idle" && (
                <Typography role="status" variant="body2" color="text.secondary">
                  {copyState === "copied" ? "Address copied." : "Select the address to copy it manually."}
                </Typography>
              )}
            </Stack>
          </SectionCard>
        </Box>
        <Box id="xenstart-layout-panel" role="tabpanel" aria-labelledby="xenstart-layout-tab" hidden={tab !== "layout"}>
          <RegionLayoutSettings styles={regionStyles} onChange={onRegionStylesChange} saving={saving} />
        </Box>
        <Box
          id="xenstart-appearance-panel"
          role="tabpanel"
          aria-labelledby="xenstart-appearance-tab"
          hidden={tab !== "appearance"}
        >
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
              <Button component="label" variant="outlined" disabled={saving} startIcon={<UploadOutlinedIcon />}>
                Upload image
                <Box
                  component="input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  aria-label="Upload background image"
                  disabled={saving}
                  sx={{ position: "absolute", width: "1px", height: "1px", clipPath: "inset(50%)", overflow: "hidden" }}
                  onChange={(event) => {
                    const image = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (!image) return;
                    if (image.size > BACKGROUND_UPLOAD_LIMIT) {
                      setBackgroundError("Choose a background image under 10 MB.");
                      return;
                    }
                    onBackgroundChange({ ...background, file: image, backgroundUrl: "", clearUpload: false });
                    setBackgroundError("");
                  }}
                />
              </Button>
              {(file || (hasUpload && !clearUpload && !trimmedUrl)) && (
                <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                  {file?.name ?? "Uploaded image"}
                </Typography>
              )}
            </Stack>
            <TextField
              label="Background image URL"
              placeholder="https://example.com/photo.jpg"
              value={backgroundUrl}
              disabled={saving}
              onChange={(event) => {
                onBackgroundChange({ ...background, backgroundUrl: event.target.value, file: undefined });
                setBackgroundError("");
              }}
              error={!!backgroundError}
              helperText={backgroundError || undefined}
              slotProps={{ htmlInput: { inputMode: "url", maxLength: 2048 } }}
            />
            {(trimmedUrl || file || (hasUpload && !clearUpload)) && (
              <Button
                sx={{ alignSelf: "flex-start" }}
                disabled={saving}
                onClick={() => {
                  onBackgroundChange({ ...background, backgroundUrl: "", file: undefined, clearUpload: true });
                  setBackgroundError("");
                }}
              >
                Remove image
              </Button>
            )}
            <TextField
              select
              label="Image sizing"
              value={backgroundFit}
              disabled={saving}
              onChange={(event) =>
                onBackgroundChange({ ...background, backgroundFit: event.target.value as BackgroundFit })
              }
            >
              {BACKGROUND_FITS.map((fit) => (
                <MenuItem key={fit} value={fit}>
                  {backgroundFitLabels[fit]}
                </MenuItem>
              ))}
            </TextField>
            {backgroundPreview}
          </Stack>
        </Box>
      </Stack>
    </ResponsiveDialog>
  );
}
