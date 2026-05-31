import { Box, Typography, Skeleton } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useXenSplits } from "../../../../hooks/xensplit/useGroups";
import { useAuth } from "../../../../contexts/AuthContext";
import type { XenSplit } from "../../../../hooks/xensplit/types";

function getUserNetBalance(group: XenSplit, userId: string): { [currency: string]: number } {
    const balances: { [currency: string]: number } = {};
    for (const expense of group.expenses ?? []) {
        const { paid_by, amount, currency, splits } = expense;
        if (!balances[currency]) balances[currency] = 0;
        if (paid_by === userId) balances[currency] += amount;
        const mySplit = splits.find((s) => s.user_id === userId);
        if (mySplit) {
            let owed = 0;
            if (mySplit.amount_owed !== undefined) owed = mySplit.amount_owed;
            else if (mySplit.percentage !== undefined) owed = (amount * mySplit.percentage) / 100;
            else owed = amount / splits.length;
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

export default function XenSplitCardBody() {
    const { groups, isLoading } = useXenSplits();
    const { user } = useAuth();
    const navigate = useNavigate();

    if (isLoading) return <Skeleton variant="rectangular" height={72} sx={{ borderRadius: 1 }} />;

    const recent = groups.slice(0, 3);

    return (
        <Box>
            {recent.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No groups yet.</Typography>
            ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {recent.map((group) => {
                        const netBalances = getUserNetBalance(group, user?.id || "");
                        const nonZero = Object.entries(netBalances).filter(([, v]) => Math.abs(v) > 0.01);
                        const hasExpenses = (group.expenses?.length ?? 0) > 0;
                        const isSettled = hasExpenses && nonZero.length === 0;
                        const firstEntry = nonZero[0];

                        const balanceColor = (() => {
                            if (!hasExpenses || isSettled) return "success.main";
                            if (firstEntry) return firstEntry[1] > 0 ? "success.main" : "error.main";
                            return "text.secondary";
                        })();

                        const balanceLabel = (() => {
                            if (!hasExpenses) return "No expenses";
                            if (isSettled) return "Settled up";
                            if (firstEntry) {
                                const [currency, amount] = firstEntry;
                                const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Math.abs(amount));
                                return amount > 0 ? `Owed ${formatted}` : `Owe ${formatted}`;
                            }
                            return null;
                        })();

                        return (
                            <Box
                                key={group._id}
                                onClick={() => navigate(`/internal/xensplit/groups/${group._id}/overview`)}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 1,
                                    px: 1.5,
                                    py: 1,
                                    borderRadius: 2,
                                    bgcolor: "action.hover",
                                    border: "1px solid",
                                    borderColor: "divider",
                                    cursor: "pointer",
                                    "&:hover": { bgcolor: "action.selected", borderColor: "primary.main" },
                                    transition: "background-color 0.15s, border-color 0.15s",
                                }}
                            >
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
                                        {group.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.disabled">
                                        {group.members?.length ?? 0} members · {group.expenses?.length ?? 0} expenses
                                    </Typography>
                                </Box>
                                {balanceLabel && (
                                    <Typography variant="caption" sx={{ fontWeight: 700, color: balanceColor, flexShrink: 0 }}>
                                        {balanceLabel}
                                    </Typography>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            )}
        </Box>
    );
}
