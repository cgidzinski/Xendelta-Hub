import { Box, Card, Container, Typography } from "@mui/material";
import { cardSx } from "../../../../components/ui/surfaceStyles";

/** In place of the fake statistics a landing page usually has. */
export default function HonestAside() {
  return (
    <Box sx={{ py: { xs: 6, md: 8 }, borderTop: 1, borderColor: "divider" }}>
      <Container
        maxWidth="lg"
        sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}
      >
        <Card variant="outlined" sx={{ ...cardSx, p: 3 }}>
          <Typography variant="overline" color="text.secondary">
            Things we won't say
          </Typography>
          <Typography color="text.secondary" sx={{ lineHeight: 1.9, textDecoration: "line-through" }}>
            10,000+ happy users
            <br />
            Military-grade encryption
            <br />
            Revolutionize your workflow
          </Typography>
        </Card>
        <Card variant="outlined" sx={{ ...cardSx, p: 3, borderColor: "primary.main" }}>
          <Typography variant="overline" color="primary">
            What we will say
          </Typography>
          <Typography sx={{ lineHeight: 1.7 }}>
            It works. And when it doesn't, there is a Send feedback button on Home.
          </Typography>
        </Card>
      </Container>
    </Box>
  );
}
