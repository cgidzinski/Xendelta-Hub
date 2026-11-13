import { useEffect, useMemo, useRef } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Box, Button, Tab, Tabs, Typography } from "@mui/material";
import { APP_GUIDE, GUIDE_APPS, type GuideApp } from "@shared/appGuide";
import { CHANGELOG } from "@shared/changelog";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import SectionLabel from "../../../components/ui/SectionLabel";
import { APPS_REGISTRY } from "../../../constants/apps";
import { useTitle } from "../../../hooks/useTitle";
import { useWhatsNew } from "../../../hooks/useWhatsNew";
import { changesByApp } from "./changesByApp";
import { entryKey, newKeys } from "./seen";

const HUB_DESCRIPTION = "Home, sharing from your phone, and everything that isn't one app.";

const isGuideApp = (v: string | null): v is GuideApp => !!v && (GUIDE_APPS as readonly string[]).includes(v);

const about = (app: GuideApp) => {
  if (app === "hub") return { label: "General", path: null as string | null };
  const found = APPS_REGISTRY.find((a) => a.key === app);
  return { label: found?.label ?? app, path: found?.path ?? null };
};

/**
 * About each app. Pick an app at the top to see what it is for and everything it can do. The features are the changelog:
 * every change that has been made to the app, newest first, so the list grows as the app does. Linked from Home.
 */
export default function About() {
  useTitle("About the apps");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { seen, markSeen } = useWhatsNew();
  const selected: GuideApp = isGuideApp(params.get("app")) ? (params.get("app") as GuideApp) : "hub";

  // "New" is worked out from what was seen before this visit; opening the page then marks everything seen.
  const seenAtArrival = useRef(seen);
  const fresh = useMemo(() => newKeys(CHANGELOG, seenAtArrival.current), []);
  useEffect(() => markSeen(), [markSeen]);

  const groups = changesByApp(CHANGELOG);
  const current = groups.find((g) => g.app === selected)!;
  const { label, path } = about(selected);
  const description = APP_GUIDE[selected].about;

  return (
    <PageContainer width="narrow">
      <PageHeader title="About the apps" />
      <Tabs
        value={selected}
        onChange={(_, app: GuideApp) => setParams({ app }, { replace: true })}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Choose an app"
        sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
      >
        {groups.map(({ app, entries }) => (
          <Tab
            key={app}
            value={app}
            label={
              <Badge variant="dot" color="primary" invisible={!entries.some((e) => fresh.has(entryKey(e)))}>
                {about(app).label}
              </Badge>
            }
            sx={{ textTransform: "none", minWidth: 0 }}
          />
        ))}
      </Tabs>

      <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
        {label}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {description}
      </Typography>
      {selected === "hub" && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {HUB_DESCRIPTION}
        </Typography>
      )}
      {path && (
        <Button variant="outlined" size="small" onClick={() => navigate(path)} sx={{ mb: 3 }}>
          Open {label}
        </Button>
      )}

      <SectionLabel>{current.entries.length > 0 ? "Features" : "Things you can do"}</SectionLabel>
      <Box component="ul" sx={{ m: 0, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.75 }}>
        {current.entries.length > 0
          ? current.entries.map((e) => (
              <Typography key={entryKey(e)} component="li" variant="body2">
                {fresh.has(entryKey(e)) && (
                  <Box component="span" sx={{ color: "primary.main", fontWeight: 700, mr: 0.75 }}>
                    NEW
                  </Box>
                )}
                {e.title}
              </Typography>
            ))
          : APP_GUIDE[selected].tips.map((t) => (
              <Typography key={t.text} component="li" variant="body2">
                {t.text}
              </Typography>
            ))}
      </Box>
    </PageContainer>
  );
}

/** The old address of this page, kept so existing links still work. */
export function WhatsNewRedirect() {
  return <Navigate to="/internal/about" replace />;
}
