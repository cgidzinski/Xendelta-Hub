import { useOutletContext } from "react-router-dom";
import { Box, Typography, Avatar } from "@mui/material";
import type { GroupDetailContext } from "./GroupDetail";

export default function GroupBalances() {
    const { balancesData, formatCurrency } = useOutletContext<GroupDetailContext>();

    if (!balancesData) return null;

    return (
        <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, minHeight: 48 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>
                    Balances
                </Typography>
            </Box>
            {Object.entries(balancesData.balances).map(([userId, balance]) => {
                const nonZeroBalances = Object.entries(balance.balances).filter(([_, amount]) => Math.abs(amount as number) >= 0.01);
                const isSettled = nonZeroBalances.length === 0;
                return (
                    <Box
                        key={userId}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            p: 2,
                            bgcolor: "action.hover",
                            borderRadius: 2,
                            mb: 1,
                            minHeight: 64,
                            flexWrap: "wrap",
                            opacity: isSettled ? 0.5 : 1,
                        }}
                    >
                        <Avatar src={balance.user.avatar || undefined} sx={{ bgcolor: "primary.main" }}>
                            {balance.user.username[0]?.toUpperCase()}
                        </Avatar>
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="subtitle2">{balance.user.username}</Typography>
                        </Box>
                        {isSettled ? (
                            <Typography variant="subtitle2" color="text.secondary">Settled up</Typography>
                        ) : (
                            nonZeroBalances.map(([currency, amount]) => (
                                <Typography
                                    key={currency}
                                    variant="subtitle2"
                                    sx={{
                                        fontWeight: 700,
                                        color: (amount as number) >= 0 ? "success.main" : "error.main",
                                    }}
                                >
                                    {(amount as number) >= 0 ? "Owed " : "Owes "}
                                    {formatCurrency(Math.abs(amount as number), currency)}
                                </Typography>
                            ))
                        )}
                    </Box>
                );
            })}
            {Object.values(balancesData.balances).every((balance) =>
                Object.values(balance.balances).every((amount) => amount === 0)
            ) && (
                    <Box sx={{ textAlign: "center", py: 4 }}>
                        <Typography variant="body1" color="text.secondary">
                            Nothing Yet
                        </Typography>
                    </Box>
                )}
        </Box>
    );
}
