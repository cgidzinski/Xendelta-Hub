import { Badge, Box, Button, IconButton, Stack, Tooltip } from "@mui/material";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { formatMinutes } from "@shared/xenkitchen/kitchen";
import { type TimerSource } from "@shared/xenkitchen/timers";
import { useTimers } from "./TimerProvider";
import { timerCountdown, timerFinished } from "./timerDisplay";

export function TimersButton({ compact = false }: { compact?: boolean }) {
  const { timers, now, open } = useTimers();
  const count = timers.filter((timer) => !timerFinished(timer, now)).length;
  return (
    <Button
      variant="outlined"
      aria-label={count ? `Timers, ${count} active` : "Timers"}
      onClick={() => open()}
      sx={{ gap: 1, flexShrink: 0, minWidth: 44, minHeight: 44, px: compact ? { xs: 1, sm: 1.5 } : 1.5 }}
    >
      <Badge badgeContent={count} color="primary" invisible={!count}>
        <TimerOutlinedIcon fontSize="small" />
      </Badge>
      <Box component="span" sx={{ display: compact ? { xs: "none", sm: "inline" } : "inline" }}>
        Timers
      </Box>
    </Button>
  );
}

export function RecipeTimerButton({
  minutes,
  source,
  large = false,
}: {
  minutes: number;
  source: TimerSource;
  large?: boolean;
}) {
  const { timers, now, open, start, edit, busy } = useTimers();
  const timer = timers.find((candidate) => candidate.sourceKey === source.key);
  const draft = { durationSeconds: Math.max(1, Math.round(minutes * 60)), halfway: false, source };
  const label = timer
    ? timerFinished(timer, now)
      ? "Timer done"
      : `${timerCountdown(timer, now)}${timer.pausedMs !== null ? " · Paused" : ""}`
    : `Start ${formatMinutes(minutes)} timer`;
  return (
    <Stack
      direction="row"
      spacing={0.5}
      alignItems="center"
      sx={{ mt: large ? 3 : 1, "@media print": { display: "none" } }}
    >
      <Button
        variant="outlined"
        size={large ? "large" : "small"}
        startIcon={<TimerOutlinedIcon />}
        sx={{ fontVariantNumeric: "tabular-nums" }}
        disabled={busy.has(source.key)}
        onClick={() => (timer ? open(timer.id) : void start(draft))}
      >
        {label}
      </Button>
      {!timer && (
        <Tooltip title="Timer options">
          <IconButton aria-label="Timer options" onClick={() => edit(draft)}>
            <MoreHorizIcon />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}
