import { useState } from "react";
import { Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import {
  FEEDBACK_RESOLVE_MESSAGES,
  FEEDBACK_REWARD_DEFAULT_GEMS,
  FEEDBACK_REWARD_MAX_GEMS,
  FEEDBACK_REWARD_MESSAGES,
  FEEDBACK_REWARD_MESSAGE_MAX_LENGTH,
  FEEDBACK_REWARD_PRESETS,
  type AdminFeedback,
} from "@shared/feedback";
import GemAmount from "../../../components/GemAmount";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import { useResolveFeedback } from "../../../hooks/admin/useAdminData";

const CUSTOM = "custom";
type Choice = number | typeof CUSTOM;

interface ResolveFeedbackDialogProps {
  item: AdminFeedback;
  open: boolean;
  onClose: () => void;
}

const sameChip = (selected: boolean) => ({
  variant: selected ? ("filled" as const) : ("outlined" as const),
  color: selected ? ("primary" as const) : ("default" as const),
});

/**
 * Resolve a report: pick gems (or none) and a message. The person gets both as a notification. Gems are paid once,
 * and a paid report is archived.
 */
export default function ResolveFeedbackDialog({ item, open, onClose }: ResolveFeedbackDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const resolve = useResolveFeedback();
  const [choice, setChoice] = useState<Choice>(FEEDBACK_REWARD_DEFAULT_GEMS);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState<string>(FEEDBACK_REWARD_MESSAGES[0]);

  const gems = choice === CUSTOM ? Number(custom) : choice;
  const gemsValid = Number.isInteger(gems) && gems >= 0 && gems <= FEEDBACK_REWARD_MAX_GEMS;
  const messages: readonly string[] = gems > 0 ? FEEDBACK_REWARD_MESSAGES : FEEDBACK_RESOLVE_MESSAGES;
  const messageValid = message.trim().length > 0;

  const pick = (next: Choice) => {
    setChoice(next);
    const nextGems = next === CUSTOM ? Number(custom) : next;
    // Swap a quick-pick message for its counterpart, but leave anything the admin typed alone.
    const wasPreset = [...FEEDBACK_REWARD_MESSAGES, ...FEEDBACK_RESOLVE_MESSAGES].includes(message as never);
    if (wasPreset && next !== CUSTOM)
      setMessage((nextGems > 0 ? FEEDBACK_REWARD_MESSAGES : FEEDBACK_RESOLVE_MESSAGES)[0]);
  };

  const submit = () =>
    resolve.mutate(
      { id: item._id, gems, message: message.trim() },
      {
        onSuccess: () => {
          enqueueSnackbar(
            gems > 0 ? `Sent ${item.from.username} ${gems.toLocaleString()} gems` : `Replied to ${item.from.username}`,
            { variant: "success" },
          );
          onClose();
        },
        onError: (e) => enqueueSnackbar((e as Error).message || "Couldn't resolve that", { variant: "error" }),
      },
    );

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="Resolve feedback"
      actions={
        <>
          <Button onClick={onClose} disabled={resolve.isPending}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submit} disabled={!gemsValid || !messageValid || resolve.isPending}>
            {gems > 0 ? `Send ${gems.toLocaleString()} gems` : "Send reply"}
          </Button>
        </>
      }
    >
      <Stack spacing={2.5} sx={{ pt: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          {item.from.username} gets your message as a notification{gems > 0 ? ", along with the gems" : ""}.
          {gems > 0 ? " Gems are paid once, and the feedback is archived afterwards." : ""}
        </Typography>

        <Box>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
            Gems
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Chip clickable {...sameChip(choice === 0)} onClick={() => pick(0)} label="No gems" />
            {FEEDBACK_REWARD_PRESETS.map((n) => (
              <Chip
                key={n}
                clickable
                {...sameChip(choice === n)}
                onClick={() => pick(n)}
                label={<GemAmount amount={n} iconSize={16} variant="body2" />}
              />
            ))}
            <Chip clickable {...sameChip(choice === CUSTOM)} onClick={() => pick(CUSTOM)} label="Custom" />
          </Box>
          {choice === CUSTOM && (
            <TextField
              autoFocus
              size="small"
              type="number"
              label="Gems"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              slotProps={{ htmlInput: { min: 0, max: FEEDBACK_REWARD_MAX_GEMS, step: 1 } }}
              error={custom !== "" && !gemsValid}
              helperText={`Up to ${FEEDBACK_REWARD_MAX_GEMS.toLocaleString()}`}
              sx={{ mt: 1.5, width: 180 }}
            />
          )}
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
            Message
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            {messages.map((m) => (
              <Chip
                key={m}
                clickable
                size="small"
                {...sameChip(message === m)}
                onClick={() => setMessage(m)}
                label={m.length > 36 ? `${m.slice(0, 34)}…` : m}
              />
            ))}
          </Box>
          <TextField
            multiline
            minRows={3}
            fullWidth
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            slotProps={{ htmlInput: { maxLength: FEEDBACK_REWARD_MESSAGE_MAX_LENGTH } }}
            helperText={`${message.length}/${FEEDBACK_REWARD_MESSAGE_MAX_LENGTH}`}
          />
        </Box>
      </Stack>
    </ResponsiveDialog>
  );
}
