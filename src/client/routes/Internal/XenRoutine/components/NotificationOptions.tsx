import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, MenuItem, Switch, Typography, Divider, TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { Routine, RoutineChannels } from "../../../../hooks/xenroutine/useRoutines";

interface Props {
    open: boolean;
    routine: Routine | null;
    onClose: () => void;
    onSave: (v: { channels: RoutineChannels; muted: boolean; remind_again_days: number; lead_days: number; activity: boolean }) => Promise<void> | void;
}

const DEFAULTS: RoutineChannels = { inapp: true, push: true, email: true };
const LEAD_OPTIONS = [
    { days: 0, label: "Don't" },
    { days: 1, label: "1 day before" },
    { days: 2, label: "2 days before" },
    { days: 3, label: "3 days before" },
    { days: 7, label: "1 week before" },
    { days: 14, label: "2 weeks before" },
];

export default function NotificationOptions({ open, routine, onClose, onSave }: Props) {
    const [channels, setChannels] = useState<RoutineChannels>(DEFAULTS);
    const [muted, setMuted] = useState(false);
    const [remindAgain, setRemindAgain] = useState("3");
    const [leadDays, setLeadDays] = useState(0);
    const [activity, setActivity] = useState(true);

    useEffect(() => {
        if (!open || !routine) return;
        setChannels(routine.my_notifications?.channels ?? DEFAULTS);
        setMuted(routine.my_notifications?.muted ?? false);
        setRemindAgain(String(routine.remind_again_days));
        setLeadDays(routine.my_notifications?.lead_days ?? 0);
        setActivity(routine.my_notifications?.activity ?? true);
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
                <TextField select label="Heads-up before it's due" value={leadDays} fullWidth disabled={muted}
                    onChange={(e) => setLeadDays(Number(e.target.value))} sx={{ mt: 1 }}>
                    {LEAD_OPTIONS.map((o) => <MenuItem key={o.days} value={o.days}>{o.label}</MenuItem>)}
                </TextField>
                <TextField label="Remind again every (days) while overdue" type="number" value={remindAgain} fullWidth
                    onChange={(e) => setRemindAgain(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 365 } }}
                    helperText="Applies to everyone on this routine." sx={{ mt: 1 }} />
                <Divider sx={{ my: 1.5 }} />
                <FormControlLabel control={<Switch checked={activity} onChange={(_, v) => setActivity(v)} />} label="Tell me when others complete or postpone this" />
                <FormControlLabel control={<Switch checked={muted} onChange={(_, v) => setMuted(v)} />} label="Mute this routine (no reminders)" />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={async () => { await onSave({ channels, muted, remind_again_days: Math.min(365, Math.max(1, Math.round(Number(remindAgain)) || 3)), lead_days: leadDays, activity }); onClose(); }}>Save</Button>
            </DialogActions>
        </Dialog>
    );
}
