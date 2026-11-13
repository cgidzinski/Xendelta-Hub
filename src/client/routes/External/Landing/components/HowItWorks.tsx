import { Box, Card, Container, Typography } from "@mui/material";
import { cardSx } from "../../../../components/ui/surfaceStyles";

const STEPS = [
  { title: "Make an account", text: "An email and a password, or sign in with Google, GitHub or Discord." },
  { title: "Pin the apps you use", text: "They show up on Home with a count of what needs attention." },
  {
    title: "Share with your people",
    text: "Invite someone to a group, a notebook or a book. Everyone sees the same thing.",
  },
];

export default function HowItWorks() {
  return (
    <Box sx={{ py: { xs: 6, md: 8 }, borderTop: 1, borderColor: "divider" }}>
      <Container maxWidth="lg">
        <Typography variant="h4" component="h2" sx={{ fontWeight: 700, mb: 3 }}>
          How it works
        </Typography>
        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" } }}>
          {STEPS.map((step, i) => (
            <Card key={step.title} variant="outlined" sx={{ ...cardSx, p: 3 }}>
              <Typography variant="body2" color="primary" sx={{ fontWeight: 700, mb: 0.5 }}>
                {i + 1}
              </Typography>
              <Typography sx={{ fontWeight: 600, mb: 0.5 }}>{step.title}</Typography>
              <Typography variant="body2" color="text.secondary">
                {step.text}
              </Typography>
            </Card>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
