import { useEffect, useRef, useState } from "react";
import { Box, ButtonBase, CircularProgress, IconButton, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import type { ChatVoice } from "@shared/chat";
import { formatDuration, nextSpeed } from "../../utils/voice";

interface Props {
  voice: ChatVoice;
  /** The audio's address. Signed links are short-lived, so it is asked for when playing starts. */
  getUrl: () => Promise<string>;
  /** Draw as part of the sender's own bubble (a bit lighter on the bubble colour). */
  onPrimary?: boolean;
}

/** A voice message: play and pause, a waveform that shows progress and can be clicked to jump, the speed, and the time. */
export default function VoiceMessage({ voice, getUrl, onPrimary }: Props) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<{ value: string; at: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const total = voice.duration;
  const progress = total > 0 ? Math.min(1, time / total) : 0;

  useEffect(() => () => audio.current?.pause(), []);

  const element = async () => {
    if (!audio.current) {
      const el = new Audio();
      el.preload = "none";
      el.addEventListener("timeupdate", () => setTime(el.currentTime));
      el.addEventListener("ended", () => {
        setPlaying(false);
        setTime(0);
      });
      el.addEventListener("pause", () => setPlaying(false));
      el.addEventListener("play", () => setPlaying(true));
      audio.current = el;
    }
    // A link lasts 15 minutes: ask again after ten.
    if (!url.current || Date.now() - url.current.at > 10 * 60_000) {
      url.current = { value: await getUrl(), at: Date.now() };
      const el = audio.current;
      const resume = el.currentTime;
      el.src = url.current.value;
      el.currentTime = resume;
    }
    return audio.current;
  };

  const toggle = async () => {
    setFailed(false);
    try {
      if (audio.current && !audio.current.paused) return audio.current.pause();
      setLoading(true);
      const el = await element();
      el.playbackRate = speed;
      await el.play();
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const seek = async (fraction: number) => {
    try {
      const el = await element();
      // The length of a recording made in a browser isn't always known to the player: the message's own length is.
      el.currentTime = fraction * total;
      setTime(el.currentTime);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: 300, maxWidth: "100%" }}>
      <IconButton
        size="small"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        sx={{
          bgcolor: (t) => alpha(onPrimary ? t.palette.primary.contrastText : t.palette.primary.main, 0.16),
          "&:hover": {
            bgcolor: (t) => alpha(onPrimary ? t.palette.primary.contrastText : t.palette.primary.main, 0.26),
          },
        }}
      >
        {loading ? <CircularProgress size={20} /> : playing ? <PauseIcon /> : <PlayArrowIcon />}
      </IconButton>
      <ButtonBase
        component="div"
        role="slider"
        aria-label="Position in the voice message"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(time)}
        aria-valuetext={`${formatDuration(time)} of ${formatDuration(total)}`}
        tabIndex={0}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          void seek(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") void seek(Math.min(1, progress + 5 / total));
          if (e.key === "ArrowLeft") void seek(Math.max(0, progress - 5 / total));
        }}
        sx={{ flex: 1, minWidth: 0, height: 32, display: "flex", alignItems: "center", gap: "1px", cursor: "pointer" }}
      >
        {voice.waveform.map((level, i) => {
          const played = (i + 0.5) / voice.waveform.length <= progress;
          return (
            <Box
              key={i}
              aria-hidden
              sx={{
                flex: 1,
                minWidth: "1px",
                height: `${Math.max(12, Math.round((level / 255) * 100))}%`,
                borderRadius: 1,
                bgcolor: (t) =>
                  onPrimary
                    ? alpha(t.palette.primary.contrastText, played ? 1 : 0.45)
                    : played
                      ? t.palette.primary.main
                      : t.palette.action.disabled,
              }}
            />
          );
        })}
      </ButtonBase>
      <Typography variant="caption" sx={{ minWidth: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {failed ? "Failed" : formatDuration(playing || time > 0 ? time : total)}
      </Typography>
      <ButtonBase
        onClick={() => {
          const next = nextSpeed(speed);
          setSpeed(next);
          if (audio.current) audio.current.playbackRate = next;
        }}
        aria-label={`Playback speed ${speed}x`}
        sx={{ px: 0.75, borderRadius: 1, fontSize: 12, fontWeight: 600, border: 1, borderColor: "divider" }}
      >
        {speed}x
      </ButtonBase>
    </Box>
  );
}
