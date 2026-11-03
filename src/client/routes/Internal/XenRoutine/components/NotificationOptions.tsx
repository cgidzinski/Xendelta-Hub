import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, Switch, Typography, Divider, TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { Routine, RoutineChannels } from "../../../../hooks/xenroutine/useRoutines";

interface Props {
    open: boolean;
    routine: Routine | null;
    onClose: () => void;
    onSave: (v: { channels: RoutineChannels; muted: boolean; remind_again_days: number }) => Promise<void> | void;
}

const DEFAULTS: RoutineChannels = { inapp: true, push: true, email: true };

export default function NotificationOptions({ open, routine, onClose, onSave }: Props) {
    const [channels, setChannels] = useState<RoutineChannels>(DEFAULTS);
    const [muted, setMuted] = useState(false);
    const [remindAgain, setRemindAgain] = useState("3");

    useEffect(() => {
        if (!open || !routine) return;
        setChannels(routine.my_notifications?.channels ?? DEFAULTS);
        setMuted(routine.my_notifications?.muted ?? false);
        setRemindAgain(String(routine.remind_again_days));
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
                <TextField label="Remind again every (days) while overdue" type="number" value={remindAgain} fullWidth
                    onChange={(e) => setRemindAgain(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 365 } }}
                    helperText="Applies to everyone on this routine." sx={{ mt: 1 }} />
                <Divider sx={{ my: 1.5 }} />
                <FormControlLabel control={<Switch checked={muted} onChange={(_, v) => setMuted(v)} />} label="Mute this routine (no reminders)" />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={async () => { await onSave({ channels, muted, remind_again_days: Math.min(365, Math.max(1, Math.round(Number(remindAgain)) || 3)) }); onClose(); }}>Save</Button>
            </DialogActions>
        </Dialog>
    );
}
