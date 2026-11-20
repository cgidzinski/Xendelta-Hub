import { useContext } from "react";
import { Alert, Button } from "@mui/material";
import type { HubSection } from "@shared/xenstart";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { AttentionContext } from "./HubWidgetProvider";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { resolvePinnedApps } from "../../../constants/apps";
import ActivityFeed from "../Home/components/ActivityFeed";
import AttentionStrip from "../Home/components/AttentionStrip";
import QuickPanel from "../Home/components/QuickPanel";

function SectionError({ name, retry }: { name: string; retry: () => void }) {
  return (
    <Alert severity="error" action={<Button onClick={retry}>Retry</Button>}>
      Couldn't load {name}.
    </Alert>
  );
}

function PinnedApps({ compact }: { compact: boolean }) {
  const attention = useContext(AttentionContext);
  const { profile, isLoading, isError, refetch } = useUserProfile();
  if (isLoading) return <ListSkeleton rows={1} columns={compact ? 2 : { xs: 3, md: 6 }} />;
  if (isError || !profile) return <SectionError name="pinned apps" retry={refetch} />;
  return (
    <QuickPanel
      pinnedApps={resolvePinnedApps(profile.pinnedApps)}
      counts={attention?.data?.counts ?? {}}
      totals={attention?.data?.totals}
      compact={compact}
      readOnly
    />
  );
}

function Attention() {
  const attention = useContext(AttentionContext);
  if (attention?.isLoading) return <ListSkeleton rows={1} />;
  if (attention?.isError) return <SectionError name="what needs attention" retry={() => void attention.refetch()} />;
  return attention?.data ? <AttentionStrip cards={attention.data.cards} /> : null;
}

export default function HubWidget({ widget, compact }: { widget: HubSection; compact: boolean }) {
  if (widget === "pinned") return <PinnedApps compact={compact} />;
  if (widget === "attention") return <Attention />;
  return <ActivityFeed showTips={false} />;
}
