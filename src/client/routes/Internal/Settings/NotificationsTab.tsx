import { FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import SectionCard from "../../../components/ui/SectionCard";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { usePushNotifications } from "../../../pwa/hooks/usePushNotifications";
import { BRAND_NAME } from "@shared/brand";

/** What the app is allowed to tell you about, and where it reaches you. */
export default function NotificationsTab() {
  const { profile, updateProfile, isUpdating } = useUserProfile();
  const { enqueueSnackbar } = useSnackbar();
  const {
    supported: pushSupported,
    needsInstall: pushNeedsInstall,
    subscribed: pushSubscribed,
    isBusy: pushBusy,
    error: pushError,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
  } = usePushNotifications();

  // Runs from the switch's onChange so the permission request stays inside a user gesture —
  // browsers reject Notification.requestPermission() called any other way.
  const handlePushToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const ok = await subscribePush();
      if (ok) enqueueSnackbar("Push notifications enabled on this device", { variant: "success" });
    } else {
      const ok = await unsubscribePush();
      if (ok) enqueueSnackbar("Push notifications disabled on this device", { variant: "info" });
    }
  };

  const handleEmailToggle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    const ok = await updateProfile({ emailNotifications: checked });
    if (ok) {
      enqueueSnackbar(checked ? "Email notifications enabled" : "Email notifications disabled", {
        variant: "success",
      });
    }
  };

  return (
    <Stack spacing={2}>
      <SectionCard
        title="This device"
        description={`Alerts on this phone or computer, even when ${BRAND_NAME} is closed. Each device is turned on separately.`}
      >
        <FormControlLabel
          control={
            <Switch
              checked={pushSubscribed}
              onChange={handlePushToggle}
              disabled={!pushSupported || pushNeedsInstall || pushBusy}
            />
          }
          label="Push notifications on this device"
        />
        {pushNeedsInstall && (
          <Typography variant="caption" color="text.secondary">
            On iPhone, tap Share → Add to Home Screen, then open {BRAND_NAME} from that icon to turn on notifications.
          </Typography>
        )}
        {!pushSupported && !pushNeedsInstall && (
          <Typography variant="caption" color="text.secondary">
            This browser does not support push notifications.
          </Typography>
        )}
        {pushError && (
          <Typography variant="caption" color="error">
            {pushError}
          </Typography>
        )}
      </SectionCard>

      <SectionCard title="Email" description="Sent to the address on your account.">
        <FormControlLabel
          control={
            <Switch checked={profile?.emailNotifications ?? true} onChange={handleEmailToggle} disabled={isUpdating} />
          }
          label="Email notifications"
        />
        <Typography variant="caption" color="text.secondary">
          XenSplit expenses and settlements, reminders, and other account activity.
        </Typography>
      </SectionCard>
    </Stack>
  );
}
