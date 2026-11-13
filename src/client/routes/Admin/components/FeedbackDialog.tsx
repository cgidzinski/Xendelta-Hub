import { useState } from "react";
import {
  Avatar,
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useSnackbar } from "notistack";
import {
  FEEDBACK_MESSAGE_PRESETS,
  FEEDBACK_OUTCOME_LABEL,
  FEEDBACK_REWARD_MAX_GEMS,
  FEEDBACK_REWARD_MESSAGE_MAX_LENGTH,
  FEEDBACK_REWARD_PRESETS,
  FEEDBACK_STATUS_LABEL,
  type AdminFeedback,
  type FeedbackOutcome,
  type FeedbackStatus,
} from "@shared/feedback";
import GemAmount from "../../../components/GemAmount";
import { useConfirm } from "../../../components/ui/ConfirmProvider";
import ResponsiveDialog from "../../../components/ui/ResponsiveDialog";
import SectionLabel from "../../../components/ui/SectionLabel";
import { useDeleteFeedback, useResolveFeedback, useUpdateFeedback } from "../../../hooks/admin/useAdminData";
import StatusChip, { type Tone } from "./StatusChip";
import { dateTime, timeAgo } from "../adminFormat";

const TONE: Record<FeedbackStatus, Tone> = {
  new: "info",
  seen: "info",
  done: "success",
  dismissed: "default",
  archived: "default",
};
const OUTCOME_HELP: Record<FeedbackOutcome, string> = {
  resolved: "Fixed, answered or done.",
  dismissed: "Reviewed, no action will be taken.",
};
const CUSTOM = "custom";
const NONE = "none";

interface FeedbackDialogProps {
  item: AdminFeedback;
  onClose: () => void;
}

/**
 * One feedback, opened. An open report is closed with a single Submit: pick Resolved or Dismissed, and for Resolved
 * choose whether to tell the user (gems and a message). Dismissed is always silent. Closed reports offer reopening,
 * archiving and (once archived) deleting.
 */
export default function FeedbackDialog({ item, onClose }: FeedbackDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const confirm = useConfirm();
  const resolve = useResolveFeedback();
  const update = useUpdateFeedback();
  const remove = useDeleteFeedback();

  const [outcome, setOutcome] = useState<FeedbackOutcome>("resolved");
  const [inform, setInform] = useState(false);
  const [gemsChoice, setGemsChoice] = useState("0");
  const [customGems, setCustomGems] = useState("");
  const [presetKey, setPresetKey] = useState(NONE);
  const [message, setMessage] = useState("");

  const isOpen = item.status === "new" || item.status === "seen";
  const dismissed = outcome === "dismissed";
  const showForm = inform && !dismissed;
  const gems = !showForm ? 0 : gemsChoice === CUSTOM ? Number(customGems) : Number(gemsChoice);
  const gemsValid = Number.isInteger(gems) && gems >= 0 && gems <= FEEDBACK_REWARD_MAX_GEMS;
  const text = showForm ? message.trim() : "";
  const invalid = showForm && (!text || !gemsValid || (gemsChoice === CUSTOM && gems < 1));
  const busy = resolve.isPending || update.isPending || remove.isPending;

  const fail = (fallback: string) => ({
    onError: (e: unknown) => enqueueSnackbar((e as Error).message || fallback, { variant: "error" }),
  });

  const chooseGems = (value: string) => {
    setGemsChoice(value);
    // Gems always travel with a message: offer one if the box is still empty.
    if (value !== "0" && !message.trim()) {
      const first = FEEDBACK_MESSAGE_PRESETS.find((p) => p.withGems);
      if (first) {
        setPresetKey(first.key);
        setMessage(first.text);
      }
    }
  };

  const choosePreset = (key: string) => {
    setPresetKey(key);
    setMessage(FEEDBACK_MESSAGE_PRESETS.find((p) => p.key === key)?.text ?? "");
  };

  const summary = dismissed
    ? "Marked Dismissed. The user is not told."
    : !inform
      ? "Marked Resolved. The user is not told."
      : !text
        ? "Choose or write a message for the user."
        : !gemsValid || (gemsChoice === CUSTOM && gems < 1)
          ? `Enter a gem amount from 1 to ${FEEDBACK_REWARD_MAX_GEMS.toLocaleString()}.`
          : gems > 0
            ? `Marked Resolved. The user gets a notification with ${gems.toLocaleString()} gems and your message. The report is then archived.`
            : "Marked Resolved. The user gets a notification with your message.";

  const submit = () =>
    resolve.mutate(
      { id: item._id, outcome, gems, message: text },
      {
        onSuccess: () => {
          enqueueSnackbar(gems > 0 ? `Sent ${gems.toLocaleString()} gems` : dismissed ? "Dismissed" : "Resolved", {
            variant: "success",
          });
          onClose();
        },
        ...fail("Couldn't submit that"),
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
            <Button variant="contained" onClick={submit} disabled={invalid || busy}>
              Submit
            </Button>
          </>
        ) : item.status === "archived" ? (
          <>
            <Button color="error" onClick={askDelete} disabled={busy} sx={{ mr: "auto" }}>
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
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main" }}>
              {(item.from.username || "?").charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                {item.from.username}
              </Typography>
              <Typography variant="body2" color="text.secondary" title={dateTime(item.createdAt)}>
                {timeAgo(item.createdAt)}
              </Typography>
            </Box>
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
              {item.rewardedGems ? <GemAmount amount={item.rewardedGems} iconSize={16} variant="body2" /> : null}
              <StatusChip label={FEEDBACK_STATUS_LABEL[item.status]} tone={TONE[item.status]} />
            </Box>
          </Stack>
          <Box sx={{ bgcolor: "action.hover", borderRadius: 2, p: 2 }}>
            <Typography sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{item.message}</Typography>
          </Box>
        </Stack>

        {isOpen && (
          <>
            <Box>
              <SectionLabel>What happens to it</SectionLabel>
              <RadioGroup
                row
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as FeedbackOutcome)}
                sx={{ gap: 1, flexWrap: "wrap" }}
              >
                {(Object.keys(FEEDBACK_OUTCOME_LABEL) as FeedbackOutcome[]).map((o) => (
                  <FormControlLabel
                    key={o}
                    value={o}
                    control={<Radio />}
                    sx={{
                      flex: "1 1 200px",
                      m: 0,
                      p: 1,
                      pr: 1.5,
                      alignItems: "flex-start",
                      border: 1,
                      borderColor: outcome === o ? "primary.main" : "divider",
                      borderWidth: outcome === o ? 2 : 1,
                      borderRadius: 2,
                    }}
                    label={
                      <Box sx={{ pt: 0.75 }}>
                        <Typography sx={{ fontWeight: 500 }}>{FEEDBACK_OUTCOME_LABEL[o]}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {OUTCOME_HELP[o]}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            </Box>

            {!dismissed && (
              <Box>
                <SectionLabel>Inform user</SectionLabel>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  color="primary"
                  value={inform ? "yes" : "no"}
                  onChange={(_e, v: string | null) => v && setInform(v === "yes")}
                  aria-label="Inform user"
                >
                  <ToggleButton value="yes">Yes</ToggleButton>
                  <ToggleButton value="no">No</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            )}

            {showForm && (
              <Stack spacing={2}>
                <Box>
                  <TextField
                    select
                    fullWidth
                    label="Gems"
                    value={gemsChoice}
                    onChange={(e) => chooseGems(e.target.value)}
                    slotProps={{ select: { native: true } }}
                    helperText="Gems can be paid once per report."
                  >
                    <option value="0">No gems</option>
                    {FEEDBACK_REWARD_PRESETS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n.toLocaleString()} gems
                      </option>
                    ))}
                    <option value={CUSTOM}>Other amount…</option>
                  </TextField>
                  {gemsChoice === CUSTOM && (
                    <TextField
                      autoFocus
                      type="number"
                      size="small"
                      label="Gem amount"
                      value={customGems}
                      onChange={(e) => setCustomGems(e.target.value)}
                      slotProps={{ htmlInput: { min: 1, max: FEEDBACK_REWARD_MAX_GEMS, step: 1 } }}
                      error={customGems !== "" && !gemsValid}
                      helperText={`1 to ${FEEDBACK_REWARD_MAX_GEMS.toLocaleString()}`}
                      sx={{ mt: 1.5, width: 200 }}
                    />
                  )}
                </Box>

                <Box>
                  <TextField
                    select
                    fullWidth
                    label="Message"
                    value={presetKey}
                    onChange={(e) => choosePreset(e.target.value)}
                    slotProps={{ select: { native: true } }}
                  >
                    <option value={NONE}>Choose a message…</option>
                    <optgroup label="With gems">
                      {FEEDBACK_MESSAGE_PRESETS.filter((p) => p.withGems).map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Reply">
                      {FEEDBACK_MESSAGE_PRESETS.filter((p) => !p.withGems).map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <option value={CUSTOM}>Write my own…</option>
                  </TextField>
                  <TextField
                    multiline
                    minRows={4}
                    fullWidth
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      setPresetKey(CUSTOM);
                    }}
                    placeholder="What the user will read"
                    slotProps={{
                      htmlInput: {
                        maxLength: FEEDBACK_REWARD_MESSAGE_MAX_LENGTH,
                        "aria-label": "Message the user will see",
                      },
                    }}
                    helperText={`Sent exactly as written. ${message.length} / ${FEEDBACK_REWARD_MESSAGE_MAX_LENGTH}`}
                    sx={{ mt: 1.5 }}
                  />
                </Box>
              </Stack>
            )}

            <Typography variant="body2" color="text.secondary">
              {summary}
            </Typography>
          </>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}
