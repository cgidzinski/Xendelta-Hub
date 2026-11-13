import { useState } from "react";
import { Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import {
  FEEDBACK_REWARD_DEFAULT_GEMS,
  FEEDBACK_REWARD_MAX_GEMS,
  FEEDBACK_REWARD_MESSAGES,
  FEEDBACK_REWARD_MESSAGE_MAX_LENGTH,
  FEEDBACK_REWARD_PRESETS,
  type AdminFeedback,
} from "@shared/feedback";
import GemAmount from "../../../components/GemAmount";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import { useRewardFeedback } from "../../../hooks/admin/useAdminData";

const CUSTOM = "custom";

interface RewardFeedbackDialogProps {
  item: AdminFeedback;
  open: boolean;
  onClose: () => void;
}

/** Thank someone for a bug report: pick an amount and a message; they get the gems and the message as a notification. */
export default function RewardFeedbackDialog({ item, open, onClose }: RewardFeedbackDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const reward = useRewardFeedback();
  const [choice, setChoice] = useState<number | typeof CUSTOM>(FEEDBACK_REWARD_DEFAULT_GEMS);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState<string>(FEEDBACK_REWARD_MESSAGES[0]);

  const gems = choice === CUSTOM ? Number(custom) : choice;
  const gemsValid = Number.isInteger(gems) && gems >= 1 && gems <= FEEDBACK_REWARD_MAX_GEMS;
  const messageValid = message.trim().length > 0;

  const submit = () =>
    reward.mutate(
      { id: item._id, gems, message: message.trim() },
      {
        onSuccess: () => {
          enqueueSnackbar(`Rewarded ${item.from.username} with ${gems.toLocaleString()} gems`, { variant: "success" });
          onClose();
        },
        onError: (e) => enqueueSnackbar((e as Error).message || "Couldn't reward that", { variant: "error" }),
      },
    );

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      title="Reward gems"
      actions={
        <>
          <Button onClick={onClose} disabled={reward.isPending}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submit} disabled={!gemsValid || !messageValid || reward.isPending}>
            Reward {gemsValid ? gems.toLocaleString() : ""} gems
          </Button>
        </>
      }
    >
      <Stack spacing={2.5} sx={{ pt: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          Thank {item.from.username} for the report. The gems go to their balance once, and they get your message as a
          notification.
        </Typography>

        <Box>
          <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
            Amount
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {FEEDBACK_REWARD_PRESETS.map((n) => (
              <Chip
                key={n}
                clickable
                variant={choice === n ? "filled" : "outlined"}
                color={choice === n ? "primary" : "default"}
                onClick={() => setChoice(n)}
                label={<GemAmount amount={n} iconSize={16} variant="body2" />}
              />
            ))}
            <Chip
              clickable
              variant={choice === CUSTOM ? "filled" : "outlined"}
              color={choice === CUSTOM ? "primary" : "default"}
              onClick={() => setChoice(CUSTOM)}
              label="Custom"
            />
          </Box>
          {choice === CUSTOM && (
            <TextField
              autoFocus
              size="small"
              type="number"
              label="Gems"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              slotProps={{ htmlInput: { min: 1, max: FEEDBACK_REWARD_MAX_GEMS, step: 1 } }}
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
            {FEEDBACK_REWARD_MESSAGES.map((m) => (
              <Chip
                key={m}
                clickable
                size="small"
                variant={message === m ? "filled" : "outlined"}
                color={message === m ? "primary" : "default"}
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
