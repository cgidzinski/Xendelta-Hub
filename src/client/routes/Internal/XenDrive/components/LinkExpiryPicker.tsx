import { useState } from "react";
import { Alert, Box, Chip, Stack, TextField } from "@mui/material";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { addDays, addHours, addMonths, addWeeks, format } from "date-fns";
import SectionLabel from "../../../../components/ui/SectionLabel";

const PRESETS: Array<{ label: string; at: (now: Date) => Date }> = [
  { label: "1 hour", at: (n) => addHours(n, 1) },
  { label: "1 day", at: (n) => addDays(n, 1) },
  { label: "1 week", at: (n) => addWeeks(n, 1) },
  { label: "1 month", at: (n) => addMonths(n, 1) },
];

/** The `datetime-local` input's value for a date, in the person's own time zone. */
const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

interface LinkExpiryPickerProps {
  /** ISO string, or null for a link that never expires. */
  expiry: string | null | undefined;
  /** Called with an ISO string (or null for "never") and a short message to show once it is saved. */
  onChange: (expiry: string | null, message?: string) => void;
}

/** When a public link stops working: never, a quick preset, or a chosen date. Each choice saves at once. */
export default function LinkExpiryPicker({ expiry: expiryIso, onChange }: LinkExpiryPickerProps) {
  const [picking, setPicking] = useState(false);
  const expiry = expiryIso ? new Date(expiryIso) : null;
  const expired = !!expiry && expiry <= new Date();

  return (
    <Box>
      <SectionLabel>Link expires</SectionLabel>
      <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap", mb: 1.5 }}>
        <Chip
          label="Never"
          clickable
          color={!expiry ? "primary" : "default"}
          variant={!expiry ? "filled" : "outlined"}
          onClick={() => {
            setPicking(false);
            onChange(null, "Link no longer expires");
          }}
        />
        {PRESETS.map((p) => (
          <Chip
            key={p.label}
            label={p.label}
            clickable
            variant="outlined"
            onClick={() => {
              setPicking(false);
              onChange(p.at(new Date()).toISOString(), `Link expires in ${p.label}`);
            }}
          />
        ))}
        <Chip
          label="Pick a date…"
          clickable
          variant={picking ? "filled" : "outlined"}
          color={picking ? "primary" : "default"}
          onClick={() => setPicking((v) => !v)}
        />
      </Stack>

      {picking && (
        <TextField
          type="datetime-local"
          size="small"
          fullWidth
          defaultValue={toLocalInput(expiry ?? addDays(new Date(), 1))}
          slotProps={{ htmlInput: { "aria-label": "Expiry date and time", min: toLocalInput(new Date()) } }}
          onChange={(e) => {
            const when = new Date(e.target.value);
            if (!Number.isNaN(when.getTime())) onChange(when.toISOString());
          }}
          sx={{ mb: 1.5 }}
        />
      )}

      {expiry && (
        <Alert severity={expired ? "error" : "warning"} icon={<ScheduleIcon fontSize="small" />} sx={{ py: 0.5 }}>
          {expired ? "This link has expired" : `Stops working on ${format(expiry, "MMM d, h:mm a")}`}
        </Alert>
      )}
    </Box>
  );
}
