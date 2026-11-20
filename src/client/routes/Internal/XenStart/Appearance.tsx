import { useEffect, useState } from "react";
import { Alert, Box, Typography, alpha } from "@mui/material";
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

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      window.clearTimeout(timer);
      const time = new Date();
      setNow(time);
      timer = window.setTimeout(tick, 60_000 - (time.getTime() % 60_000));
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
        fontSize: "clamp(2rem, 8vw, 4rem)",
        fontWeight: 500,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.15,
      }}
    >
      {timeFormat.format(now)}
    </Typography>
  );
}
