import { useState } from "react";
import { Box, Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import {
  FEEDBACK_RESOLVE_MESSAGES,
  FEEDBACK_REWARD_MAX_GEMS,
  FEEDBACK_REWARD_MESSAGES,
  FEEDBACK_REWARD_MESSAGE_MAX_LENGTH,
  FEEDBACK_REWARD_PRESETS,
  FEEDBACK_STATUS_LABEL,
  type AdminFeedback,
  type FeedbackStatus,
} from "@shared/feedback";
import GemAmount from "../../../components/GemAmount";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import { useDeleteFeedback, useResolveFeedback, useUpdateFeedback } from "../../../hooks/admin/useAdminData";
import StatusChip, { type Tone } from "./StatusChip";
import { dateTime } from "../adminFormat";

const TONE: Record<FeedbackStatus, Tone> = { new: "info", seen: "info", done: "success", archived: "default" };
const CUSTOM = "custom";
type Choice = number | typeof CUSTOM;

const chip = (selected: boolean) => ({
  variant: selected ? ("filled" as const) : ("outlined" as const),
  color: selected ? ("primary" as const) : ("default" as const),
});

interface FeedbackDialogProps {
  item: AdminFeedback;
  onClose: () => void;
}

/**
 * One feedback, opened. An open report has a single Resolve button, and what it does depends on what was picked:
 * gems and/or a message tell the person (as a notification); with neither, it is closed quietly. Done and archived
 * reports offer reopening, archiving and deleting instead.
 */
export default function FeedbackDialog({ item, onClose }: FeedbackDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const resolve = useResolveFeedback();
  const update = useUpdateFeedback();
  const remove = useDeleteFeedback();
  const [choice, setChoice] = useState<Choice>(0);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");

  const isOpen = item.status === "new" || item.status === "seen";
  const canPay = !item.rewardedGems;
  const gems = choice === CUSTOM ? Number(custom) : choice;
  const gemsValid = Number.isInteger(gems) && gems >= 0 && gems <= FEEDBACK_REWARD_MAX_GEMS;
  const text = message.trim();
  const needsMessage = gems > 0 && !text;
  const busy = resolve.isPending || update.isPending || remove.isPending;
  const presets: readonly string[] = gems > 0 ? FEEDBACK_REWARD_MESSAGES : FEEDBACK_RESOLVE_MESSAGES;

  const fail = (fallback: string) => ({
    onError: (e: unknown) => enqueueSnackbar((e as Error).message || fallback, { variant: "error" }),
  });

  const pick = (next: Choice) => {
    setChoice(next);
    const nextGems = next === CUSTOM ? Number(custom) : next;
    // Paying gems needs a message: fill one in if the box is empty or still holds a quick-pick.
    const all: readonly string[] = [...FEEDBACK_REWARD_MESSAGES, ...FEEDBACK_RESOLVE_MESSAGES];
    if (nextGems > 0 && (!text || all.includes(text))) setMessage(FEEDBACK_REWARD_MESSAGES[0]);
    if (nextGems === 0 && FEEDBACK_REWARD_MESSAGES.includes(text as never)) setMessage("");
  };

  const submit = () =>
    resolve.mutate(
      { id: item._id, gems, message: text },
      {
        onSuccess: () => {
          enqueueSnackbar(
            gems > 0
              ? `Sent ${item.from.username} ${gems.toLocaleString()} gems`
              : text
                ? `Replied to ${item.from.username}`
                : "Resolved",
            { variant: "success" },
          );
          onClose();
        },
        ...fail("Couldn't resolve that"),
      },
    );

  const setStatus = (status: FeedbackStatus) =>
    update.mutate({ id: item._id, status }, { onSuccess: onClose, ...fail("Couldn't update that") });

  const askDelete = async () => {
    const ok = await confirm({
      title: "Delete this feedback?",
      message: `The message from ${item.from.username} will be removed for good.`,
    });
    if (ok) remove.mutate(item._id, { onSuccess: onClose, ...fail("Couldn't delete that") });
  };

  const resolveLabel =
    gems > 0 ? `Resolve and send ${gems.toLocaleString()} gems` : text ? "Resolve and reply" : "Resolve";

  return (
    <ResponsiveDialog
      open
      onClose={onClose}
      title="Feedback"
      actions={
        isOpen ? (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="contained" onClick={submit} disabled={!gemsValid || needsMessage || busy}>
              {resolveLabel}
            </Button>
          </>
        ) : item.status === "archived" ? (
          <>
            <Button color="error" onClick={askDelete} disabled={busy}>
              Delete
            </Button>
            <Button variant="contained" onClick={() => setStatus("new")} disabled={busy}>
              Unarchive
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setStatus("new")} disabled={busy}>
              Reopen
            </Button>
            <Button variant="contained" onClick={() => setStatus("archived")} disabled={busy}>
              Archive
            </Button>
          </>
        )
      }
    >
      <Stack spacing={2.5} sx={{ pt: 0.5 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flexWrap: "wrap", mb: 1 }}>
            <StatusChip label={FEEDBACK_STATUS_LABEL[item.status]} tone={TONE[item.status]} />
            <Typography variant="body2" color="text.secondary">
              from {item.from.username} · {dateTime(item.createdAt)}
            </Typography>
            {item.rewardedGems ? <GemAmount amount={item.rewardedGems} iconSize={16} variant="body2" /> : null}
          </Stack>
          <Typography sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.message}</Typography>
        </Box>

        {isOpen && (
          <>
            <Typography variant="body2" color="text.secondary">
              {item.from.username} is only told if you add gems or a message. Leave both empty to close this quietly.
            </Typography>

            {canPay && (
              <Box>
                <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
                  Gems
                </Typography>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Chip clickable {...chip(choice === 0)} onClick={() => pick(0)} label="No gems" />
                  {FEEDBACK_REWARD_PRESETS.map((n) => (
                    <Chip
                      key={n}
                      clickable
                      {...chip(choice === n)}
                      onClick={() => pick(n)}
                      label={<GemAmount amount={n} iconSize={16} variant="body2" />}
                    />
                  ))}
                  <Chip clickable {...chip(choice === CUSTOM)} onClick={() => pick(CUSTOM)} label="Custom" />
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
            )}

            <Box>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.75 }}>
                Message {gems > 0 ? "" : "(optional)"}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
                {presets.map((m) => (
                  <Chip
                    key={m}
                    clickable
                    size="small"
                    {...chip(message === m)}
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
                placeholder="Write a reply, or leave empty"
                slotProps={{ htmlInput: { maxLength: FEEDBACK_REWARD_MESSAGE_MAX_LENGTH } }}
                helperText={`${message.length}/${FEEDBACK_REWARD_MESSAGE_MAX_LENGTH}`}
              />
            </Box>
          </>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}
