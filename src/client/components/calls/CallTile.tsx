import { useEffect, useRef } from "react";
import { Avatar, Box, Typography } from "@mui/material";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";

interface Props {
  name: string;
  avatar?: string;
  /** The picture to show (a camera or a screen). Without it, the person's avatar. */
  stream?: MediaStream | null;
  muted?: boolean;
  speaking?: boolean;
  /** Your own tile: mirrored, and never played back (you would hear yourself). */
  self?: boolean;
  /** A shared screen rather than a camera: shown whole instead of cropped. */
  screen?: boolean;
}

/** One person in the call: their video (or avatar), their name, whether they are muted, and a ring when they are talking. */
export default function CallTile({ name, avatar, stream, muted, speaking, self, screen }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream ?? null;
  }, [stream]);
  const showVideo = !!stream && stream.getVideoTracks().length > 0;

  return (
    <Box
      sx={{
        position: "relative",
        minWidth: 0,
        minHeight: 0,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "action.hover",
        outline: 3,
        outlineStyle: "solid",
        outlineColor: speaking ? "success.main" : "transparent",
        transition: "outline-color 0.15s",
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        aspectRatio: "16 / 10",
      }}
      aria-label={`${name}${screen ? "'s screen" : ""}${speaking ? ", speaking" : ""}${muted ? ", muted" : ""}`}
      role="group"
    >
      {showVideo ? (
        <Box
          component="video"
          ref={video}
          autoPlay
          playsInline
          muted
          sx={{
            width: "100%",
            height: "100%",
            objectFit: screen ? "contain" : "cover",
            transform: self && !screen ? "scaleX(-1)" : "none",
          }}
        />
      ) : (
        <Avatar src={avatar || undefined} sx={{ width: 72, height: 72, fontSize: 28 }}>
          {name[0]?.toUpperCase()}
        </Avatar>
      )}
      <Box
        sx={{
          position: "absolute",
          left: 8,
          bottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 1,
          bgcolor: "background.paper",
          opacity: 0.92,
        }}
      >
        {screen && <ScreenShareIcon sx={{ fontSize: 14 }} aria-hidden />}
        {muted && <MicOffIcon sx={{ fontSize: 14 }} color="error" aria-hidden />}
        <Typography variant="caption" noWrap>
          {self ? "You" : name}
          {screen ? "'s screen" : ""}
        </Typography>
      </Box>
    </Box>
  );
}
