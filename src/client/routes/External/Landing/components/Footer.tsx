import { Box, Container, Typography } from "@mui/material";

export default function Footer() {
  return (
    <Box
      sx={{
        borderTop: "1px solid",
        borderColor: "divider",
        py: 4,
        mt: "auto",
        position: "relative",
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            © {new Date().getFullYear()} Xendelta Hub. All rights reserved.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

