import { useEffect, useState } from "react";
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Link, MenuItem, Stack, Switch, TextField, Typography,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { useSnackbar } from "notistack";
import { useRoutineSettings, useSaveRoutineSettings } from "../../../../hooks/xenroutine/useRoutines";

interface Props { open: boolean; onClose: () => void }

const hourLabel = (h: number) => {
    const suffix = h < 12 ? "AM" : "PM";
    const twelve = h % 12 === 0 ? 12 : h % 12;
    return `${twelve}:00 ${suffix}`;
};

/** When reminders land, and whether to batch them. The timezone itself is the Profile setting. */
export default function ReminderSettingsDialog({ open, onClose }: Props) {
    const { enqueueSnackbar } = useSnackbar();
    const { settings } = useRoutineSettings();
    const save = useSaveRoutineSettings();
    const [hour, setHour] = useState(8);
    const [digest, setDigest] = useState(false);

    useEffect(() => {
        if (!open || !settings) return;
        setHour(settings.remind_hour);
        setDigest(settings.digest);
    }, [open, settings]);

    const submit = async () => {
        try {
            await save.mutateAsync({ remind_hour: hour, digest });
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
                    <TextField select label="Remind me at" value={hour} onChange={(e) => setHour(Number(e.target.value))} fullWidth>
                        {Array.from({ length: 24 }, (_, h) => <MenuItem key={h} value={h}>{hourLabel(h)}</MenuItem>)}
                    </TextField>
                    <Typography variant="body2" color="text.secondary">
                        Timezone: <strong>{settings?.timezone ?? "…"}</strong>
                        {settings && !settings.profile_timezone && " (following your browser)"}.{" "}
                        <Link component={RouterLink} to="/internal/profile">Change it in your Profile</Link>.
                    </Typography>
                    <FormControlLabel
                        control={<Switch checked={digest} onChange={(_, v) => setDigest(v)} />}
                        label="Combine into one daily digest"
                    />
                    <Typography variant="caption" color="text.secondary">
                        With the digest on, several routines that need attention arrive as one message instead of one each.
                        Each routine's own options (channels, heads-up, mute) still apply.
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={submit} disabled={save.isPending}>Save</Button>
            </DialogActions>
        </Dialog>
    );
}
