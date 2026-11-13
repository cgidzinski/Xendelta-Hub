import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Box, Button, Tab, Tabs, Typography } from "@mui/material";
import { APP_GUIDE, GUIDE_APPS, type GuideApp } from "@shared/appGuide";
import { BRAND_NAME } from "@shared/brand";
import PageContainer from "../../../components/ui/PageContainer";
import PageHeader from "../../../components/ui/PageHeader";
import SectionLabel from "../../../components/ui/SectionLabel";
import { APPS_REGISTRY } from "../../../constants/apps";
import { useTitle } from "../../../hooks/useTitle";

const isGuideApp = (v: string | null): v is GuideApp => !!v && (GUIDE_APPS as readonly string[]).includes(v);

const about = (app: GuideApp) => {
  if (app === "hub") return { label: BRAND_NAME, path: null as string | null };
  const found = APPS_REGISTRY.find((a) => a.key === app);
  return { label: found?.label ?? app, path: found?.path ?? null };
};

/**
 * About each app. Pick an app at the top to see what it is for and everything it can do. The features are written for the
 * people who use the app (src/shared/appGuide.ts). Linked from Home.
 */
export default function About() {
  useTitle("About the apps");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const selected: GuideApp = isGuideApp(params.get("app")) ? (params.get("app") as GuideApp) : "hub";
  const { label, path } = about(selected);
  const guide = APP_GUIDE[selected];

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
        {GUIDE_APPS.map((app) => (
          <Tab key={app} value={app} label={about(app).label} sx={{ textTransform: "none", minWidth: 0 }} />
        ))}
      </Tabs>

      <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
        {label}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {guide.about}
      </Typography>
      {path && (
        <Button variant="outlined" size="small" onClick={() => navigate(path)} sx={{ mb: 3 }}>
          Open {label}
        </Button>
      )}

      <SectionLabel>Features</SectionLabel>
      <Box component="ul" sx={{ m: 0, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.75 }}>
        {guide.features.map((feature) => (
          <Typography key={feature} component="li" variant="body2">
            {feature}
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
