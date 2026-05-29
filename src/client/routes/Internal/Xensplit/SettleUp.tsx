import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Container,
  Typography,
  Button,
  IconButton,
  Avatar,
  Card,
  CardContent,
  Chip,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckIcon from "@mui/icons-material/Check";
import { useXenSplitBalances } from "../../../hooks/xensplit/useBalances";
import { useAuth } from "../../../contexts/AuthContext";
import LoadingSpinner from "../../../components/LoadingSpinner";
import ErrorDisplay from "../../../components/ErrorDisplay";

export default function SettleUp() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { balancesData, isLoading, isError, error, settleDebt, isSettlingDebt } = useXenSplitBalances(groupId!);

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorDisplay error={error} />;

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  };

  const handleSettle = async (from: string, to: string, amount: number, currency: string) => {
    await new Promise<void>((resolve) => {
      settleDebt({ from, to, amount, currency }, { onSuccess: () => resolve() });
    });
  };

  return (
    <Box>
      <Container maxWidth="sm" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 4 }}>
          <IconButton onClick={() => navigate(`/internal/xensplit/groups/${groupId}?tab=2`)}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
            Settle Up
          </Typography>
        </Box>

        {!balancesData || balancesData.settlements.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
              All settled up!
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No outstanding balances to settle.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              Suggested payments to settle all debts
            </Typography>

            {balancesData.settlements.map((settlement, idx) => (
              <Card
                key={idx}
                sx={{
                  transition: "transform 0.2s, box-shadow 0.2s",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: 4,
                  },
                }}
              >
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
                    <Avatar src={settlement.fromUser.avatar || undefined} sx={{ bgcolor: "error.main" }}>
                      {settlement.fromUser.username[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="body1">
                      {settlement.fromUser.username}
                    </Typography>
                    <Box
                      sx={{
                        flexGrow: 1,
                        height: 2,
                        bgcolor: "divider",
                        mx: 1,
                        borderRadius: 1,
                      }}
                    />
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                      {formatCurrency(settlement.amount, settlement.currency)}
                    </Typography>
                    <Box
                      sx={{
                        flexGrow: 1,
                        height: 2,
                        bgcolor: "divider",
                        mx: 1,
                        borderRadius: 1,
                      }}
                    />
                    <Avatar src={settlement.toUser.avatar || undefined} sx={{ bgcolor: "success.main" }}>
                      {settlement.toUser.username[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="body1">
                      {settlement.toUser.username}
                    </Typography>
                  </Box>

                  <Button
                    fullWidth
                    variant="contained"
                    color="success"
                    startIcon={<CheckIcon />}
                    onClick={() =>
                      handleSettle(settlement.from, settlement.to, settlement.amount, settlement.currency)
                    }
                    disabled={isSettlingDebt}
                    loading={isSettlingDebt}
                  >
                    Mark as Settled
                  </Button>
                </CardContent>
              </Card>
            ))}
          </Box>
        )}
      </Container>
    </Box>
  );
}