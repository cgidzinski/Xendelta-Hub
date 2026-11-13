import { Badge, Box, ButtonBase, Typography } from "@mui/material";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import type { AppRegistryItem } from "../../../../constants/apps";
import { cardSx } from "../../../../components/ui/surfaceStyles";

interface AppTileProps {
  app: AppRegistryItem;
  /** How many things are waiting in the app (shown as a badge). */
  count?: number;
  onClick: () => void;
  /** Set while choosing pinned apps: the tile shows whether it is pinned instead of a count. */
  pinChoice?: { pinned: boolean; disabled?: boolean };
}

/** One app as a big, easy target: its icon and name, with a count of what is waiting. Used for the pinned apps and while choosing them. */
export default function AppTile({ app, count = 0, onClick, pinChoice }: AppTileProps) {
  const choosing = !!pinChoice;
  const pinned = !!pinChoice?.pinned;
  const label = choosing
    ? `${pinned ? "Unpin" : "Pin"} ${app.label}`
    : count
      ? `${app.label}, ${count} waiting`
      : app.label;
  return (
    <ButtonBase
      onClick={onClick}
      disabled={pinChoice?.disabled}
      aria-label={label}
      aria-pressed={choosing ? pinned : undefined}
      sx={{
        ...cardSx,
        bgcolor: "background.paper",
        flexDirection: "column",
        gap: 1,
        minHeight: 96,
        px: 1,
        py: 1.5,
        minWidth: 0,
        position: "relative",
        ...(choosing && pinned ? { borderColor: "primary.main", borderWidth: 2 } : {}),
        ...(choosing && !pinned ? { opacity: 0.75, borderStyle: "dashed" } : {}),
        "&:hover": { borderColor: "primary.main" },
        "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
      }}
    >
      {choosing && (
        <Box
          sx={{
            position: "absolute",
            top: 6,
            right: 6,
            display: "flex",
            color: pinned ? "primary.main" : "text.secondary",
          }}
        >
          {pinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
        </Box>
      )}
      <Badge
        badgeContent={choosing ? 0 : count}
        color="error"
        max={99}
        sx={{ "& .MuiBadge-badge": { fontWeight: 700, right: -6, top: -4 } }}
      >
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2,
            display: "grid",
            placeItems: "center",
            bgcolor: "action.hover",
            color: "primary.main",
          }}
        >
          <app.icon sx={{ fontSize: 26 }} />
        </Box>
      </Badge>
      <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: "100%" }}>
        {app.label}
      </Typography>
    </ButtonBase>
  );
}
