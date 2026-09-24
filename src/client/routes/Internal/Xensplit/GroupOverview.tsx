import { useMemo, useState } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { Box, Typography, Button, Switch, Avatar, ToggleButtonGroup, ToggleButton } from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import type { GroupDetailContext } from "./GroupDetail";
import type { XenSplitExpense, XenSplitSettlement, XenSplitExchange } from "../../../hooks/xensplit/types";
import ExpenseListItem, { computeFinalExpenseIds } from "./components/ExpenseListItem";
import ExchangeListItem from "./components/ExchangeListItem";
import SettlementDetailDialog from "./components/SettlementDetailDialog";
import { xsCardSx } from "./components/rowStyles";
import { formatCurrency } from "../../../utils/currencyUtils";
import { groupByDay } from "../../../utils/dateGrouping";
import {
    sortByMode, sortDateOf, nextSortMode, loadSortMode, saveSortMode,
    type SortField,
} from "./components/activitySort";

// `date` is the transaction date, `added` is when the row was entered. Both travel with
// the item so the comparator and the day-header key never re-derive them per type.
type ActivityItem =
    | { type: "expense"; date: string; added: string; deleted: boolean; expense: XenSplitExpense }
    | { type: "settlement"; date: string; added: string; deleted: boolean; settlement: XenSplitSettlement }
    | { type: "exchange"; date: string; added: string; deleted: boolean; exchange: XenSplitExchange };

const SORT_FIELDS: { label: string; value: SortField }[] = [
    { label: "Date", value: "date" },
    { label: "Added", value: "added" },
];

export default function GroupOverview() {
    const {
        group, balancesData, user, onViewExpense, deleteSettlement, isDeletingSettlement,
        deleteExchange, isDeletingExchange, isCreator, showDeleted,
    } = useOutletContext<GroupDetailContext>();
    const navigate = useNavigate();
    const { groupId } = useParams<{ groupId: string }>();
    const lsKey = `xensplit_myActivityOnly_${groupId}`;
    const sortKey = `xensplit_overviewSort_${groupId}`;
    const [myActivityOnly, setMyActivityOnly] = useState(() => localStorage.getItem(lsKey) === "true");
    const [sort, setSort] = useState(() => loadSortMode(sortKey));
    const [viewSettlement, setViewSettlement] = useState<XenSplitSettlement | null>(null);

    const getMember = (userId: string) => group.members.find((m) => m.user_id === userId);

    // Genesis expense id -> its recurring series, for chips on genesis rows
    const seriesByGenesisId = useMemo(() => {
        const map = new Map<string, NonNullable<typeof group.recurring_expenses>[number]>();
        for (const r of group.recurring_expenses ?? []) {
            if (r.genesis_expense_id) map.set(r.genesis_expense_id, r);
        }
        return map;
    }, [group.recurring_expenses]);

    const finalExpenseIds = useMemo(
        () => computeFinalExpenseIds(group.expenses, group.recurring_expenses),
        [group.expenses, group.recurring_expenses]
    );

    const handleActivityToggle = (checked: boolean) => {
        setMyActivityOnly(checked);
        localStorage.setItem(lsKey, String(checked));
    };

    const handleSortPress = (pressed: SortField | null) => {
        const next = nextSortMode(sort, pressed);
        setSort(next);
        saveSortMode(sortKey, next);
    };

    // Pending settlements involving this user
    const allPendingSettlements = balancesData?.settlements ?? [];
    const userSettlements = allPendingSettlements.filter(
        (s) => s.from === user.id || s.to === user.id
    );

    // Activity feed — includes held expenses, visible to all group members
    const feed: ActivityItem[] = useMemo(() => {
        // Deleted records are split out of the arrays below by the query `select`, so they
        // only enter the feed when explicitly revealed - and carry a flag so the row dims.
        const del = group.deleted;
        const expenses = showDeleted ? [...group.expenses, ...(del?.expenses ?? [])] : group.expenses;
        const settlements = showDeleted ? [...group.settlements, ...(del?.settlements ?? [])] : group.settlements;
        const exchanges = showDeleted
            ? [...(group.exchanges ?? []), ...(del?.exchanges ?? [])]
            : (group.exchanges ?? []);

        const items: ActivityItem[] = [
            ...expenses.map((e) => ({
                type: "expense" as const,
                date: e.date,
                // Absent on expenses predating the field; fall back to the transaction date.
                added: e.created_at ?? e.date,
                deleted: e.deleted_at != null,
                expense: e,
            })),
            // Settlements carry no created_at: settled_at is stamped server-side when the
            // settlement is recorded and is never backdated, so both timestamps are the same.
            ...settlements.map((s) => ({
                type: "settlement" as const,
                date: s.settled_at,
                added: s.settled_at,
                deleted: s.deleted_at != null,
                settlement: s,
            })),
            ...exchanges.map((ex) => ({
                type: "exchange" as const,
                date: ex.date,
                added: ex.created_at ?? ex.date,
                deleted: ex.deleted_at != null,
                exchange: ex,
            })),
        ];
        return sortByMode(items, sort);
    }, [group.expenses, group.settlements, group.exchanges, group.deleted, showDeleted, sort]);

    const filteredFeed = useMemo(() => (
        myActivityOnly
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
            : feed
    ), [feed, myActivityOnly, user.id]);

    // Group the sorted feed into ordered day-groups, keyed on the field it was sorted on —
    // groupByDay only merges into its last group, so the other timestamp would emit a
    // header per row.
    const groupedFeed = useMemo(
        () => groupByDay(filteredFeed, (item) => sortDateOf(item, sort.field)),
        [filteredFeed, sort.field]
    );

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
                    hideDate={sort.field === "date"}
                    recurringSeries={seriesByGenesisId.get(e._id)}
                    isFinal={finalExpenseIds.has(e._id)}
                    deleted={item.deleted}
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
                    groupId={groupId!}
                    defaultCurrency={group.default_currency}
                    deleted={item.deleted}
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
                    ...(item.deleted && { opacity: 0.6, borderStyle: "dashed" }),
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
                    <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, ...(item.deleted && { textDecoration: "line-through" }) }}
                        noWrap
                    >
                        {from} → {to}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        {item.deleted ? "Deleted" : "Settled"}
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
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1, flexShrink: 0 }}>
                {/* Pressing the active button reverses the order - MUI reports that as null. */}
                <ToggleButtonGroup
                    size="small"
                    value={sort.field}
                    exclusive
                    onChange={(_, v: SortField | null) => handleSortPress(v)}
                    sx={{ flexShrink: 0, height: 28 }}
                >
                    {SORT_FIELDS.map((f) => (
                        <ToggleButton
                            key={f.value}
                            value={f.value}
                            title={`Sort by ${f.value === "added" ? "date added" : "transaction date"}`}
                            sx={{ px: 1, gap: 0.25, fontSize: "0.7rem", textTransform: "none", whiteSpace: "nowrap" }}
                        >
                            {f.label}
                            {sort.field === f.value && (
                                sort.dir === "desc"
                                    ? <ArrowDownwardIcon sx={{ fontSize: 12 }} />
                                    : <ArrowUpwardIcon sx={{ fontSize: 12 }} />
                            )}
                        </ToggleButton>
                    ))}
                </ToggleButtonGroup>
                <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }} noWrap>
                        My activity only
                    </Typography>
                    <Switch
                        size="small"
                        checked={myActivityOnly}
                        onChange={(e) => handleActivityToggle(e.target.checked)}
                    />
                </Box>
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
