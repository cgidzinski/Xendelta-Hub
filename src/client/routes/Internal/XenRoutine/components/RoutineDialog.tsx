import { useEffect, useState } from "react";
import {
    Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField,
} from "@mui/material";
import { format } from "date-fns";
import type { IntervalUnit, Routine, RoutineInput } from "../../../../hooks/xenroutine/useRoutines";

interface Props {
    open: boolean;
    routine?: Routine | null;
    onClose: () => void;
    onSubmit: (input: RoutineInput) => Promise<void> | void;
}

const UNITS: IntervalUnit[] = ["days", "weeks", "months", "years"];
// <input type="date"> yields yyyy-MM-dd; anchoring at local noon keeps the calendar day
// stable in every timezone.
const toIso = (d: string) => new Date(`${d}T12:00:00`).toISOString();

export default function RoutineDialog({ open, routine, onClose, onSubmit }: Props) {
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [notes, setNotes] = useState("");
    const [every, setEvery] = useState("3");
    const [unit, setUnit] = useState<IntervalUnit>("months");
    const [startDate, setStartDate] = useState("");
    const [dueAt, setDueAt] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName(routine?.name ?? "");
        setCategory(routine?.category ?? "");
        setNotes(routine?.notes ?? "");
        setEvery(String(routine?.interval.every ?? 3));
        setUnit(routine?.interval.unit ?? "months");
        setStartDate(format(new Date(), "yyyy-MM-dd"));
        setDueAt(routine ? format(new Date(routine.due_at), "yyyy-MM-dd") : "");
    }, [open, routine]);

    const everyNum = Number(every);
    const valid = name.trim().length > 0 && Number.isInteger(everyNum) && everyNum >= 1;

    const submit = async () => {
        setSaving(true);
        try {
            await onSubmit({
                name: name.trim(),
                notes,
                interval: { every: everyNum, unit },
                // Edit keeps whatever category it had; create has none for now.
                ...(routine ? { category: category.trim(), ...(dueAt ? { due_at: toIso(dueAt) } : {}) } : {}),
                // On create the start date is the last time it was done; the server
                // sets the first due date one interval after it.
                ...(!routine && startDate ? { last_done_at: toIso(startDate) } : {}),
            });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{routine ? "Edit routine" : "New routine"}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth
                        placeholder="Replace fridge water filter" slotProps={{ htmlInput: { maxLength: 100 } }} />
                    {routine && routine.category && (
                        <TextField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} fullWidth
                            slotProps={{ htmlInput: { maxLength: 50 } }} />
                    )}
                    <Stack direction="row" spacing={2}>
                        <TextField label="Every" type="number" value={every} onChange={(e) => setEvery(e.target.value)}
                            slotProps={{ htmlInput: { min: 1, max: 1000 } }} sx={{ width: 120 }} />
                        <TextField select label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as IntervalUnit)} fullWidth>
                            {UNITS.map((u) => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                        </TextField>
                    </Stack>
                    {routine ? (
                        <TextField label="Next due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
                            slotProps={{ inputLabel: { shrink: true } }} fullWidth />
                    ) : (
                        <>
                            <TextField label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: format(new Date(), "yyyy-MM-dd") } }} fullWidth />
                            <Alert severity="info" sx={{ py: 0 }}>
                                Set this to the date you last did it. The next reminder is one interval after this date.
                            </Alert>
                        </>
                    )}
                    <TextField label="Notes (part numbers, spares…)" value={notes} onChange={(e) => setNotes(e.target.value)}
                        multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 1000 } }} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={submit} disabled={!valid || saving}>
                    {routine ? "Save" : "Create"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
