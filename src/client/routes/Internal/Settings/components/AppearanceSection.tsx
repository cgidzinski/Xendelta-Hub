import { Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import { useSnackbar } from "notistack";
import { RADIUS } from "../../../../theme";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import type { ThemePreference } from "../../../../hooks/user/useUserProfile";

/**
 * Light or dark, or follow the device — defaulting to dark until you pick something.
 *
 * "System" is a real, explicit value ("system") distinct from "" (never chosen), because
 * those two need different resolutions: unset defaults to dark, while an explicit System
 * choice should actually track the OS.
 */
export default function AppearanceSection() {
  const { profile, updateProfile, isUpdating } = useUserProfile();
  const { enqueueSnackbar } = useSnackbar();
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  const stored: ThemePreference = profile?.theme ?? "";
  const effective = stored === "" ? "dark" : stored === "system" ? (prefersDark ? "dark" : "light") : stored;

  const save = async (value: ThemePreference) => {
    try {
      await updateProfile({ theme: value });
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : "Could not save your theme", { variant: "error" });
    }
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        {stored === ""
          ? "Defaulting to dark until you choose otherwise."
          : stored === "system"
            ? `Following your device, which is currently ${effective}.`
            : `Set by you to ${stored}.`}{" "}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={stored}
        disabled={isUpdating}
        // null means the active button was clicked again; keep the current value
        // rather than dropping into an unset state the server has no meaning for.
        onChange={(_, value: ThemePreference | null) => value !== null && save(value)}
        aria-label="Theme"
        // Separate tiles rather than one fused strip: three icon-and-label buttons in a narrow card were squeezing the
        // text against the icon.
        sx={{
          gap: 1,
          "& .MuiToggleButtonGroup-grouped": {
            mx: 0,
            px: 1,
            py: 1.25,
            gap: 0.75,
            border: 1,
            borderColor: "divider",
            borderRadius: RADIUS.md,
            "&.Mui-selected": { borderColor: "primary.main" },
            // On a phone the label sits under the icon instead of beside it, which keeps "System" from being clipped.
            flexDirection: { xs: "column", sm: "row" },
          },
        }}
      >
        <ToggleButton value="system" aria-label="Follow my device">
          <SettingsBrightnessIcon fontSize="small" />
          <Typography variant="body2" component="span">
            System
          </Typography>
        </ToggleButton>
        <ToggleButton value="light" aria-label="Light theme">
          <LightModeIcon fontSize="small" />
          <Typography variant="body2" component="span">
            Light
          </Typography>
        </ToggleButton>
        <ToggleButton value="dark" aria-label="Dark theme">
          <DarkModeIcon fontSize="small" />
          <Typography variant="body2" component="span">
            Dark
          </Typography>
        </ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  );
}
