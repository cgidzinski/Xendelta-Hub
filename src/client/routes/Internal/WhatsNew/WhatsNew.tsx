import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Typography } from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { BRAND_NAME } from "@shared/brand";
import type { GuideApp } from "@shared/appGuide";
import { CHANGELOG } from "@shared/changelog";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import { APPS_REGISTRY } from "../../../constants/apps";
import { useTitle } from "../../../hooks/useTitle";
import { useWhatsNew } from "../../../hooks/useWhatsNew";
import { changesByApp } from "./changesByApp";
import { entryKey, newKeys } from "./seen";

const HUB = { label: BRAND_NAME, description: "Home, sharing from your phone, and everything that isn't one app." };

const about = (app: GuideApp) => {
  if (app === "hub") return { ...HUB, path: null as string | null };
  const found = APPS_REGISTRY.find((a) => a.key === app);
  return { label: found?.label ?? app, description: found?.description ?? "", path: found?.path ?? null };
};

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * The apps, each with a button that shows just that app's changes. Nothing is one long list: you open the app you care about.
 * An app with changes you haven't seen says how many are new. Linked from Home.
 */
export default function WhatsNew() {
  useTitle("What's new");
  const navigate = useNavigate();
  const { seen, markSeen } = useWhatsNew();
  const [open, setOpen] = useState<ReadonlySet<GuideApp>>(new Set());

  // "New" is worked out from what was seen before this visit; opening the page then marks everything seen.
  const seenAtArrival = useRef(seen);
  const fresh = useMemo(() => newKeys(CHANGELOG, seenAtArrival.current), []);
  useEffect(() => markSeen(), [markSeen]);

  const toggle = (app: GuideApp) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(app)) next.add(app);
      return next;
    });

  return (
    <PageContainer width="narrow">
      <PageHeader title="What's new" />
      <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
        {changesByApp(CHANGELOG).map(({ app, entries }, i) => {
          const { label, description, path } = about(app);
          const isOpen = open.has(app);
          const newCount = entries.filter((e) => fresh.has(entryKey(e))).length;
          return (
            <Box component="li" key={app} sx={{ borderTop: i === 0 ? 0 : 1, borderColor: "divider", py: 1.5 }}>
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 600 }}>
                    {path ? (
                      <Box
                        component="a"
                        href={path}
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate(path);
                        }}
                        sx={{ color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                      >
                        {label}
                      </Box>
                    ) : (
                      label
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {description}
                  </Typography>
                </Box>
                {entries.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0, pt: 0.5 }}>
                    No changes yet
                  </Typography>
                ) : (
                  <Button
                    size="small"
                    aria-expanded={isOpen}
                    onClick={() => toggle(app)}
                    endIcon={isOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    sx={{ flexShrink: 0 }}
                  >
                    {isOpen ? "Hide changes" : `Changes (${entries.length})`}
                    {!isOpen && newCount > 0 && (
                      <Box component="span" sx={{ ml: 0.75, fontWeight: 700 }}>
                        · {newCount} new
                      </Box>
                    )}
                  </Button>
                )}
              </Box>
              {isOpen && (
                <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.75 }}>
                  {entries.map((e) => (
                    <Typography key={entryKey(e)} component="li" variant="body2">
                      {fresh.has(entryKey(e)) && (
                        <Box component="span" sx={{ color: "primary.main", fontWeight: 700, mr: 0.75 }}>
                          NEW
                        </Box>
                      )}
                      {e.title}
                      <Typography component="span" variant="caption" color="text.secondary">
                        {" "}
                        {dayLabel(e.date)}
                      </Typography>
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </PageContainer>
  );
}
