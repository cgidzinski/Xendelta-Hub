import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Link,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useSnackbar } from "notistack";
import {
  useRoutineSettings,
  useSaveRoutineSettings,
  type RoutineChannels,
} from "../../../../hooks/xenroutine/useRoutines";

interface Props {
  open: boolean;
  onClose: () => void;
}

const hourLabel = (h: number) => {
  const suffix = h < 12 ? "AM" : "PM";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}:00 ${suffix}`;
};

/** When reminders land and how you are reached, for every routine. The timezone itself is the Profile setting. */
export default function ReminderSettingsDialog({ open, onClose }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { settings } = useRoutineSettings();
  const save = useSaveRoutineSettings();
  const [hour, setHour] = useState(8);
  const [channels, setChannels] = useState<RoutineChannels>({ inapp: true, push: true, email: true });

  useEffect(() => {
    if (!open || !settings) return;
    setHour(settings.remind_hour);
    // ?? because a server that predates per-user channels doesn't send them
    setChannels(settings.channels ?? { inapp: true, push: true, email: true });
  }, [open, settings]);

  const toggle = (k: keyof RoutineChannels) => (_: unknown, v: boolean) => setChannels((c) => ({ ...c, [k]: v }));

  const submit = async () => {
    try {
      await save.mutateAsync({ remind_hour: hour, channels });
      enqueueSnackbar("Reminder settings saved", { variant: "success" });
      onClose();
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message ?? "Couldn't save settings", { variant: "error" });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Reminder settings</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Remind me at"
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            fullWidth
          >
            {Array.from({ length: 24 }, (_, h) => (
              <MenuItem key={h} value={h}>
                {hourLabel(h)}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="body2" color="text.secondary">
            Timezone: <strong>{settings?.timezone ?? "…"}</strong>
            {settings && !settings.profile_timezone && " (following your browser)"}.{" "}
            <Link component={RouterLink} to="/internal/profile">
              Change it in your Profile
            </Link>
            .
          </Typography>
          <Stack>
            <Typography variant="subtitle2">How should I reach you?</Typography>
            <FormControlLabel
              control={<Switch checked={channels.inapp} onChange={toggle("inapp")} />}
              label="In-app notification"
            />
            <FormControlLabel
              control={<Switch checked={channels.push} onChange={toggle("push")} />}
              label="Push notification"
            />
            <FormControlLabel control={<Switch checked={channels.email} onChange={toggle("email")} />} label="Email" />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            This applies to every routine. Everything due at your reminder time arrives as one message. Push needs a
            subscribed device, and email also needs email notifications turned on in your Profile.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={save.isPending}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
