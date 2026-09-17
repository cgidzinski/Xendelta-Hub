import { Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from "@mui/material";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import { useSnackbar } from "notistack";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import type { ThemePreference } from "../../../../hooks/user/useUserProfile";

/**
 * Light or dark, or follow the device.
 *
 * "System" is stored as the empty string rather than a third value, matching how the
 * timezone preference treats "follow my browser" — only the device can answer it, so
 * there is nothing meaningful to persist.
 *
 * XenCasino is deliberately exempt and stays dark either way; its games are built on art
 * that assumes a dark ground.
 */
export default function AppearanceSection() {
    const { profile, updateProfile, isUpdating } = useUserProfile();
    const { enqueueSnackbar } = useSnackbar();
    const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

    const stored: ThemePreference = profile?.theme ?? "";
    const effective = stored || (prefersDark ? "dark" : "light");

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
                    ? `Following your device, which is currently ${effective}.`
                    : `Set by you to ${stored}.`}{" "}
                XenCasino stays dark whichever you pick.
            </Typography>
            <ToggleButtonGroup
                exclusive
                size="small"
                value={stored}
                disabled={isUpdating}
                // null means the active button was clicked again; keep the current value
                // rather than dropping into an unset state the server has no meaning for.
                onChange={(_, value: ThemePreference | null) => value !== null && save(value)}
                aria-label="Theme"
            >
                <ToggleButton value="" aria-label="Follow my device">
                    <SettingsBrightnessIcon fontSize="small" sx={{ mr: 0.75 }} />
                    System
                </ToggleButton>
                <ToggleButton value="light" aria-label="Light theme">
                    <LightModeIcon fontSize="small" sx={{ mr: 0.75 }} />
                    Light
                </ToggleButton>
                <ToggleButton value="dark" aria-label="Dark theme">
                    <DarkModeIcon fontSize="small" sx={{ mr: 0.75 }} />
                    Dark
                </ToggleButton>
            </ToggleButtonGroup>
        </Stack>
    );
}
