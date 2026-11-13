import { Box, Button, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { BRAND_NAME } from "@shared/brand";

const NAV = [
  { label: "Features", to: "/features" },
  { label: "Blog", to: "/blog" },
];

/** The top of every public page: the name, two links, and the ways in. Wraps instead of squeezing on a phone. */
export default function LandingHeader() {
  const navigate = useNavigate();

  return (
    <Box
      component="header"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          maxWidth: 1200,
          mx: "auto",
          px: { xs: 2, md: 4 },
          py: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          columnGap: 2,
          rowGap: 0.5,
        }}
      >
        <Typography
          component="div"
          variant="h6"
          onClick={() => navigate("/")}
          sx={{ fontWeight: 700, cursor: "pointer", letterSpacing: "-0.01em" }}
        >
          {BRAND_NAME}
        </Typography>
        <Box component="nav" sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
          {NAV.map((l) => (
            <Button
              key={l.to}
              color="inherit"
              size="small"
              onClick={() => navigate(l.to)}
              sx={{ color: "text.secondary" }}
            >
              {l.label}
            </Button>
          ))}
          <Button color="inherit" size="small" onClick={() => navigate("/login")} sx={{ color: "text.secondary" }}>
            Sign in
          </Button>
          <Button variant="contained" size="small" onClick={() => navigate("/signup")} sx={{ ml: 0.5 }}>
            Sign up
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
