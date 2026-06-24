import { useOutletContext } from "react-router-dom";
import { Box, Typography, Avatar } from "@mui/material";
import type { GroupDetailContext } from "./GroupDetail";
import { formatCurrency } from "../../../utils/currencyUtils";

export default function GroupBalances() {
    const { balancesData } = useOutletContext<GroupDetailContext>();

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
                            display: "grid",
                            gridTemplateColumns: "40px 1fr auto",
                            alignItems: "center",
                            columnGap: 2,
                            p: 2,
                            bgcolor: "action.hover",
                            borderRadius: 2,
                            mb: 1,
                            minHeight: 64,
                            opacity: isSettled ? 0.5 : 1,
                        }}
                    >
                        <Avatar src={balance.user.avatar || undefined}>
                            {balance.user.username[0]?.toUpperCase()}
                        </Avatar>
                        <Typography variant="subtitle2">{balance.user.username}</Typography>
                        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.25 }}>
                            {isSettled ? (
                                <Typography variant="subtitle2" color="text.secondary">Settled up</Typography>
                            ) : (
                                nonZeroBalances.map(([currency, amount]) => (
                                    <Typography
                                        key={currency}
                                        variant="subtitle2"
                                        noWrap
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
                    </Box>
                );
            })}
            {Object.keys(balancesData.balances).length === 0 && (
                    <Box sx={{ textAlign: "center", py: 4 }}>
                        <Typography variant="body1" color="text.secondary">
                            Nothing Yet
                        </Typography>
                    </Box>
                )}
        </Box>
    );
}
