import { useNavigate } from "react-router-dom";
import { Avatar, Box, Button, Divider, Typography } from "@mui/material";
import GemAmount from "../../../../components/GemAmount";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import type { UserProfile } from "../../../../hooks/user/useUserProfile";
import BillingSummary from "../../../../components/billing/BillingSummary";
import UserName from "../../../../components/user/UserName";

interface AccountCardProps {
  profile: UserProfile | undefined;
}

/** Who you are, what you can spend, and what you've stored: the context for the items beside it. */
export default function AccountCard({ profile }: AccountCardProps) {
  const navigate = useNavigate();

  const used = profile?.xendrive?.spaceUsed ?? 0;

  return (
    <Box sx={{ ...cardSx }}>
      <Box sx={{ p: 2.5, display: "flex", alignItems: "center", gap: 2 }}>
        <Avatar src={profile?.avatar} alt={profile?.username} sx={{ width: 64, height: 64 }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
            <UserName user={profile} />
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {profile?.email}
          </Typography>
        </Box>
      </Box>

      <Divider />
      <Box sx={{ p: 2.5 }}>
        <SectionLabel>Gems</SectionLabel>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
          <GemAmount amount={profile?.gems ?? 0} variant="h4" iconSize={32} />
          <Button variant="contained" onClick={() => navigate("/internal/shop")}>
            Get gems
          </Button>
        </Box>
        <Button size="small" sx={{ mt: 1, ml: -1 }} onClick={() => navigate("/internal/billing")}>
          See what you've used this month
        </Button>
      </Box>

      <Divider />
      <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
        <SectionLabel sx={{ mb: 0 }}>Storage</SectionLabel>
        <BillingSummary stored={{ fileCount: profile?.xendrive?.fileCount ?? 0, spaceUsed: used }} />
      </Box>
    </Box>
  );
}
