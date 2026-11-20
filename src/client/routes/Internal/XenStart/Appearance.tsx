import { useEffect, useState } from "react";
import { Alert, Box, Typography, alpha } from "@mui/material";
import type { ClockFormat } from "@shared/xenstart";
import { RADIUS } from "../../../theme";

export function BackgroundImage({ url, preview = false }: { url: string; preview?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return preview ? <Alert severity="warning">Couldn’t load the background preview.</Alert> : null;

  return (
    <Box
      sx={{
        position: preview ? "relative" : "fixed",
        ...(preview ? { height: 132, borderRadius: RADIUS.lg, overflow: "hidden" } : { inset: 0, zIndex: -1 }),
        pointerEvents: "none",
        "&::after": {
          content: '""',
          position: "absolute",
          inset: 0,
          bgcolor: (theme) => alpha(theme.palette.background.default, 0.72),
        },
      }}
    >
      <Box
        component="img"
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        sx={{ display: "block", width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }}
      />
    </Box>
  );
}

const clockFormats: Record<ClockFormat, Intl.DateTimeFormat> = {
  locale: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }),
  "12-hour": new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h12",
  }),
  "24-hour": new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }),
};

export function Clock({ compact = false, format = "locale" }: { compact?: boolean; format?: ClockFormat }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      window.clearTimeout(timer);
      const time = new Date();
      setNow(time);
      if (!document.hidden) timer = window.setTimeout(tick, 1000 - (time.getTime() % 1000));
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      document.removeEventListener("visibilitychange", tick);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <Typography
      component="time"
      dateTime={now.toISOString()}
      sx={{
        display: "block",
        mb: 2,
        textAlign: "center",
        fontSize: compact ? "clamp(1.5rem, 5vw, 2rem)" : "clamp(2rem, 8vw, 4rem)",
        fontWeight: 500,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.15,
      }}
    >
      {clockFormats[format].format(now)}
    </Typography>
  );
}
