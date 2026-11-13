import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import { format } from "date-fns";
import { addInterval } from "../../../../hooks/xenroutine/routineViews";
import type { IntervalUnit, Routine, RoutineInput } from "../../../../hooks/xenroutine/useRoutines";

interface Props {
  open: boolean;
  routine?: Routine | null;
  onClose: () => void;
  onSubmit: (input: RoutineInput) => Promise<void> | void;
}

// Matches the server (MAX_ROUTINE_STEPS, and 100 characters a step).
const MAX_STEPS = 30;

const UNITS: IntervalUnit[] = ["days", "weeks", "months", "years"];
// <input type="date"> yields yyyy-MM-dd; anchoring at local noon keeps the calendar day
// stable in every timezone.
const toIso = (d: string) => new Date(`${d}T12:00:00`).toISOString();
// Start of the local day: a "not done yet" routine starting today is due immediately.
const toDayStartIso = (d: string) => new Date(`${d}T00:00:00`).toISOString();

export default function RoutineDialog({ open, routine, onClose, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [every, setEvery] = useState("3");
  const [unit, setUnit] = useState<IntervalUnit>("months");
  const [startDate, setStartDate] = useState("");
  // Create only: was the job actually done on the start date?
  const [alreadyDone, setAlreadyDone] = useState(true);
  const [dueAt, setDueAt] = useState("");
  // The checklist being edited; a step that has an _id is an existing one (it keeps its tick).
  const [steps, setSteps] = useState<Array<{ key: number; _id?: string; text: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(routine?.name ?? "");
    setCategory(routine?.category ?? "");
    setNotes(routine?.notes ?? "");
    setEvery(String(routine?.interval.every ?? 3));
    setUnit(routine?.interval.unit ?? "months");
    setStartDate(format(new Date(), "yyyy-MM-dd"));
    setAlreadyDone(true);
    setDueAt(routine ? format(new Date(routine.due_at), "yyyy-MM-dd") : "");
    setSteps((routine?.checklist ?? []).map((c, i) => ({ key: i, _id: c._id, text: c.text })));
  }, [open, routine]);

  const everyNum = Number(every);
  const today = format(new Date(), "yyyy-MM-dd");
  // A completed job can't have been done in the future; a not-yet-done one can start later.
  const startOk = !!routine || (!!startDate && (!alreadyDone || startDate <= today));
  const valid = name.trim().length > 0 && Number.isInteger(everyNum) && everyNum >= 1 && startOk;

  const firstReminder = (() => {
    if (routine || !startDate || !Number.isInteger(everyNum) || everyNum < 1) return null;
    if (alreadyDone) {
      return `First reminder: ${format(addInterval(new Date(`${startDate}T12:00:00`), { every: everyNum, unit }), "PP")}`;
    }
    return startDate <= today
      ? "Due now — you'll be reminded right away."
      : `First reminder: ${format(new Date(`${startDate}T12:00:00`), "PP")}`;
  })();

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        notes,
        checklist: steps
          .filter((st) => st.text.trim())
          .map((st) => ({ ...(st._id ? { _id: st._id } : {}), text: st.text.trim() })),
        interval: { every: everyNum, unit },
        // Edit keeps whatever category it had; create has none for now.
        ...(routine ? { category: category.trim(), ...(dueAt ? { due_at: toIso(dueAt) } : {}) } : {}),
        // Create: if it was done on the start date the server sets the first due date
        // one interval later; if not, the start date itself is the first due date.
        ...(!routine && startDate
          ? alreadyDone
            ? { last_done_at: toIso(startDate) }
            : { due_at: toDayStartIso(startDate) }
          : {}),
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
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            fullWidth
            placeholder="Replace fridge water filter"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          {routine && routine.category && (
            <TextField
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              fullWidth
              slotProps={{ htmlInput: { maxLength: 50 } }}
            />
          )}
          <Stack direction="row" spacing={2}>
            <TextField
              label="Every"
              type="number"
              value={every}
              onChange={(e) => setEvery(e.target.value)}
              slotProps={{ htmlInput: { min: 1, max: 1000 } }}
              sx={{ width: 120 }}
            />
            <TextField
              select
              label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as IntervalUnit)}
              fullWidth
            >
              {UNITS.map((u) => (
                <MenuItem key={u} value={u}>
                  {u}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          {routine ? (
            <TextField
              label="Next due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          ) : (
            <>
              <TextField
                label="Start date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: alreadyDone ? { max: today } : {} }}
                fullWidth
              />
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                color="primary"
                value={alreadyDone ? "done" : "not"}
                onChange={(_, v) => {
                  if (v) setAlreadyDone(v === "done");
                }}
              >
                <ToggleButton value="done">I did it on this date</ToggleButton>
                <ToggleButton value="not">Not done yet</ToggleButton>
              </ToggleButtonGroup>
              {firstReminder && (
                <Typography variant="body2" color="text.secondary">
                  {firstReminder}
                </Typography>
              )}
            </>
          )}
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              Steps (optional): things to tick off each time, like a monthly car check
            </Typography>
            {steps.map((st, i) => (
              <Stack key={st.key} direction="row" spacing={0.5} alignItems="center">
                <TextField
                  size="small"
                  fullWidth
                  value={st.text}
                  placeholder={`Step ${i + 1}`}
                  onChange={(e) =>
                    setSteps((all) => all.map((x) => (x.key === st.key ? { ...x, text: e.target.value } : x)))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && steps.length < MAX_STEPS) {
                      e.preventDefault();
                      setSteps((all) => {
                        const next = [...all];
                        next.splice(i + 1, 0, { key: Math.max(0, ...all.map((x) => x.key)) + 1, text: "" });
                        return next;
                      });
                    }
                  }}
                  slotProps={{ htmlInput: { maxLength: 100, "aria-label": `Step ${i + 1}` } }}
                />
                <IconButton
                  size="small"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() => setSteps((all) => all.filter((x) => x.key !== st.key))}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            <Button
              size="small"
              startIcon={<AddIcon />}
              disabled={steps.length >= MAX_STEPS}
              onClick={() => setSteps((all) => [...all, { key: Math.max(0, ...all.map((x) => x.key)) + 1, text: "" }])}
              sx={{ alignSelf: "flex-start" }}
            >
              Add step
            </Button>
          </Stack>
          <TextField
            label="Notes (part numbers, spares…)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />
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
