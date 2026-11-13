import { useEffect, useMemo, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { GUIDE_APPS, type GuideApp } from "@shared/appGuide";
import { CHANGELOG } from "@shared/changelog";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import SectionLabel from "../../../components/ui/SectionLabel";
import { APPS_REGISTRY } from "../../../constants/apps";
import { useTitle } from "../../../hooks/useTitle";
import { useWhatsNew } from "../../../hooks/useWhatsNew";
import { entryKey, newKeys } from "./seen";

const appLabel = (key: GuideApp) =>
  key === "hub" ? "The hub" : (APPS_REGISTRY.find((a) => a.key === key)?.label ?? key);

const monthLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });

// Plain bullet points: no cards, icons or chips.
const listSx = { m: 0, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.75 } as const;

/** What has changed, newest first, then what each app is for. Both are plain point-form lists. Linked from Home. */
export default function WhatsNew() {
  useTitle("What's new");
  const { seen, markSeen } = useWhatsNew();

  // The "NEW" marks are worked out from what was seen before this visit; opening the page then marks them seen.
  const seenAtArrival = useRef(seen);
  const fresh = useMemo(() => newKeys(CHANGELOG, seenAtArrival.current), []);
  useEffect(() => markSeen(), [markSeen]);

  const months = CHANGELOG.reduce<Array<{ month: string; entries: typeof CHANGELOG }>>((out, e) => {
    const month = monthLabel(e.date);
    const last = out[out.length - 1];
    if (last?.month === month) last.entries.push(e);
    else out.push({ month, entries: [e] });
    return out;
  }, []);

  const apps = APPS_REGISTRY.filter((a) => GUIDE_APPS.includes(a.key as GuideApp));

  return (
    <PageContainer width="narrow">
      <PageHeader title="What's new" />

      {months.map(({ month, entries }) => (
        <Box key={month} sx={{ mb: 3 }}>
          <SectionLabel>{month}</SectionLabel>
          <Box component="ul" sx={listSx}>
            {entries.map((e) => (
              <Typography key={entryKey(e)} component="li" variant="body2">
                {fresh.has(entryKey(e)) && (
                  <Box component="span" sx={{ color: "primary.main", fontWeight: 700, mr: 0.75 }}>
                    NEW
                  </Box>
                )}
                {e.title}
                <Typography component="span" variant="body2" color="text.secondary">
                  {" "}
                  ({appLabel(e.app)})
                </Typography>
              </Typography>
            ))}
          </Box>
        </Box>
      ))}

      <SectionLabel>The apps</SectionLabel>
      <Box component="ul" sx={listSx}>
        {apps.map((app) => (
          <Typography key={app.key} component="li" variant="body2">
            <Box component="span" sx={{ fontWeight: 600 }}>
              {app.label}
            </Box>
            <Typography component="span" variant="body2" color="text.secondary">
              {" "}
              {app.description}
            </Typography>
          </Typography>
        ))}
      </Box>
    </PageContainer>
  );
}
