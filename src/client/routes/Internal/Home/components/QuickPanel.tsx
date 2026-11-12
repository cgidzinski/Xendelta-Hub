import { Badge, Box, ButtonBase, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { APPS_REGISTRY } from "../../../../constants/apps";
import { cardSx } from "../../../../components/ui/surfaceStyles";

interface QuickPanelProps {
  pinnedApps: string[];
  /** Per sub-app: how many things are waiting (from the attention API). */
  counts: Record<string, number>;
}

/** Up to six pinned apps as big, easy targets: three by two on a phone, one row of six on a desktop. */
export default function QuickPanel({ pinnedApps, counts }: QuickPanelProps) {
  const navigate = useNavigate();
  const apps = pinnedApps.flatMap((key) => APPS_REGISTRY.filter((a) => a.key === key)).slice(0, 6);

  if (apps.length === 0) {
    return (
      <Typography color="text.secondary" variant="body2">
        No apps pinned. Use the pin icon next to an app in the sidebar for quick access.
      </Typography>
    );
  }

  return (
    <Box
      component="nav"
      aria-label="Pinned apps"
      sx={{
        display: "grid",
        gap: 1.25,
        gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))", md: "repeat(6, minmax(0, 1fr))" },
      }}
    >
      {apps.map((app) => {
        const count = counts[app.key] ?? 0;
        return (
          <ButtonBase
            key={app.key}
            onClick={() => navigate(app.path)}
            aria-label={count ? `${app.label}, ${count} waiting` : app.label}
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
              "&:hover": { borderColor: "primary.main" },
              "&.Mui-focusVisible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
            }}
          >
            <Badge
              badgeContent={count}
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
      })}
    </Box>
  );
}
