import { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import type { Cosmetics } from "@shared/cosmetics";
import { RADIUS } from "../../theme";
import UserAvatar from "../user/UserAvatar";
import UserName from "../user/UserName";

interface Props {
  name: string;
  avatar?: string;
  /** What they wear, so their frame and name colour show here too. */
  cosmetics?: Cosmetics;
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
export default function CallTile({ name, avatar, cosmetics, stream, muted, speaking, self, screen }: Props) {
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
        borderRadius: RADIUS.lg,
        border: 1,
        borderColor: speaking ? "success.main" : "divider",
        containerType: "inline-size",
        overflow: "hidden",
        bgcolor: screen ? "common.black" : "background.paper",
        boxShadow: (t) => (speaking ? `inset 0 0 0 1px ${t.palette.success.main}` : "none"),
        transition: "border-color 0.15s",
        "@media (prefers-reduced-motion: reduce)": { transition: "none" },
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        aspectRatio: screen ? undefined : "16 / 10",
      }}
      aria-label={`${name}${speaking ? ", speaking" : ""}${muted ? ", muted" : ""}`}
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
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: screen ? "contain" : "cover",
            transform: self && !screen ? "scaleX(-1)" : "none",
          }}
        />
      ) : (
        <UserAvatar
          user={{ avatar, cosmetics }}
          sx={{
            width: "clamp(24px, 22cqw, 72px)",
            height: "clamp(24px, 22cqw, 72px)",
            fontSize: "clamp(12px, 8cqw, 28px)",
          }}
        >
          {name[0]?.toUpperCase()}
        </UserAvatar>
      )}
      <Box
        sx={{
          position: "absolute",
          left: 6,
          bottom: 6,
          maxWidth: "calc(100% - 12px)",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: RADIUS.sm,
          bgcolor: "background.paper",
          opacity: 0.92,
        }}
      >
        {screen && <ScreenShareIcon sx={{ fontSize: 14 }} aria-hidden />}
        {speaking && <GraphicEqIcon sx={{ fontSize: 14, color: "success.main" }} aria-hidden />}
        {muted && <MicOffIcon sx={{ fontSize: 14 }} color="error" aria-hidden />}
        <Typography variant="caption" noWrap>
          {self ? "You" : <UserName user={{ username: name, cosmetics }} />}
        </Typography>
      </Box>
    </Box>
  );
}
