import { useState } from "react";
import { Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, TextField } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX } from "@shared/chat";
import ResponsiveDialog from "../ui/ResponsiveDialog";

const ENDS: Array<{ label: string; hours: number | null }> = [
  { label: "When I close it", hours: null },
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

interface Props {
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onCreate: (poll: { question: string; options: string[]; multiple: boolean; endsAt?: string }) => void;
}

/** Ask a question with 2 to 10 options, one choice or several, and how long it stays open. */
export default function CreatePollDialog({ busy, error, onClose, onCreate }: Props) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [hours, setHours] = useState<number | null>(null);

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const duplicate = new Set(filled.map((o) => o.toLowerCase())).size !== filled.length;
  const valid = question.trim().length > 0 && filled.length >= POLL_MIN_OPTIONS && !duplicate;

  const submit = () =>
    valid &&
    onCreate({
      question: question.trim(),
      options: filled,
      multiple,
      ...(hours ? { endsAt: new Date(Date.now() + hours * 3_600_000).toISOString() } : {}),
    });

  return (
    <ResponsiveDialog
      open
      title="Create a poll"
      onClose={onClose}
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={!valid || busy}>
            Post poll
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 0.5 }}>
        <TextField
          autoFocus
          label="Question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          slotProps={{ htmlInput: { maxLength: POLL_QUESTION_MAX } }}
        />
        {options.map((text, i) => (
          <Box key={i} sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <TextField
              fullWidth
              size="small"
              label={`Option ${i + 1}`}
              value={text}
              onChange={(e) => setOptions((all) => all.map((o, j) => (j === i ? e.target.value : o)))}
              slotProps={{ htmlInput: { maxLength: POLL_OPTION_MAX } }}
            />
            {options.length > POLL_MIN_OPTIONS && (
              <IconButton
                size="small"
                aria-label={`Remove option ${i + 1}`}
                onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}
        {options.length < POLL_MAX_OPTIONS && (
          <Button
            startIcon={<AddIcon />}
            onClick={() => setOptions((all) => [...all, ""])}
            sx={{ alignSelf: "flex-start" }}
          >
            Add an option
          </Button>
        )}
        {duplicate && (
          <Box role="alert" sx={{ color: "error.main", fontSize: 13 }}>
            Each option must be different.
          </Box>
        )}
        <FormControlLabel
          control={<Checkbox checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />}
          label="Let people choose more than one"
        />
        <TextField
          select
          label="Closes"
          value={String(hours)}
          onChange={(e) => setHours(e.target.value === "null" ? null : Number(e.target.value))}
        >
          {ENDS.map((x) => (
            <MenuItem key={x.label} value={String(x.hours)}>
              {x.label}
            </MenuItem>
          ))}
        </TextField>
        {error && (
          <Box role="alert" sx={{ color: "error.main", fontSize: 13 }}>
            {error}
          </Box>
        )}
      </Box>
    </ResponsiveDialog>
  );
}
