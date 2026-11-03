import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, Typography, Divider, TextField,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { Routine } from "../../../../hooks/xenroutine/useRoutines";

interface Props {
    open: boolean;
    routine: Routine | null;
    onClose: () => void;
    onSave: (v: { muted: boolean; remind_again_days: number; lead_days: number; activity: boolean }) => Promise<void> | void;
}

const LEAD_OPTIONS = [
    { days: 0, label: "Don't send one" },
    { days: 1, label: "1 day before" },
    { days: 2, label: "2 days before" },
    { days: 3, label: "3 days before" },
    { days: 7, label: "1 week before" },
    { days: 14, label: "2 weeks before" },
];

export default function NotificationOptions({ open, routine, onClose, onSave }: Props) {
    const [muted, setMuted] = useState(false);
    const [remindAgain, setRemindAgain] = useState("3");
    const [leadDays, setLeadDays] = useState(1);
    const [activity, setActivity] = useState(true);

    useEffect(() => {
        if (!open || !routine) return;
        setMuted(routine.my_notifications?.muted ?? false);
        setRemindAgain(String(routine.remind_again_days));
        setLeadDays(routine.my_notifications?.lead_days ?? 1);
        setActivity(routine.my_notifications?.activity ?? true);
    }, [open, routine]);

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>Reminder options for this routine</DialogTitle>
            <DialogContent>
                {/* One Stack owns the spacing (and the top inset, so the floating labels aren't clipped). */}
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        These options are just for you — on a shared routine everyone picks their own.
                        How you're reached (in-app, push, email) and the time of day are in Reminder settings.
                    </Typography>
                    <TextField select label="Heads-up before it's due" value={leadDays} fullWidth disabled={muted}
                        onChange={(e) => setLeadDays(Number(e.target.value))}>
                        {LEAD_OPTIONS.map((o) => <MenuItem key={o.days} value={o.days}>{o.label}</MenuItem>)}
                    </TextField>
                    <TextField label="Remind again every (days) while overdue" type="number" value={remindAgain} fullWidth
                        onChange={(e) => setRemindAgain(e.target.value)} slotProps={{ htmlInput: { min: 1, max: 365 } }}
                        helperText="Applies to everyone on this routine." />
                    <Divider />
                    <Stack>
                        <FormControlLabel sx={{ mr: 0 }} control={<Switch checked={activity} onChange={(_, v) => setActivity(v)} />}
                            label="Tell me when others complete or postpone this" />
                        <FormControlLabel sx={{ mr: 0 }} control={<Switch checked={muted} onChange={(_, v) => setMuted(v)} />}
                            label="Mute this routine (no reminders)" />
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={async () => { await onSave({ muted, remind_again_days: Math.min(365, Math.max(1, Math.round(Number(remindAgain)) || 3)), lead_days: leadDays, activity }); onClose(); }}>Save</Button>
            </DialogActions>
        </Dialog>
    );
}
