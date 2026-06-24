import { useState } from "react";
import { Box, Typography } from "@mui/material";

type Responsive<T> = T | { xs: T; sm: T };

interface GroupAvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: Responsive<number>;
  borderRadius?: number;
  fontSize?: Responsive<string>;
}

/**
 * Group avatar that always renders the colored letter-initial underneath, with the
 * image layered on top. The letter is visible while the image loads and if it fails,
 * and the image covers it once decoded.
 */
export default function GroupAvatar({ name, imageUrl, size = 48, borderRadius = 2, fontSize = "1.2rem" }: GroupAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(imageUrl) && !errored;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        position: "relative",
        borderRadius,
        overflow: "hidden",
        bgcolor: "primary.main",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Typography sx={{ color: "#fff", fontWeight: 800, fontSize, lineHeight: 1 }}>
        {name[0]?.toUpperCase() ?? "?"}
      </Typography>
      {showImage && (
        <Box
          component="img"
          src={imageUrl as string}
          alt={name}
          onError={() => setErrored(true)}
          sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </Box>
  );
}
