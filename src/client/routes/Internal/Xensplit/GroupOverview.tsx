import { useMemo } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { Box, Typography, Button } from "@mui/material";
import { alpha } from "@mui/material/styles";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import type { GroupDetailContext } from "./GroupDetail";
import type { XenSplitExpense, XenSplitSettlement } from "../../../hooks/xensplit/types";
import ExpenseListItem from "./components/ExpenseListItem";
import { xsCardSx, xsBadgeSx } from "./components/rowStyles";
import { formatCurrency } from "../../../utils/currencyUtils";

type ActivityItem =
    | { type: "expense"; date: string; expense: XenSplitExpense }
    | { type: "settlement"; date: string; settlement: XenSplitSettlement };

export default function GroupOverview() {
    const { group, balancesData, user, onViewExpense } = useOutletContext<GroupDetailContext>();
    const navigate = useNavigate();
    const { groupId } = useParams<{ groupId: string }>();

    // Pending settlements involving this user
    const allPendingSettlements = balancesData?.settlements ?? [];
    const userSettlements = allPendingSettlements.filter(
        (s) => s.from === user.id || s.to === user.id
    );

    // Activity feed
    const feed: ActivityItem[] = [
        ...group.expenses.map((e) => ({ type: "expense" as const, date: e.date, expense: e })),
        ...group.settlements.map((s) => ({
            type: "settlement" as const,
            date: s.settled_at,
            settlement: s,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Group the (already date-desc sorted) feed into ordered day-groups
    const groupedFeed = useMemo(() => {
        const groups: { key: string; label: string; items: ActivityItem[] }[] = [];
        for (const item of feed) {
            const d = new Date(item.date);
            const key = d.toDateString();
            const label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            const last = groups[groups.length - 1];
            if (last && last.key === key) last.items.push(item);
            else groups.push({ key, label, items: [item] });
        }
        return groups;
    }, [feed]);

    const getMember = (userId: string) => group.members.find((m) => m.user_id === userId);
    const timeStr = (d: string) => new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const settleNames = (s: XenSplitSettlement) => ({
        from: s.from === user.id ? "You" : getMember(s.from)?.username ?? "?",
        to: s.to === user.id ? "you" : getMember(s.to)?.username ?? "?",
    });

    const renderItem = (item: ActivityItem, idx: number, dateKey: string) => {
        if (item.type === "expense") {
            const e = item.expense;
            return (
                <ExpenseListItem
                    key={`e-${e._id}`}
                    expense={e}
                    onClick={() => onViewExpense(e)}
                    userId={user.id}
                    hideDate
                />
            );
        }
        const s = item.settlement;
        const { from, to } = settleNames(s);
        return (
            <Box
                key={`s-${dateKey}-${idx}`}
                sx={{
                    ...xsCardSx,
                    display: "grid",
                    gridTemplateColumns: "40px 1fr auto",
                    alignItems: "center",
                    columnGap: 1.25,
                    borderColor: (t) => alpha(t.palette.success.main, 0.4),
                    bgcolor: (t) => alpha(t.palette.success.main, 0.06),
                }}
            >
                <Box sx={{ ...xsBadgeSx, bgcolor: (t) => alpha(t.palette.success.main, 0.16) }}>
                    <SwapHorizIcon sx={{ fontSize: 22, color: "success.main" }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{from} → {to}</Typography>
                    <Typography variant="caption" sx={{ color: "success.main", fontWeight: 600, display: "block" }} noWrap>
                        Settlement{s.is_partial ? " · Partial" : ""}
                    </Typography>
                </Box>
                <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "success.main", lineHeight: 1.3 }}>{formatCurrency(s.amount, s.currency)}</Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ display: "block", lineHeight: 1.2 }}>{timeStr(s.settled_at)}</Typography>
                </Box>
            </Box>
        );
    };

    return (
        <Box>
            {/* Pending settlements — always visible */}
            <Button
                fullWidth
                variant="outlined"
                color={userSettlements.length > 0 ? "warning" : allPendingSettlements.length > 0 ? "primary" : "inherit"}
                size="small"
                onClick={() => navigate(`/internal/xensplit/groups/${groupId}/settlements`)}
                sx={{ mb: 2, borderRadius: 2, fontWeight: 600, ...(allPendingSettlements.length === 0 && { borderColor: "divider", color: "text.disabled" }) }}
            >
                {userSettlements.length > 0
                    ? `You have ${userSettlements.length} pending settlement${userSettlements.length !== 1 ? "s" : ""}`
                    : allPendingSettlements.length > 0
                        ? `${allPendingSettlements.length} Pending Settlement${allPendingSettlements.length !== 1 ? "s" : ""}`
                        : "All settled up"}
            </Button>

            {/* Activity feed */}
            {feed.length > 0 ? (
                <>
                    {groupedFeed.map((dateGroup) => (
                        <Box key={dateGroup.key} sx={{ mb: 2.5 }}>
                            <Typography
                                variant="caption"
                                color="text.disabled"
                                sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1, ml: 0.25 }}
                            >
                                {dateGroup.label}
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                {dateGroup.items.map((item, idx) => renderItem(item, idx, dateGroup.key))}
                            </Box>
                        </Box>
                    ))}
                </>
            ) : (
                <Box sx={{ textAlign: "center", py: 6 }}>
                    <Typography variant="body1" color="text.secondary">
                        No activity yet
                    </Typography>
                </Box>
            )}

        </Box>
    );
}
