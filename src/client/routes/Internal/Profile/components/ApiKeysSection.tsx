import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { useSnackbar } from "notistack";
import { API_KEY_APP_KEYS } from "@shared/apiKeys";
import { useApiKeys } from "../../../../hooks/user/useApiKeys";
import { APPS_REGISTRY } from "../../../../constants/apps";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import EmptyState from "../../../../components/ui/EmptyState";
import { useConfirm } from "../../../../components/ui/ConfirmProvider";

const EXPIRY_OPTIONS = [
  { label: "Never", value: 0 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "1 year", value: 365 },
];

const appLabel = (key: string) => APPS_REGISTRY.find((a) => a.key === key)?.label ?? key;
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : null);

/**
 * Personal API keys: send one as `Authorization: Bearer xd_...` to an app's routes (Home Assistant, scripts) instead of
 * signing in. The full key is shown once, right after it is created.
 */
export default function ApiKeysSection() {
  const { apiKeys, isLoading, create, revoke } = useApiKeys();
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [apps, setApps] = useState<string[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(0);
  const [newKey, setNewKey] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setApps([]);
    setReadOnly(false);
    setExpiresInDays(0);
  };

  const handleCreate = async () => {
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        apps,
        readOnly,
        ...(expiresInDays ? { expiresInDays } : {}),
      });
      setNewKey(result.key);
      setOpen(false);
      reset();
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message || e?.message || "Failed to create the key", { variant: "error" });
    }
  };

  const handleRevoke = async (id: string, keyName: string) => {
    const ok = await confirm({
      title: "Revoke API key",
      message: `Anything using "${keyName}" will stop working immediately.`,
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    try {
      await revoke.mutateAsync(id);
      enqueueSnackbar("API key revoked", { variant: "success" });
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message || e?.message || "Failed to revoke the key", { variant: "error" });
    }
  };

  const copyKey = async () => {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      enqueueSnackbar("Copied", { variant: "success" });
    } catch {
      enqueueSnackbar("Couldn't copy: select the key and copy it manually", { variant: "warning" });
    }
  };

  return (
    <>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Let Home Assistant, scripts and other tools use your apps without signing in. Send the key as{" "}
          <code>Authorization: Bearer xd_…</code>.
        </Typography>
        <Button variant="contained" size="small" onClick={() => setOpen(true)} sx={{ flexShrink: 0 }}>
          New key
        </Button>
      </Box>

      {newKey && (
        <Box sx={{ mb: 2, p: 2, border: 1, borderColor: "warning.main", borderRadius: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Copy your new key now. You won't be able to see it again.
          </Typography>
          <TextField
            value={newKey}
            size="small"
            fullWidth
            slotProps={{
              input: {
                readOnly: true,
                sx: { fontFamily: "monospace" },
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Copy">
                      <IconButton onClick={copyKey} edge="end" aria-label="Copy key">
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
            onFocus={(e) => e.target.select()}
          />
          <Button size="small" sx={{ mt: 1 }} onClick={() => setNewKey(null)}>
            Done
          </Button>
        </Box>
      )}

      {!isLoading && apiKeys.length === 0 && !newKey && <EmptyState description="No API keys yet." sx={{ py: 1 }} />}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {apiKeys.map((k) => (
          <Box
            key={k._id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              p: 1.5,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1" noWrap sx={{ fontWeight: 600 }}>
                {k.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                <code>{k.preview}</code> · {k.lastUsedAt ? `used ${formatDate(k.lastUsedAt)}` : "never used"}
                {k.expiresAt ? ` · expires ${formatDate(k.expiresAt)}` : ""}
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.5 }}>
                {(k.apps.length ? k.apps : ["All apps"]).map((a) => (
                  <Chip key={a} size="small" variant="outlined" label={k.apps.length ? appLabel(a) : a} />
                ))}
                {k.readOnly && <Chip size="small" color="primary" variant="outlined" label="Read-only" />}
              </Box>
            </Box>
            <Tooltip title="Revoke">
              <IconButton onClick={() => handleRevoke(k._id, k.name)} aria-label={`Revoke ${k.name}`}>
                <DeleteOutlineIcon />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>

      <ResponsiveDialog
        open={open}
        title="New API key"
        onClose={() => setOpen(false)}
        actions={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleCreate} disabled={!name.trim() || create.isPending}>
              {create.isPending ? "Creating..." : "Create"}
            </Button>
          </>
        }
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="Name"
            placeholder="Home Assistant"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="small"
            autoFocus
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Apps
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {apps.length === 0 ? "Nothing selected: the key can use every app." : "Only the selected apps."}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              {API_KEY_APP_KEYS.map((key) => (
                <FormControlLabel
                  key={key}
                  label={appLabel(key)}
                  control={
                    <Checkbox
                      size="small"
                      checked={apps.includes(key)}
                      onChange={(e) => setApps(e.target.checked ? [...apps, key] : apps.filter((a) => a !== key))}
                    />
                  }
                />
              ))}
            </Box>
          </Box>
          <FormControlLabel
            control={<Switch checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />}
            label="Read-only (can look but not change anything)"
          />
          <TextField
            select
            label="Expires"
            size="small"
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(Number(e.target.value))}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>
      </ResponsiveDialog>
    </>
  );
}
