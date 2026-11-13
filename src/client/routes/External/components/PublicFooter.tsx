import { Box, Button, Container, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { BRAND_NAME } from "@shared/brand";

const LINKS = [
  { label: "Features", to: "/features" },
  { label: "Blog", to: "/blog" },
  { label: "Sign in", to: "/login" },
  { label: "Sign up", to: "/signup" },
];

/** The bottom of every public page: the name and the links a visitor might want next. */
export default function PublicFooter() {
  const navigate = useNavigate();
  return (
    <Box component="footer" sx={{ borderTop: 1, borderColor: "divider", mt: "auto", py: 3 }}>
      <Container
        maxWidth="lg"
        sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}
      >
        <Typography variant="body2" color="text.secondary">
          © {new Date().getFullYear()} {BRAND_NAME}
        </Typography>
        <Box component="nav" sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {LINKS.map((l) => (
            <Button
              key={l.to}
              size="small"
              color="inherit"
              onClick={() => navigate(l.to)}
              sx={{ color: "text.secondary" }}
            >
              {l.label}
            </Button>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
