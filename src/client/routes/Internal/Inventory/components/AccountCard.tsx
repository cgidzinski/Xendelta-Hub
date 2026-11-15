import { useNavigate } from "react-router-dom";
import { Avatar, Box, Button, Divider, Typography } from "@mui/material";
import { FREE_STORAGE_BYTES, STORAGE_VOUCHER_BYTES, STORAGE_VOUCHER_KEY } from "@shared/monetization";
import GemAmount from "../../../../components/GemAmount";
import SectionLabel from "../../../../components/ui/SectionLabel";
import { cardSx } from "../../../../components/ui/surfaceStyles";
import type { InventoryItem } from "../../../../hooks/user/useInventory";
import type { UserProfile } from "../../../../hooks/user/useUserProfile";
import { formatFileSize } from "../../../../utils/fileUtils";
import BillingSummary from "../../../../components/billing/BillingSummary";
import UserName from "../../../../components/user/UserName";

interface AccountCardProps {
  profile: UserProfile | undefined;
  inventory: InventoryItem[];
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography variant="body2" color={color ?? "text.secondary"}>
        {label}
      </Typography>
      <Typography variant="body2" color={color}>
        {value}
      </Typography>
    </Box>
  );
}

/** Who you are, what you can spend, and how much space you have: the context for the items beside it. */
export default function AccountCard({ profile, inventory }: AccountCardProps) {
  const navigate = useNavigate();

  const used = profile?.xendrive?.spaceUsed ?? 0;
  const allowed = profile?.xendrive?.spaceAllowed ?? FREE_STORAGE_BYTES;
  const fromItems = Math.max(0, allowed - FREE_STORAGE_BYTES);
  const waiting =
    inventory.filter((item) => !item.used && item.itemKey === STORAGE_VOUCHER_KEY).length * STORAGE_VOUCHER_BYTES;

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
        <BillingSummary
          stored={{ fileCount: profile?.xendrive?.fileCount ?? 0, spaceUsed: used }}
          limit={{ spaceUsed: used, spaceAllowed: allowed }}
        />
        {fromItems > 0 && <Line label="From items and grants" value={formatFileSize(fromItems)} />}
        {waiting > 0 && <Line label="Waiting to redeem" value={`+${formatFileSize(waiting)}`} color="success.main" />}
      </Box>
    </Box>
  );
}
