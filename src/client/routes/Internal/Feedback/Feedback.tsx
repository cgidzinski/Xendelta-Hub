import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Button, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import {
  FEEDBACK_KINDS,
  FEEDBACK_KIND_LABEL,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  type FeedbackKind,
} from "@shared/feedback";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import { useTitle } from "../../../hooks/useTitle";
import { useSendFeedback } from "../../../hooks/feedback/useSendFeedback";
import { pageFromParam } from "./feedbackPage";

const PLACEHOLDER: Record<FeedbackKind, string> = {
  idea: "I'd love it if…",
  bug: "What happened, and what did you expect?",
  other: "Tell us anything",
};

/** Send an idea, a problem or anything else to the people who run the hub. Linked from the sidebar. */
export default function Feedback() {
  useTitle("Send feedback");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const page = pageFromParam(params.get("from"));
  const send = useSendFeedback();
  const [kind, setKind] = useState<FeedbackKind>("idea");
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
            Your feedback was sent. We read everything.
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
      <PageHeader
        title="Send feedback"
        subtitle="An idea, something that's wrong, or anything else. It goes to the people who run the hub."
      />
      <Stack spacing={2}>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          color="primary"
          value={kind}
          onChange={(_, v: FeedbackKind | null) => v && setKind(v)}
        >
          {FEEDBACK_KINDS.map((k) => (
            <ToggleButton key={k} value={k}>
              {FEEDBACK_KIND_LABEL[k]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          label="Your message"
          placeholder={PLACEHOLDER[kind]}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          multiline
          minRows={5}
          fullWidth
          autoFocus
          slotProps={{ htmlInput: { maxLength: FEEDBACK_MAX_LENGTH } }}
          helperText={`${trimmed.length} / ${FEEDBACK_MAX_LENGTH}`}
        />
        {page && (
          <Typography variant="caption" color="text.secondary">
            Sent from {page}
          </Typography>
        )}
        {send.isError && (
          <Alert severity="error">{(send.error as Error).message || "Couldn't send that. Try again."}</Alert>
        )}
        <Button
          variant="contained"
          disabled={!ok || send.isPending}
          onClick={() => send.mutate({ kind, message: trimmed, page }, { onSuccess: () => setSent(true) })}
          sx={{ alignSelf: "flex-start" }}
        >
          {send.isPending ? "Sending…" : "Send"}
        </Button>
      </Stack>
    </PageContainer>
  );
}
