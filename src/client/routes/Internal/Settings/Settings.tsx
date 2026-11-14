import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Tab, Tabs } from "@mui/material";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import { useTitle } from "../../../hooks/useTitle";
import AccountTab from "./AccountTab";
import AppearanceTab from "./AppearanceTab";
import NotificationsTab from "./NotificationsTab";
import SecurityTab from "./SecurityTab";

/**
 * Settings: the account, how the app looks, and what it tells you about. One URL per section
 * ("/internal/settings/notifications"), so a section can be linked to, bookmarked and reached with Back.
 */
export const SETTINGS_TABS = [
  { key: "account", label: "Account" },
  { key: "appearance", label: "Appearance" },
  { key: "notifications", label: "Notifications" },
  { key: "security", label: "Security" },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]["key"];
const isTab = (value: string | undefined): value is SettingsTab =>
  SETTINGS_TABS.some((t) => t.key === (value as SettingsTab));

export default function Settings() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const current: SettingsTab = isTab(tab) ? tab : "account";
  useTitle(`Settings · ${SETTINGS_TABS.find((t) => t.key === current)!.label}`);

  // An address for a section that doesn't exist settles on Account rather than showing nothing.
  useEffect(() => {
    if (tab !== current) navigate(`/internal/settings/${current}`, { replace: true });
  }, [tab, current, navigate]);

  return (
    <PageContainer width="narrow">
      <PageHeader title="Settings" subtitle="Your account, how it looks, and what it tells you about." />
      <Tabs
        value={current}
        onChange={(_e, value: SettingsTab) => navigate(`/internal/settings/${value}`)}
        variant="scrollable"
        scrollButtons={false}
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {SETTINGS_TABS.map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>

      {current === "account" && <AccountTab />}
      {current === "appearance" && <AppearanceTab />}
      {current === "notifications" && <NotificationsTab />}
      {current === "security" && <SecurityTab />}
    </PageContainer>
  );
}
