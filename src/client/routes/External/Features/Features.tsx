import { Box, Button, Card, Container, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { APP_GUIDE, type GuideApp } from "@shared/appGuide";
import LandingHeader from "../../../components/LandingHeader";
import { cardSx } from "../../../components/ui/surfaceStyles";
import { useTitle } from "../../../hooks/useTitle";
import { showcaseApps } from "../components/AppShowcase";
import PublicFooter from "../components/PublicFooter";

/** What each app is for and everything it can do. Everything comes from the app list and the app guide. */
export default function Features() {
  useTitle("Features");
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "background.default" }}>
      <LandingHeader />
      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 8 }, flex: 1 }}>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 700, mb: 1.5, fontSize: { xs: "2rem", md: "3rem" } }}>
          What each app does
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 620, mb: 5 }}>
          Here is what each app is for, and what you can do in it.
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 6 }}>
          {showcaseApps().map((app) => {
            const guide = APP_GUIDE[app.key as GuideApp];
            return (
              <Card
                key={app.key}
                variant="outlined"
                sx={{
                  ...cardSx,
                  p: 3,
                  display: "grid",
                  gap: 3,
                  gridTemplateColumns: { xs: "1fr", md: "minmax(0, 5fr) minmax(0, 7fr)" },
                }}
              >
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                    <Box sx={{ color: "primary.main", display: "flex" }}>
                      <app.icon />
                    </Box>
                    <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
                      {app.label}
                    </Typography>
                  </Box>
                  <Typography color="text.secondary">{guide.about}</Typography>
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary">
                    Features
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.75 }}>
                    {guide.features.map((feature) => (
                      <Typography key={feature} component="li" variant="body2">
                        {feature}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              </Card>
            );
          })}
        </Box>

        <Box sx={{ textAlign: "center" }}>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 700, mb: 2 }}>
            Want to try it?
          </Typography>
          <Button variant="contained" size="large" onClick={() => navigate("/signup")}>
            Create an account
          </Button>
        </Box>
      </Container>
      <PublicFooter />
    </Box>
  );
}
