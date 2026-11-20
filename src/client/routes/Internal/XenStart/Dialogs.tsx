import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  HUB_SECTIONS,
  parseQuickLinkUrl,
  SEARCH_ENGINES,
  XENSTART_PATH,
  type HubSection,
  type QuickLink,
  type SearchEngine,
} from "@shared/xenstart";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
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
  onClose,
  onSave,
  saving,
  error,
}: DialogProps & {
  initialEngine: SearchEngine;
  initialSections: HubSection[];
  onSave: (engine: SearchEngine, sections: HubSection[]) => void;
}) {
  const [engine, setEngine] = useState(initialEngine);
  const [sections, setSections] = useState(initialSections);
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
          if (!saving) onSave(engine, sections);
        }}
      >
        {error && <Alert severity="error">{error}</Alert>}
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
    </ResponsiveDialog>
  );
}
