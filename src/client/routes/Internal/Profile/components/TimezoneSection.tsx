import { MenuItem, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import { COMMON_TIMEZONES, browserTimezone } from "../../../../constants/timezones";

/**
 * Your default timezone, used to decide where a month starts and ends in XenBudget.
 *
 * "" is a real, meaningful value here — it means follow the browser — so the empty option
 * is the default rather than a placeholder, and it names the zone it detected so the
 * choice isn't blind.
 */
export default function TimezoneSection() {
    const { profile, updateProfile, isUpdating } = useUserProfile();
    const { enqueueSnackbar } = useSnackbar();

    const detected = browserTimezone();
    const stored = profile?.timezone || "";
    // Keep a stored zone in the list even if it isn't one of the curated ones, or
    // selecting it would silently fall back to the browser option.
    const options = stored && !COMMON_TIMEZONES.includes(stored)
        ? [stored, ...COMMON_TIMEZONES]
        : COMMON_TIMEZONES;

    const save = async (value: string) => {
        try {
            await updateProfile({ timezone: value });
        } catch (e) {
            enqueueSnackbar(e instanceof Error ? e.message : "Could not save your timezone", { variant: "error" });
        }
    };

    return (
        <>
            <TextField
                select fullWidth size="small" label="Timezone" value={stored}
                onChange={(e) => save(e.target.value)}
                disabled={isUpdating}
                sx={{ maxWidth: 360 }}
            >
                <MenuItem value="">Follow my browser ({detected})</MenuItem>
                {options.map((tz) => <MenuItem key={tz} value={tz}>{tz}</MenuItem>)}
            </TextField>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Decides where each month starts and ends in your budget tallies.
            </Typography>
        </>
    );
}
