import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Card, Chip, Stack, Typography } from "@mui/material";
import HubIcon from "@mui/icons-material/Hub";
import { APP_GUIDE, GUIDE_APPS, type GuideApp } from "@shared/appGuide";
import { CHANGELOG } from "@shared/changelog";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import SectionLabel from "../../../components/ui/SectionLabel";
import EmptyState from "../../../components/ui/EmptyState";
import { cardSx } from "../../../components/ui/surfaceStyles";
import { APPS_REGISTRY } from "../../../constants/apps";
import { useTitle } from "../../../hooks/useTitle";
import { useWhatsNew } from "../../../hooks/useWhatsNew";
import { entryKey, newKeys } from "./seen";

const appInfo = (key: GuideApp) =>
  key === "hub"
    ? { label: "The hub", Icon: HubIcon }
    : {
        label: APPS_REGISTRY.find((a) => a.key === key)?.label ?? key,
        Icon: APPS_REGISTRY.find((a) => a.key === key)?.icon ?? HubIcon,
      };

const monthLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** What each app is for, and what has changed, newest first. Linked from the sidebar. */
export default function WhatsNew() {
  useTitle("What's new");
  const navigate = useNavigate();
  const { seen, markSeen } = useWhatsNew();
  const [filter, setFilter] = useState<GuideApp | "all">("all");

  // The "New" chips are worked out from what was seen before this visit; leaving the page then marks them seen.
  const seenAtArrival = useRef(seen);
  const fresh = useMemo(() => newKeys(CHANGELOG, seenAtArrival.current), []);
  useEffect(() => markSeen(), [markSeen]);

  const apps = APPS_REGISTRY.filter((a) => GUIDE_APPS.includes(a.key as GuideApp));
  const inChangelog = GUIDE_APPS.filter((a) => CHANGELOG.some((e) => e.app === a));
  const shown = CHANGELOG.filter((e) => filter === "all" || e.app === filter);
  const months = shown.reduce<Array<{ month: string; entries: typeof shown }>>((out, e) => {
    const month = monthLabel(e.date);
    const last = out[out.length - 1];
    if (last?.month === month) last.entries.push(e);
    else out.push({ month, entries: [e] });
    return out;
  }, []);

  return (
    <PageContainer width="narrow">
      <PageHeader title="What's new" subtitle="What each app is for, and what has changed." />

      <SectionLabel>The apps</SectionLabel>
      <Stack spacing={1.5} sx={{ mb: 4 }}>
        {apps.map((app) => (
          <Card key={app.key} variant="outlined" sx={{ ...cardSx, p: 2 }}>
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <Box sx={{ color: "primary.main", display: "flex", pt: 0.25 }}>
                <app.icon />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }}>{app.label}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {APP_GUIDE[app.key as GuideApp].about}
                </Typography>
              </Box>
              <Button size="small" onClick={() => navigate(app.path)}>
                Open
              </Button>
            </Stack>
          </Card>
        ))}
      </Stack>

      <SectionLabel>Changes</SectionLabel>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mb: 2 }}>
        <Chip label="All" color={filter === "all" ? "primary" : "default"} onClick={() => setFilter("all")} />
        {inChangelog.map((a) => (
          <Chip
            key={a}
            label={appInfo(a).label}
            color={filter === a ? "primary" : "default"}
            onClick={() => setFilter(a)}
          />
        ))}
      </Stack>

      {months.length === 0 ? (
        <EmptyState title="Nothing here yet" description="No changes for this app so far." />
      ) : (
        months.map(({ month, entries }) => (
          <Box key={month} sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              {month}
            </Typography>
            <Stack spacing={1}>
              {entries.map((e) => {
                const { label, Icon } = appInfo(e.app);
                return (
                  <Card key={entryKey(e)} variant="outlined" sx={{ ...cardSx, p: 1.5 }}>
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <Box sx={{ color: "text.secondary", display: "flex", pt: 0.25 }}>
                        <Icon fontSize="small" />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600 }}>
                          {e.title}
                          {fresh.has(entryKey(e)) && (
                            <Chip size="small" color="primary" label="New" sx={{ ml: 1, height: 20 }} />
                          )}
                        </Typography>
                        {e.detail && (
                          <Typography variant="body2" color="text.secondary">
                            {e.detail}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {label} · {dayLabel(e.date)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        ))
      )}
    </PageContainer>
  );
}
