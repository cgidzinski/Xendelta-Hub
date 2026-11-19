import { Box, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import { useSnackbar } from "notistack";
import SectionCard from "../../../components/ui/SectionCard";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { usePushNotifications } from "../../../pwa/hooks/usePushNotifications";
import { BRAND_NAME } from "@shared/brand";
import {
  NOTIFICATION_APPS,
  NOTIFICATION_WAYS,
  isNotificationOn,
  type NotificationApp,
  type NotificationWay,
} from "@shared/notificationApps";

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

  const muted = profile?.mutedNotifications ?? [];
  const handleWayToggle = async (app: NotificationApp, way: NotificationWay, on: boolean) => {
    const key = `${app}:${way}`;
    const next = on ? muted.filter((m) => m !== key) : [...muted, key];
    await updateProfile({ mutedNotifications: next });
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

      <SectionCard
        title="By app"
        description="Choose how each app reaches you. Push needs the device switch above, and Email needs the email switch."
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr repeat(3, 56px)", sm: "1fr repeat(3, 80px)" },
            alignItems: "center",
            columnGap: 1,
          }}
        >
          <Box />
          {NOTIFICATION_WAYS.map((w) => (
            <Typography key={w.key} variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
              {w.label}
            </Typography>
          ))}
          {NOTIFICATION_APPS.map((a) => (
            <Box key={a.key} sx={{ display: "contents" }}>
              <Box sx={{ py: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {a.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {a.about}
                </Typography>
              </Box>
              {NOTIFICATION_WAYS.map((w) => (
                <Box key={w.key} sx={{ textAlign: "center" }}>
                  <Switch
                    size="small"
                    checked={isNotificationOn(muted, a.key, w.key)}
                    onChange={(e) => handleWayToggle(a.key, w.key, e.target.checked)}
                    disabled={isUpdating}
                    slotProps={{ input: { "aria-label": `${a.label}: ${w.label}` } }}
                  />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Announcements from the people who run {BRAND_NAME} always arrive.
        </Typography>
      </SectionCard>
    </Stack>
  );
}
