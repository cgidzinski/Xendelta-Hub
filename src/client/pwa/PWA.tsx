import { useUserNotifications } from "../hooks/user/useUserNotifications";
import { useAppBadge } from "./hooks/useAppBadge";
import OfflineIndicator from "./components/OfflineIndicator";
import PWAInstallBanner from "./components/PWAInstallBanner";
import UpdateBanner from "./components/UpdateBanner";

export default function PWA() {
  const { notifications } = useUserNotifications();
  const unread = notifications?.filter((n) => n.unread).length ?? 0;
  useAppBadge(unread);

  return (
    <>
      <UpdateBanner />
      <OfflineIndicator />
      <PWAInstallBanner />
    </>
  );
}
