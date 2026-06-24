import { useNavigate } from "react-router-dom";
import {
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Box,
  Avatar,
  AvatarGroup,
  Chip,
} from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import type { XenSplit } from "../../../hooks/xensplit/types";

const ACCENT_COLORS = [
  "#2196f3", "#9c27b0", "#e91e63", "#ff5722",
  "#4caf50", "#ff9800", "#00bcd4", "#7c4dff",
];

function groupAccentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  }
  return ACCENT_COLORS[hash % ACCENT_COLORS.length];
}

function getUserNetBalance(group: XenSplit, userId: string): { [currency: string]: number } {
  const balances: { [currency: string]: number } = {};
  for (const expense of group.expenses ?? []) {
    const { paid_by, amount, currency, splits } = expense;
    if (!balances[currency]) balances[currency] = 0;
    if (paid_by === userId) balances[currency] += amount;
    const mySplit = splits.find((s) => s.user_id === userId);
    if (mySplit) {
      let owed = 0;
      if (mySplit.amount_owed !== undefined) {
        owed = mySplit.amount_owed;
      } else if (mySplit.percentage !== undefined) {
        owed = (amount * mySplit.percentage) / 100;
      } else {
        owed = amount / splits.length;
      }
      balances[currency] -= owed;
    }
  }
  for (const s of group.settlements ?? []) {
    if (!balances[s.currency]) balances[s.currency] = 0;
    if (s.from === userId) balances[s.currency] += s.amount;
    if (s.to === userId) balances[s.currency] -= s.amount;
  }
  return balances;
}

interface GroupCardProps {
  group: XenSplit;
  userId: string;
}

export function GroupCard({ group, userId }: GroupCardProps) {
  const navigate = useNavigate();
  const accentColor = groupAccentColor(group.name);

  const netBalances = getUserNetBalance(group, userId);
  const nonZeroEntries = Object.entries(netBalances).filter(([, v]) => v !== 0);
  const isSettledUp = nonZeroEntries.length === 0;

  const formatBalance = (currency: string, amount: number) => {
    const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(amount));
    return amount > 0
      ? <Typography key={currency} variant="caption" sx={{ fontWeight: 700, color: "success.main", whiteSpace: "nowrap" }}>Owed {formatted}</Typography>
      : <Typography key={currency} variant="caption" sx={{ fontWeight: 700, color: "error.main", whiteSpace: "nowrap" }}>Owes {formatted}</Typography>;
  };

  const displayedEntries = nonZeroEntries.slice(0, 2);
  const extraCount = nonZeroEntries.length - displayedEntries.length;

  return (
    <Card
      elevation={0}
      sx={{
        width: "100%",
        border: 1,
        borderColor: "divider",
        transition: "border-color 0.15s, box-shadow 0.15s",
        "&:hover": {
          borderColor: accentColor,
          boxShadow: `0 0 0 1px ${accentColor}40`,
        },
      }}
    >
      <CardActionArea
        onClick={() => navigate(`/internal/xensplit/groups/${group._id}`)}
      >
        <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "48px 1fr minmax(96px, auto)", alignItems: "center", columnGap: 2 }}>
            {/* Colored group initial */}
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: accentColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Typography sx={{ color: "#fff", fontWeight: 800, fontSize: "1.2rem", lineHeight: 1 }}>
                {group.name[0]?.toUpperCase() ?? "?"}
              </Typography>
            </Box>

            {/* Name + members */}
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, lineHeight: 1.25, mb: 0.5 }}
                noWrap
              >
                {group.name}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <AvatarGroup
                    max={4}
                    sx={{ "& .MuiAvatar-root": { width: 24, height: 24, fontSize: 10, border: "1.5px solid", borderColor: "background.paper" } }}
                  >
                    {group.members.map((member) => (
                      <Avatar
                        key={member.user_id}
                        src={member.avatar || undefined}
                        sx={{}}
                      >
                        {member.username[0]?.toUpperCase()}
                      </Avatar>
                    ))}
                  </AvatarGroup>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                  {group.expenses?.length || 0} expenses
                </Typography>
              </Box>
            </Box>

            {/* Right side */}
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
              {isSettledUp && (group.expenses?.length ?? 0) > 0 ? (
                <Chip
                  label="Settled up"
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontSize: "0.65rem", height: 20 }}
                />
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.25 }}>
                  {displayedEntries.map(([currency, amount]) => formatBalance(currency, amount))}
                  {extraCount > 0 && (
                    <Chip label={`+${extraCount} more`} size="small" sx={{ fontSize: "0.6rem", height: 18 }} />
                  )}
                </Box>
              )}
              <ChevronRightIcon sx={{ color: "text.disabled", fontSize: 20 }} />
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default GroupCard;
