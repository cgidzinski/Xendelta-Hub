import type { ReactNode } from "react";
import { Badge, Box } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { PRESENCE_LABELS, type PresenceStatus } from "@shared/presence";
import { usePresence } from "../../hooks/presence/usePresence";

const colorOf = (t: Theme, status: PresenceStatus) =>
  status === "online"
    ? t.palette.success.main
    : status === "idle"
      ? t.palette.warning.main
      : status === "dnd"
        ? t.palette.error.main
        : t.palette.text.disabled;

export const statusLabel = (status: PresenceStatus) => (status === "offline" ? "Offline" : PRESENCE_LABELS[status]);

/** A small coloured dot for a status. Offline is a grey dot, so a list can tell "away" from "no dot yet". */
export function PresenceDot({ status, size = 10 }: { status: PresenceStatus; size?: number }) {
  return (
    <Box
      role="img"
      aria-label={statusLabel(status)}
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        bgcolor: (t) => colorOf(t, status),
        // do not disturb carries a bar through the dot, so colour is not the only signal
        ...(status === "dnd" && {
          position: "relative",
          "&::after": {
            content: '""',
            position: "absolute",
            left: "20%",
            right: "20%",
            top: "42%",
            height: "16%",
            bgcolor: "background.paper",
          },
        }),
      }}
    />
  );
}

/** Wraps an avatar and puts how that person looks at its corner. Nothing is drawn for someone offline unless asked. */
export function PresenceBadge({
  userId,
  size = 10,
  showOffline = false,
  children,
}: {
  userId: string | null | undefined;
  size?: number;
  showOffline?: boolean;
  children: ReactNode;
}) {
  const { of } = usePresence();
  const { status } = of(userId);
  if (status === "offline" && !showOffline) return <>{children}</>;
  return (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      badgeContent={
        <Box sx={{ p: "2px", borderRadius: "50%", bgcolor: "background.paper", display: "flex" }}>
          <PresenceDot status={status} size={size} />
        </Box>
      }
      sx={{ "& .MuiBadge-badge": { p: 0, minWidth: 0, height: "auto", bgcolor: "transparent" } }}
    >
      {children}
    </Badge>
  );
}
