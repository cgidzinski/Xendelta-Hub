import { Box, Button, Typography } from "@mui/material";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";
import { useNavigate } from "react-router-dom";

/** Two quiet links at the bottom of Home: about the apps and sending feedback. */
export default function HomeLinks() {
  const navigate = useNavigate();
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center", pt: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ width: "100%", textAlign: "center" }}>
        Report a bug or suggest an idea. Earn gems when it's fixed or built.
      </Typography>
      <Button
        color="inherit"
        size="small"
        startIcon={<CampaignOutlinedIcon />}
        onClick={() => navigate("/internal/about")}
        sx={{ color: "text.secondary" }}
      >
        About the apps
      </Button>
      <Button
        color="inherit"
        size="small"
        startIcon={<FeedbackOutlinedIcon />}
        onClick={() => navigate("/internal/feedback")}
        sx={{ color: "text.secondary" }}
      >
        Send feedback
      </Button>
    </Box>
  );
}
