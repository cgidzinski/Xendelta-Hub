import { useOutletContext } from "react-router-dom";
import { Box, Typography, Avatar } from "@mui/material";
import type { GroupDetailContext } from "./GroupDetail";
import { xsCardSx } from "./components/rowStyles";
import { formatCurrency } from "../../../utils/currencyUtils";

export default function GroupBalances() {
    const { balancesData } = useOutletContext<GroupDetailContext>();

    if (!balancesData) return null;

    const entries = Object.entries(balancesData.balances);

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {entries.length === 0 ? (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="body1" color="text.secondary">
                        Nothing yet
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1, pb: { xs: 11, md: 1 } }}>
                    {entries.map(([userId, balance]) => {
                        const nonZeroBalances = Object.entries(balance.balances).filter(([, amount]) => Math.abs(amount as number) >= 0.01);
                        const isSettled = nonZeroBalances.length === 0;
                        return (
                            <Box
                                key={userId}
                                sx={{
                                    ...xsCardSx,
                                    display: "grid",
                                    gridTemplateColumns: "40px 1fr auto",
                                    alignItems: "center",
                                    columnGap: 1.5,
                                }}
                            >
                                <Avatar src={balance.user.avatar || undefined} sx={{ width: 40, height: 40 }}>
                                    {balance.user.username[0]?.toUpperCase()}
                                </Avatar>
                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{balance.user.username}</Typography>
                                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
                                    {isSettled ? (
                                        <Typography variant="caption" sx={{ color: "text.primary" }}>Settled up</Typography>
                                    ) : (
                                        nonZeroBalances.map(([currency, amount]) => {
                                            const owed = (amount as number) >= 0;
                                            return (
                                                <Typography key={currency} variant="subtitle2" noWrap sx={{ fontWeight: 700, color: owed ? "success.main" : "error.main", lineHeight: 1.2 }}>
                                                    {formatCurrency(Math.abs(amount as number), currency)}
                                                </Typography>
                                            );
                                        })
                                    )}
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
}
