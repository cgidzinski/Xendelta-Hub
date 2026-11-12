import { Fragment, useRef } from "react";
import { Avatar, Box, Button, Card, Chip, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activityLink, activityText, type FeedEntry } from "@shared/activity";
import { APPS_REGISTRY } from "../../../../constants/apps";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import EmptyState from "../../../../components/ui/EmptyState";
import ListSkeleton from "../../../../components/ui/ListSkeleton";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { useFeed, useFeedPrefs, useNewFeedCount } from "../../../../hooks/feed/useFeed";

const appLabel = (key: string) => APPS_REGISTRY.find((a) => a.key === key)?.label ?? key;

/** Text with **bold** parts, as the activity registry writes it. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split("**").map((part, i) =>
        i % 2 ? (
          <Box key={i} component="strong" sx={{ fontWeight: 600 }}>
            {part}
          </Box>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function EntryRow({ entry }: { entry: FeedEntry }) {
  const navigate = useNavigate();
  const { prefs, savePrefs, hide } = useFeedPrefs();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const spaceKey = entry.space ? `${entry.space.app}:${entry.space.id}` : null;

  const mute = (next: { app?: boolean; space?: boolean }) => {
    close();
    if (!prefs) return;
    void savePrefs({
      mutedApps: next.app ? [...prefs.mutedApps, entry.app] : prefs.mutedApps,
      mutedSpaces: next.space && spaceKey ? [...prefs.mutedSpaces, spaceKey] : prefs.mutedSpaces,
    });
  };

  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.5,
        p: 1.5,
        alignItems: "flex-start",
        borderTop: "1px solid",
        borderColor: "divider",
        "&:first-of-type": { borderTop: 0 },
      }}
    >
      <Avatar src={entry.actor?.avatar ?? undefined} alt={entry.actor?.username} sx={{ width: 36, height: 36 }}>
        {entry.actor?.username?.charAt(0).toUpperCase()}
      </Avatar>
      <Box
        component="button"
        type="button"
        onClick={() => navigate(activityLink(entry))}
        sx={{
          all: "unset",
          cursor: "pointer",
          flex: 1,
          minWidth: 0,
          borderRadius: 1,
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
        }}
      >
        <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
          <RichText text={activityText(entry)} />
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {appLabel(entry.app)} · {timeLabel(entry.createdAt)}
        </Typography>
      </Box>
      <IconButton size="small" aria-label="More options" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreHorizIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={close}>
        <MenuItem
          onClick={() => {
            close();
            void hide(entry.ids);
          }}
        >
          Hide this
        </MenuItem>
        <MenuItem onClick={() => mute({ app: true })}>Mute {appLabel(entry.app)}</MenuItem>
        {entry.space?.label && <MenuItem onClick={() => mute({ space: true })}>Mute {entry.space.label}</MenuItem>}
      </Menu>
    </Box>
  );
}

/** What happened in the person's shared spaces, grouped by day, with a filter per app and a "N new" pill. */
export default function ActivityFeed() {
  const [app, setApp] = useState<string | undefined>();
  const feed = useFeed(app);
  const { count, reset } = useNewFeedCount();
  const { prefs, savePrefs } = useFeedPrefs();
  // The filter chips list every app seen so far, so choosing one does not make the others disappear.
  const seenApps = useRef(new Set<string>());

  const entries = feed.data?.pages.flatMap((p) => p.entries) ?? [];
  if (!app) entries.forEach((e) => seenApps.current.add(e.app));

  const muted = (prefs?.mutedApps.length ?? 0) + (prefs?.mutedSpaces.length ?? 0);
  const showNew = () => {
    reset();
    void feed.refetch();
  };

  const byDay: { day: string; items: FeedEntry[] }[] = [];
  for (const e of entries) {
    const day = dayLabel(e.createdAt);
    const last = byDay[byDay.length - 1];
    if (last?.day === day) last.items.push(e);
    else byDay.push({ day, items: [e] });
  }

  return (
    <Box component="section" aria-label="Activity">
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
        <SectionLabel sx={{ mb: 0 }}>Activity</SectionLabel>
        {muted > 0 && prefs && (
          <Button size="small" onClick={() => void savePrefs({ mutedApps: [], mutedSpaces: [] })}>
            Unmute all ({muted})
          </Button>
        )}
      </Box>

      {seenApps.current.size > 1 && (
        <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto", pb: 1 }}>
          <Chip
            label="All"
            color={app ? "default" : "primary"}
            variant={app ? "outlined" : "filled"}
            onClick={() => setApp(undefined)}
          />
          {[...seenApps.current].map((key) => (
            <Chip
              key={key}
              label={appLabel(key)}
              color={app === key ? "primary" : "default"}
              variant={app === key ? "filled" : "outlined"}
              onClick={() => setApp(key)}
            />
          ))}
        </Box>
      )}

      {count > 0 && (
        <Box sx={{ position: "sticky", top: 8, zIndex: 2, display: "flex", justifyContent: "center", height: 0 }}>
          <Button variant="contained" size="small" onClick={showNew} sx={{ borderRadius: 999, height: 32 }}>
            {count} new
          </Button>
        </Box>
      )}

      {feed.isLoading ? (
        <ListSkeleton rows={4} height={64} />
      ) : feed.isError ? (
        <EmptyState
          title="Couldn't load activity"
          description="Check your connection and try again."
          action={<Button onClick={() => void feed.refetch()}>Retry</Button>}
        />
      ) : byDay.length === 0 ? (
        <Card variant="outlined" sx={cardSx}>
          <EmptyState
            title={app ? "Nothing here" : "Nothing new"}
            description={
              app
                ? "No activity from this app yet."
                : "When people in your shared spaces add expenses, notes and more, it shows up here."
            }
            sx={{ py: 4 }}
          />
        </Card>
      ) : (
        <>
          {byDay.map(({ day, items }) => (
            <Box key={day} sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: "block", mb: 0.75 }}>
                {day}
              </Typography>
              <Card variant="outlined" sx={cardSx}>
                {items.map((e) => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              </Card>
            </Box>
          ))}
          {feed.hasNextPage && (
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <Button onClick={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
                {feed.isFetchingNextPage ? "Loading..." : "Show older"}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
