import { Box, Button, Chip } from "@mui/material";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";
import { useNavigate } from "react-router-dom";
import { useWhatsNew } from "../../../../hooks/useWhatsNew";

/** Two quiet links at the bottom of Home: what's new (with a tag when there is something unseen) and sending feedback. */
export default function HomeLinks() {
  const navigate = useNavigate();
  const { unseen } = useWhatsNew();
  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "center", pt: 1 }}>
      <Button
        color="inherit"
        size="small"
        startIcon={<CampaignOutlinedIcon />}
        onClick={() => navigate("/internal/whats-new")}
        sx={{ color: "text.secondary" }}
      >
        What's new
        {unseen > 0 && <Chip size="small" color="primary" label="New" sx={{ ml: 1, height: 20 }} />}
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
