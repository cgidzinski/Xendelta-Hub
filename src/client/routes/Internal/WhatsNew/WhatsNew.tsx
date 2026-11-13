import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, ButtonBase, Card, Chip, Stack, Tooltip, Typography } from "@mui/material";
import HubIcon from "@mui/icons-material/Hub";
import { GUIDE_APPS, type GuideApp } from "@shared/appGuide";
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
      <Card variant="outlined" sx={{ ...cardSx, mb: 3 }}>
        {apps.map((app, i) => (
          <ButtonBase
            key={app.key}
            onClick={() => navigate(app.path)}
            sx={{
              width: "100%",
              display: "flex",
              justifyContent: "flex-start",
              textAlign: "left",
              gap: 1.5,
              px: 1.75,
              py: 1.1,
              borderTop: i === 0 ? 0 : 1,
              borderColor: "divider",
            }}
          >
            <Box sx={{ color: "primary.main", display: "flex" }}>
              <app.icon fontSize="small" />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 600, width: 96, flexShrink: 0 }}>
              {app.label}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
              {app.description}
            </Typography>
          </ButtonBase>
        ))}
      </Card>

      <SectionLabel>Changes</SectionLabel>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", mb: 2 }}>
        <Chip
          size="small"
          label="All"
          color={filter === "all" ? "primary" : "default"}
          onClick={() => setFilter("all")}
        />
        {inChangelog.map((a) => (
          <Chip
            size="small"
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
          <Box key={month} sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: "block", mb: 0.75 }}>
              {month}
            </Typography>
            <Card variant="outlined" sx={cardSx}>
              {entries.map((e, i) => {
                const { label, Icon } = appInfo(e.app);
                return (
                  <Box
                    key={entryKey(e)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 1.75,
                      py: 1,
                      borderTop: i === 0 ? 0 : 1,
                      borderColor: "divider",
                    }}
                  >
                    <Tooltip title={label}>
                      <Box sx={{ color: "text.secondary", display: "flex" }}>
                        <Icon fontSize="small" />
                      </Box>
                    </Tooltip>
                    <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                      {e.title}
                    </Typography>
                    {fresh.has(entryKey(e)) && <Chip size="small" color="primary" label="New" sx={{ height: 20 }} />}
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {dayLabel(e.date)}
                    </Typography>
                  </Box>
                );
              })}
            </Card>
          </Box>
        ))
      )}
    </PageContainer>
  );
}
