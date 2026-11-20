import { Alert, Button, Stack } from "@mui/material";
import type { HubSection } from "@shared/xenstart";
import ListSkeleton from "../../../components/ui/ListSkeleton";
import { useAttention } from "../../../hooks/feed/useFeed";
import { useUserProfile } from "../../../hooks/user/useUserProfile";
import { resolvePinnedApps } from "../../../constants/apps";
import ActivityFeed from "../Home/components/ActivityFeed";
import AttentionStrip from "../Home/components/AttentionStrip";
import QuickPanel from "../Home/components/QuickPanel";

function PinnedApps({ counts, totals }: { counts: Record<string, number>; totals?: Record<string, number> }) {
  const { profile, isLoading, isError, refetch } = useUserProfile();
  if (isLoading) return <ListSkeleton rows={1} columns={{ xs: 3, md: 6 }} />;
  if (isError || !profile) return <SectionError name="pinned apps" retry={refetch} />;
  return <QuickPanel pinnedApps={resolvePinnedApps(profile.pinnedApps)} counts={counts} totals={totals} readOnly />;
}

function SectionError({ name, retry }: { name: string; retry: () => void }) {
  return (
    <Alert severity="error" action={<Button onClick={retry}>Retry</Button>}>
      Couldn't load {name}.
    </Alert>
  );
}

function AttentionAndPins({ pins, cards }: { pins: boolean; cards: boolean }) {
  const attention = useAttention();
  return (
    <>
      {pins && <PinnedApps counts={attention.data?.counts ?? {}} totals={attention.data?.totals} />}
      {cards && attention.isLoading && <ListSkeleton rows={1} />}
      {cards && attention.isError && (
        <SectionError name="what needs attention" retry={() => void attention.refetch()} />
      )}
      {cards && attention.data && <AttentionStrip cards={attention.data.cards} />}
    </>
  );
}

export default function HubSections({ sections }: { sections: HubSection[] }) {
  if (!sections.length) return null;
  const pins = sections.includes("pinned");
  const cards = sections.includes("attention");
  return (
    <Stack spacing={3} sx={{ mt: 4 }}>
      {(pins || cards) && <AttentionAndPins pins={pins} cards={cards} />}
      {sections.includes("activity") && <ActivityFeed showTips={false} />}
    </Stack>
  );
}
