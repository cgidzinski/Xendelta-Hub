import { useEffect, useState } from "react";
import { Button, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { readingText, useLogReading, type Routine } from "../../../../hooks/xenroutine/useRoutines";

/** Log the current reading (odometer, hour meter) on a routine that repeats by reading. */
export default function ReadingDialog({
  routine,
  open,
  onClose,
}: {
  routine: Routine;
  open: boolean;
  onClose: () => void;
}) {
  const t = routine.threshold;
  const { enqueueSnackbar } = useSnackbar();
  const logReading = useLogReading();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open && t) setValue(String(t.current_value));
  }, [open, t]);

  if (!t) return null;
  const num = Number(value);
  const ok = value !== "" && Number.isFinite(num);

  const save = async () => {
    try {
      await logReading.mutateAsync({ id: routine._id, value: num });
      enqueueSnackbar(num >= t.target ? `“${routine.name}” is due` : "Reading saved", { variant: "success" });
      onClose();
    } catch (e: any) {
      enqueueSnackbar(e?.response?.data?.message ?? "Couldn't save the reading", { variant: "error" });
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title={`Reading: ${routine.name}`}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={!ok || logReading.isPending}>
            Save
          </Button>
        </>
      }
    >
      <TextField
        autoFocus
        fullWidth
        type="number"
        label={t.unit ? `Current reading (${t.unit})` : "Current reading"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        sx={{ mt: 1 }}
        slotProps={{ htmlInput: { step: "any" } }}
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Due at {readingText(t.target, t.unit)}.
      </Typography>
    </ResponsiveDialog>
  );
}
