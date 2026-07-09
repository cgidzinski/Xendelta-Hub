import { useMemo, useState } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { Box, Typography, Button, Switch, Avatar } from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import type { GroupDetailContext } from "./GroupDetail";
import type { XenSplitExpense, XenSplitSettlement, XenSplitExchange } from "../../../hooks/xensplit/types";
import ExpenseListItem from "./components/ExpenseListItem";
import ExchangeListItem from "./components/ExchangeListItem";
import SettlementDetailDialog from "./components/SettlementDetailDialog";
import { xsCardSx } from "./components/rowStyles";
import { formatCurrency } from "../../../utils/currencyUtils";

type ActivityItem =
    | { type: "expense"; date: string; expense: XenSplitExpense }
    | { type: "settlement"; date: string; settlement: XenSplitSettlement }
    | { type: "exchange"; date: string; exchange: XenSplitExchange };

export default function GroupOverview() {
    const { group, balancesData, user, onViewExpense, deleteSettlement, isDeletingSettlement, deleteExchange, isDeletingExchange, isCreator } = useOutletContext<GroupDetailContext>();
    const navigate = useNavigate();
    const { groupId } = useParams<{ groupId: string }>();
    const lsKey = `xensplit_myActivityOnly_${groupId}`;
    const [myActivityOnly, setMyActivityOnly] = useState(() => localStorage.getItem(lsKey) === "true");
    const [viewSettlement, setViewSettlement] = useState<XenSplitSettlement | null>(null);

    const getMember = (userId: string) => group.members.find((m) => m.user_id === userId);

    const handleActivityToggle = (checked: boolean) => {
        setMyActivityOnly(checked);
        localStorage.setItem(lsKey, String(checked));
    };

    // Pending settlements involving this user
    const allPendingSettlements = balancesData?.settlements ?? [];
    const userSettlements = allPendingSettlements.filter(
        (s) => s.from === user.id || s.to === user.id
    );

    // Activity feed — includes held expenses, visible to all group members
    const feed: ActivityItem[] = [
        ...group.expenses
            .map((e) => ({ type: "expense" as const, date: e.date, expense: e })),
        ...group.settlements.map((s) => ({
            type: "settlement" as const,
            date: s.settled_at,
            settlement: s,
        })),
        ...(group.exchanges ?? []).map((ex) => ({
            type: "exchange" as const,
            date: ex.date,
            exchange: ex,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const filteredFeed = myActivityOnly
        ? feed.filter((item) => {
            if (item.type === "expense") {
                const e = item.expense;
                return e.paid_by === user.id || e.splits.some((sp) => sp.user_id === user.id);
            }
            if (item.type === "exchange") {
                return item.exchange.party_a === user.id || item.exchange.party_b === user.id;
            }
            return item.settlement.from === user.id || item.settlement.to === user.id;
        })
        : feed;

    // Group the (already date-desc sorted) feed into ordered day-groups
    const groupedFeed = useMemo(() => {
        const groups: { key: string; label: string; items: ActivityItem[] }[] = [];
        for (const item of filteredFeed) {
            const d = new Date(item.date);
            const key = d.toDateString();
            const label = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            const last = groups[groups.length - 1];
            if (last && last.key === key) last.items.push(item);
            else groups.push({ key, label, items: [item] });
        }
        return groups;
    }, [filteredFeed]);

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
        if (item.type === "exchange") {
            const ex = item.exchange;
            return (
                <ExchangeListItem
                    key={`ex-${ex._id}`}
                    exchange={ex}
                    members={group.members}
                    currentUserId={user.id}
                    canDelete={isCreator || ex.created_by === user.id || ex.party_a === user.id || ex.party_b === user.id}
                    onDelete={deleteExchange}
                    isDeletingExchange={isDeletingExchange}
                />
            );
        }
        const s = item.settlement;
        const { from, to } = settleNames(s);
        const fromMember = getMember(s.from);
        const toMember = getMember(s.to);
        const fromAvatar = s.from === user.id ? user.avatar : fromMember?.avatar;
        const toAvatar = s.to === user.id ? user.avatar : toMember?.avatar;
        const fromInitial = (s.from === user.id ? user.username : fromMember?.username ?? "?")[0]?.toUpperCase() ?? "?";
        const toInitial = (s.to === user.id ? user.username : toMember?.username ?? "?")[0]?.toUpperCase() ?? "?";
        return (
            <Box
                key={`s-${dateKey}-${idx}`}
                onClick={() => setViewSettlement(s)}
                sx={{
                    ...xsCardSx,
                    display: "grid",
                    gridTemplateColumns: "40px 1fr auto",
                    alignItems: "flex-start",
                    columnGap: 1.25,
                    cursor: "pointer",
                    "&:hover": { bgcolor: "action.hover" },
                }}
            >
                <Box sx={{ position: "relative", width: 40, height: 40 }}>
                    <Avatar
                        src={fromAvatar || undefined}
                        sx={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: 26,
                            height: 26,
                            fontSize: "0.6875rem",
                            zIndex: 1,
                        }}
                    >
                        {fromInitial}
                    </Avatar>
                    <Avatar
                        src={toAvatar || undefined}
                        sx={{
                            position: "absolute",
                            bottom: 0,
                            right: 0,
                            width: 26,
                            height: 26,
                            fontSize: "0.6875rem",
                        }}
                    >
                        {toInitial}
                    </Avatar>
                    <Box
                        sx={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            bgcolor: "background.paper",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "text.secondary",
                        }}
                    >
                        <SwapHorizIcon sx={{ fontSize: 12 }} />
                    </Box>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{from} → {to}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        Settled · {s.is_partial ? "Partial" : "Full"}
                    </Typography>
                </Box>
                <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: s.from === user.id ? "error.main" : s.to === user.id ? "success.main" : "text.primary", lineHeight: 1.3 }}>{formatCurrency(s.amount, s.currency)}</Typography>
                </Box>
            </Box>
        );
    };

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* Pending settlements — always visible (fixed header) */}
            <Button
                fullWidth
                variant="outlined"
                color={userSettlements.length > 0 ? "warning" : allPendingSettlements.length > 0 ? "primary" : "inherit"}
                size="small"
                onClick={() => navigate(`/internal/xensplit/groups/${groupId}/settlements`)}
                sx={{ mb: 2, flexShrink: 0, borderRadius: 2, fontWeight: 600, ...(allPendingSettlements.length === 0 && { borderColor: "divider", color: "text.disabled" }) }}
            >
                {userSettlements.length > 0
                    ? `You have ${userSettlements.length} pending settlement${userSettlements.length !== 1 ? "s" : ""}`
                    : allPendingSettlements.length > 0
                        ? `${allPendingSettlements.length} pending settlement${allPendingSettlements.length !== 1 ? "s" : ""}`
                        : "All settled up"}
            </Button>

            {/* Filter row */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", mb: 1, flexShrink: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                    My activity only
                </Typography>
                <Switch
                    size="small"
                    checked={myActivityOnly}
                    onChange={(e) => handleActivityToggle(e.target.checked)}
                />
            </Box>

            {/* Activity feed (scrollable) */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: { xs: 11, md: 1 } }}>
                {filteredFeed.length > 0 ? (
                    groupedFeed.map((dateGroup) => (
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
                    ))
                ) : (
                    <Box sx={{ textAlign: "center", py: 6 }}>
                        <Typography variant="body1" color="text.secondary">
                            {myActivityOnly ? "No activity involving you" : "No activity yet"}
                        </Typography>
                    </Box>
                )}
            </Box>

            <SettlementDetailDialog
                settlement={viewSettlement}
                onClose={() => setViewSettlement(null)}
                getMember={getMember}
                userId={user.id}
                deleteSettlement={deleteSettlement}
                isDeletingSettlement={isDeletingSettlement}
            />
        </Box>
    );
}
