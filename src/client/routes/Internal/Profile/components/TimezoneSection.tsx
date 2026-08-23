import { Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import { useUserProfile } from "../../../../hooks/user/useUserProfile";
import { COMMON_TIMEZONES, browserTimezone } from "../../../../constants/timezones";

/**
 * How months and dates look for you.
 *
 * By default this follows the browser, shown up front so the choice isn't blind. Checking
 * the override reveals the picker, preselected with the detected zone; unchecking clears
 * the saved preference back to the browser. This only changes how things *look* — each
 * book stores its dates in its own timezone.
 */
export default function TimezoneSection() {
    const { profile, updateProfile, isUpdating } = useUserProfile();
    const { enqueueSnackbar } = useSnackbar();

    const detected = browserTimezone();
    const stored = profile?.timezone || "";
    const overriding = stored !== "";
    const effective = overriding ? stored : detected;
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

    const toggleOverride = (enabled: boolean) => {
        save(enabled ? (stored || detected) : "");
    };

    return (
        <Stack spacing={1}>
            <Typography variant="subtitle1">
                Your timezone: <b>{effective}</b>
            </Typography>
            <Typography variant="body2" color="text.secondary">
                {overriding ? "Set by you" : "Detected from your browser"}. Months and dates
                display in this zone.
            </Typography>
            <FormControlLabel
                control={
                    <Checkbox
                        size="small"
                        checked={overriding}
                        disabled={isUpdating}
                        onChange={(e) => toggleOverride(e.target.checked)}
                    />
                }
                label="Override my timezone"
            />
            {overriding && (
                <TextField
                    select fullWidth size="small" label="Timezone" value={stored}
                    onChange={(e) => save(e.target.value)}
                    disabled={isUpdating}
                    sx={{ maxWidth: 360 }}
                >
                    {options.map((tz) => <MenuItem key={tz} value={tz}>{tz}</MenuItem>)}
                </TextField>
            )}
        </Stack>
    );
}
