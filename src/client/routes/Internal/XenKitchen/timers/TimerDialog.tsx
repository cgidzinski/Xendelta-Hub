import { useId, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import { formatTimerDuration, MAX_TIMER_SECONDS, parseTimerDuration } from "@shared/xenkitchen/timers";
import EmptyState from "../../../../components/ui/EmptyState";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import { type TimerDraft, useTimers } from "./TimerProvider";
import { timerCountdown, timerFinished } from "./timerDisplay";

export function TimerDialog() {
  const titleId = useId();
  const { timers, now, panel, busy, error, loading, unavailable, close, retryList, edit, act } = useTimers();
  if (panel?.view === "new") return <NewTimer preset={panel.preset} />;
  return (
    <ResponsiveDialog
      open
      maxWidth="xs"
      aria-labelledby={titleId}
      title={<span id={titleId}>Timers</span>}
      onClose={close}
      actions={
        <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => edit()}>
          New timer
        </Button>
      }
    >
      <Stack spacing={1.5}>
        <TimerNotice />
        {error && (
          <Alert severity="error" action={error.retry && <Button onClick={error.retry}>Retry</Button>}>
            {error.message}
          </Alert>
        )}
        {unavailable && (
          <Alert severity="warning" action={<Button onClick={retryList}>Retry</Button>}>
            Couldn’t sync timers.
          </Alert>
        )}
        {loading && <ListSkeleton rows={2} />}
        {!loading && !timers.length && <EmptyState icon={<TimerOutlinedIcon />} title="No timers" />}
        {timers.map((timer) => {
          const finished = timerFinished(timer, now);
          const paused = timer.pausedMs !== null;
          const toggle = paused ? "Resume" : "Pause";
          const dismiss = finished ? "Dismiss" : "Cancel";
          return (
            <Card
              key={timer.id}
              variant="outlined"
              sx={{
                ...cardSx,
                p: 1.5,
                borderColor: panel?.view === "list" && panel.highlight === timer.id ? "primary.main" : "divider",
              }}
            >
              <Typography fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
                {timer.label}
              </Typography>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="h4" component="div" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {timerCountdown(timer, now)}
                  </Typography>
                  {finished && (
                    <Typography variant="body2" color="success.main">
                      Done
                    </Typography>
                  )}
                  {paused && (
                    <Typography variant="body2" color="text.secondary">
                      Paused
                    </Typography>
                  )}
                </Box>
                {!finished && (
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={busy.has(timer.id)}
                    aria-label={`${toggle} ${timer.label}`}
                    startIcon={paused ? <PlayArrowIcon /> : <PauseIcon />}
                    onClick={() => void act(timer, paused ? "resume" : "pause")}
                  >
                    {toggle}
                  </Button>
                )}
                <IconButton
                  aria-label={`${dismiss} ${timer.label}`}
                  disabled={busy.has(timer.id)}
                  onClick={() => void act(timer, "dismiss")}
                >
                  <CloseIcon />
                </IconButton>
              </Stack>
            </Card>
          );
        })}
      </Stack>
    </ResponsiveDialog>
  );
}

const QUICK_ADD_MINUTES = [1, 5, 10, 15];
const DURATION_ERROR = "Enter a time from 0:01 to 1440:00, in minutes or minutes and seconds.";

function NewTimer({ preset }: { preset?: TimerDraft }) {
  const { busy, error, clearError, close, start } = useTimers();
  const id = useId();
  const titleId = useId();
  const [duration, setDuration] = useState(() => (preset ? formatTimerDuration(preset.durationSeconds) : ""));
  const [halfway, setHalfway] = useState(preset?.halfway ?? false);
  const [invalid, setInvalid] = useState(false);
  const pending = busy.has("new");

  function add(minutes: number) {
    const seconds = duration.trim() ? parseTimerDuration(duration) : 0;
    if (seconds === null || seconds + minutes * 60 > MAX_TIMER_SECONDS) {
      setInvalid(true);
      return;
    }
    clearError();
    setDuration(formatTimerDuration(seconds + minutes * 60));
    setInvalid(false);
  }

  return (
    <ResponsiveDialog
      open
      maxWidth="xs"
      aria-labelledby={titleId}
      title={<span id={titleId}>New timer</span>}
      onClose={close}
      actions={
        <Button fullWidth type="submit" form={id} variant="contained" disabled={pending}>
          Start timer
        </Button>
      }
    >
      <Stack
        component="form"
        id={id}
        spacing={2}
        onSubmit={(event) => {
          event.preventDefault();
          const seconds = parseTimerDuration(duration);
          if (!seconds) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          void start({ durationSeconds: seconds, halfway, source: preset?.source }, true);
        }}
      >
        <TimerNotice />
        {error && (
          <Alert severity="error" action={error.retry && <Button onClick={error.retry}>Retry</Button>}>
            {error.message}
          </Alert>
        )}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 0.5 }}>
          {QUICK_ADD_MINUTES.map((minutes) => (
            <Button
              key={minutes}
              type="button"
              variant="outlined"
              size="small"
              disabled={pending}
              sx={{ minWidth: 0, px: 0.25, minHeight: 44, whiteSpace: "nowrap" }}
              onClick={() => add(minutes)}
            >
              +{minutes} min
            </Button>
          ))}
        </Box>
        <TextField
          fullWidth
          label="Duration"
          placeholder="0:00"
          value={duration}
          disabled={pending}
          error={invalid}
          helperText={invalid ? DURATION_ERROR : "Minutes and seconds"}
          onChange={(event) => {
            clearError();
            setDuration(event.target.value);
            setInvalid(false);
          }}
          slotProps={{
            htmlInput: {
              maxLength: 16,
              sx: { textAlign: "center", fontSize: "2rem", fontWeight: 600, fontVariantNumeric: "tabular-nums", py: 1 },
            },
          }}
        />
        <FormControlLabel
          label="Halfway action"
          labelPlacement="start"
          sx={{ justifyContent: "space-between", ml: 0, mr: 0 }}
          control={
            <Switch
              checked={halfway}
              disabled={pending}
              onChange={(event) => {
                clearError();
                setHalfway(event.target.checked);
              }}
            />
          }
        />
      </Stack>
    </ResponsiveDialog>
  );
}

function TimerNotice() {
  const { notice, dismissNotice } = useTimers();
  return notice ? (
    <Alert severity="info" role="status" onClose={dismissNotice} sx={{ whiteSpace: "pre-line" }}>
      {notice}
    </Alert>
  ) : null;
}
