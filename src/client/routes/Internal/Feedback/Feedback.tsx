import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { FEEDBACK_MAX_LENGTH, FEEDBACK_MIN_LENGTH } from "@shared/feedback";
import { GemIcon } from "../../../components/icons/GemIcon";
import { GEM_COLOR } from "../../../theme";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import { useTitle } from "../../../hooks/useTitle";
import { useSendFeedback } from "../../../hooks/feedback/useSendFeedback";

/** Send an idea, a problem or anything else to the people who run the hub. Linked from Home. */
export default function Feedback() {
  useTitle("Send feedback");
  const navigate = useNavigate();
  const send = useSendFeedback();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const trimmed = message.trim();
  const ok = trimmed.length >= FEEDBACK_MIN_LENGTH;

  if (sent) {
    return (
      <PageContainer width="narrow">
        <PageHeader title="Thanks" />
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="success" sx={{ width: "100%" }}>
            Your feedback was sent. We read everything, and if we fix the bug or build the idea, you'll be rewarded with
            gems.
          </Alert>
          <Stack direction="row" spacing={1}>
            <Button
              onClick={() => {
                setMessage("");
                setSent(false);
              }}
            >
              Send more
            </Button>
            <Button variant="contained" onClick={() => navigate("/internal")}>
              Back home
            </Button>
          </Stack>
        </Stack>
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeader title="Send feedback" subtitle="An idea, something that's wrong, or anything else." />
      <Stack spacing={2}>
        <Alert severity="info" icon={<GemIcon sx={{ color: GEM_COLOR }} />}>
          Bug reports and feature ideas that get implemented are rewarded with gems. Tell us what went wrong, or what
          you'd like to see.
        </Alert>
        <TextField
          label="Your message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          multiline
          minRows={5}
          fullWidth
          autoFocus
          slotProps={{ htmlInput: { maxLength: FEEDBACK_MAX_LENGTH } }}
          helperText={`${trimmed.length} / ${FEEDBACK_MAX_LENGTH}`}
        />
        {send.isError && (
          <Alert severity="error">{(send.error as Error).message || "Couldn't send that. Try again."}</Alert>
        )}
        <Button
          variant="contained"
          disabled={!ok || send.isPending}
          onClick={() => send.mutate({ message: trimmed }, { onSuccess: () => setSent(true) })}
          sx={{ alignSelf: "flex-start" }}
        >
          {send.isPending ? "Sending…" : "Send"}
        </Button>
      </Stack>
    </PageContainer>
  );
}
