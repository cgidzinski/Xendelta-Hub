import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, Switch, Typography, Divider,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { Routine, RoutineChannels } from "../../../../hooks/xenroutine/useRoutines";

interface Props {
    open: boolean;
    routine: Routine | null;
    onClose: () => void;
    onSave: (v: { channels: RoutineChannels; muted: boolean }) => Promise<void> | void;
}

const DEFAULTS: RoutineChannels = { inapp: true, push: true, email: true };

export default function NotificationOptions({ open, routine, onClose, onSave }: Props) {
    const [channels, setChannels] = useState<RoutineChannels>(DEFAULTS);
    const [muted, setMuted] = useState(false);

    useEffect(() => {
        if (!open || !routine) return;
        setChannels(routine.my_notifications?.channels ?? DEFAULTS);
        setMuted(routine.my_notifications?.muted ?? false);
    }, [open, routine]);

    const toggle = (k: keyof RoutineChannels) => (_: unknown, v: boolean) => setChannels((c) => ({ ...c, [k]: v }));

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>How should I remind you?</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    These settings are just for you — on a shared routine everyone picks their own.
                    Email also needs email notifications enabled in your profile.
                </Typography>
                <FormGroup>
                    <FormControlLabel control={<Switch checked={channels.inapp} onChange={toggle("inapp")} disabled={muted} />} label="In-app notification" />
                    <FormControlLabel control={<Switch checked={channels.push} onChange={toggle("push")} disabled={muted} />} label="Push notification" />
                    <FormControlLabel control={<Switch checked={channels.email} onChange={toggle("email")} disabled={muted} />} label="Email" />
                </FormGroup>
                <Divider sx={{ my: 1.5 }} />
                <FormControlLabel control={<Switch checked={muted} onChange={(_, v) => setMuted(v)} />} label="Mute this routine (no reminders)" />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={async () => { await onSave({ channels, muted }); onClose(); }}>Save</Button>
            </DialogActions>
        </Dialog>
    );
}
