import { useAuth } from "../contexts/AuthContext";
import { useUserNotifications } from "../hooks/user/useUserNotifications";
import { useAppBadge } from "./hooks/useAppBadge";
import { usePWAInstall } from "./hooks/usePWAInstall";
import OfflineIndicator from "./components/OfflineIndicator";
import PWAInstallBanner from "./components/PWAInstallBanner";
import PWAPushPromptBanner from "./components/PWAPushPromptBanner";
import UpdateBanner from "./components/UpdateBanner";

export default function PWA() {
  const { isAuthenticated } = useAuth();
  const { notifications } = useUserNotifications();
  const unread = notifications?.filter((n) => n.unread).length ?? 0;
  useAppBadge(unread);

  // Both banners are fixed-to-bottom, so only show one at a time — installing takes
  // priority since it's the shorter-lived prompt (dismissed or accepted immediately),
  // and on iOS push is impossible until install happens anyway.
  const { isInstallable, isIOS, isDismissed: installDismissed, isInstalled } = usePWAInstall();
  const installBannerVisible = (isInstallable || isIOS) && !installDismissed && !isInstalled;

  return (
    <>
      <UpdateBanner />
      <OfflineIndicator />
      <PWAInstallBanner />
      {isAuthenticated && !installBannerVisible && <PWAPushPromptBanner />}
    </>
  );
}
