import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Typography, alpha } from "@mui/material";
import { DEFAULT_BACKGROUND_FIT, type BackgroundFit, type ClockFormat, type WidgetSize } from "@shared/xenstart";
import { RADIUS } from "../../../theme";

export function BackgroundImage({
  url,
  blob,
  fit = DEFAULT_BACKGROUND_FIT,
  preview = false,
}: {
  url?: string;
  blob?: Blob;
  fit?: BackgroundFit;
  preview?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const attachBlob = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image || !blob) return;
      const source = URL.createObjectURL(blob);
      image.src = source;
      return () => URL.revokeObjectURL(source);
    },
    [blob],
  );
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
          bgcolor: (theme) => alpha(theme.palette.background.default, preview ? 0.15 : 0.72),
        },
      }}
    >
      <Box
        component="img"
        ref={attachBlob}
        src={blob ? undefined : url}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        sx={{ display: "block", width: "100%", height: "100%", objectFit: fit, objectPosition: "center" }}
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

const clockSizes: Record<WidgetSize, string> = {
  small: "clamp(1rem, 8cqi, 2rem)",
  medium: "clamp(1.25rem, 11cqi, 4rem)",
  large: "clamp(1.5rem, 14cqi, 5.5rem)",
};

export function Clock({ format = "locale", size = "medium" }: { format?: ClockFormat; size?: WidgetSize }) {
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
    <Box sx={{ containerType: "inline-size" }}>
      <Typography
        component="time"
        dateTime={now.toISOString()}
        sx={{
          display: "block",
          mb: 2,
          textAlign: "center",
          fontSize: clockSizes[size],
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.15,
        }}
      >
        {clockFormats[format].format(now)}
      </Typography>
    </Box>
  );
}
