import { Fragment, useMemo, useState } from "react";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { Box, Typography, Button, Avatar, Divider, ToggleButtonGroup, ToggleButton, IconButton, Tooltip } from "@mui/material";
import EastIcon from "@mui/icons-material/East";
import HubIcon from "@mui/icons-material/Hub";
import AddIcon from "@mui/icons-material/Add";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import type { GroupDetailContext } from "./GroupDetail";
import type { XenSplitSettlement, XenSplitSettlementTransfer } from "../../../hooks/xensplit/types";
import { xsCardSx } from "./components/rowStyles";
import { formatCurrency, getGroupCurrencies } from "../../../utils/currencyUtils";
import { groupByDay } from "../../../utils/dateGrouping";
import SettlementDetailDialog, { PendingSettlementDialog } from "./components/SettlementDetailDialog";
import CreateSettlementDialog from "./components/CreateSettlementDialog";
import { calculateBalances, calculateMinimumTransfers } from "../../../../shared/xensplit/balances";
import { rewindBefore, excludedSettlementIds, settlementsNewestFirst } from "../../../../shared/xensplit/rewind";

const listGridSx = {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    rowGap: 1,
} as const;

// 3-col subgrid, 2 rows: [avatar | amount | avatar] / [name | arrow | name]
const cardSx = {
    ...xsCardSx,
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "subgrid",
    gridTemplateRows: "auto auto",
    cursor: "pointer",
    textAlign: "center",
    rowGap: 0.5,
} as const;

// History rows carry a third full-width row for the date and the rewind toggle.
const historyCardSx = {
    ...cardSx,
    gridTemplateRows: "auto auto auto",
} as const;

const settledOnLabel = (settledAt: string) =>
    new Date(settledAt).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function GroupSettlements() {
    const { balancesData, group, user, settleDebt, isSettlingDebt, deleteSettlement, isDeletingSettlement, onAddExchange } = useOutletContext<GroupDetailContext>();
    const navigate = useNavigate();
    const { groupId } = useParams<{ groupId: string }>();
    const lsKey = `xensplit_settlementsFilter_${groupId}`;
    const [filter, setFilter] = useState<"all" | "mine" | "others">(() => {
        const saved = localStorage.getItem(lsKey);
        return saved === "mine" || saved === "others" ? saved : "all";
    });
    const [showHistory, setShowHistory] = useState(false);
    const [viewPending, setViewPending] = useState<XenSplitSettlementTransfer | null>(null);
    const [viewSettlement, setViewSettlement] = useState<XenSplitSettlement | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    // _id of the settlement being rewound past, or null for the live list.
    const [rewindTo, setRewindTo] = useState<string | null>(null);

    const getMember = (userId: string) => group.members.find((m) => m.user_id === userId);

    // The group in the shape the balance engine takes — same mapping the balances
    // route does server-side before calling calculateBalances.
    const calcDoc = useMemo(() => ({
        members: group.members.map((m) => m.user_id),
        expenses: group.expenses,
        settlements: group.settlements,
        exchanges: group.exchanges ?? [],
    }), [group]);

    // Rewinding runs the server's own balance engine over a copy of the group with
    // the chosen settlement (and everything after it) removed, so the preview and
    // the live list can't disagree. Mirrors the enrichment the balances route does.
    const rewoundPending = useMemo<XenSplitSettlementTransfer[]>(() => {
        if (!rewindTo) return [];
        const asUser = (userId: string) => {
            const m = group.members.find((mem) => mem.user_id === userId);
            return m
                ? { _id: m.user_id, username: m.username, avatar: m.avatar, etransfer: m.etransfer }
                : { _id: userId, username: "Unknown", avatar: null, etransfer: null };
        };
        const balances = calculateBalances(rewindBefore(calcDoc, rewindTo));
        return calculateMinimumTransfers(balances).map((t) => ({
            ...t,
            fromUser: asUser(t.from),
            toUser: asUser(t.to),
        }));
    }, [group, calcDoc, rewindTo]);

    const rewoundSettlement = rewindTo ? (group.settlements ?? []).find((s) => s._id === rewindTo) : undefined;
    const hiddenByRewind = useMemo(
        () => (rewindTo ? excludedSettlementIds(calcDoc, rewindTo) : new Set<string>()),
        [calcDoc, rewindTo],
    );
    const isRewound = !!rewindTo && !!rewoundSettlement;

    const pendingSettlements = isRewound ? rewoundPending : (balancesData?.settlements ?? []);
    const myPendingSettlements = pendingSettlements.filter(s => s.from === user.id || s.to === user.id);
    const otherPendingSettlements = pendingSettlements.filter(s => s.from !== user.id && s.to !== user.id);

    const sortedMyPending = [
        ...myPendingSettlements.filter(s => s.from === user.id),
        ...myPendingSettlements.filter(s => s.to === user.id),
    ];
    const sortedAllPending = [...sortedMyPending, ...otherPendingSettlements];
    const displayedPending = filter === "all" ? sortedAllPending : filter === "mine" ? sortedMyPending : otherPendingSettlements;

    // Same ordering the rewind cut uses, so "this one and everything after it" is
    // exactly the run of rows above the toggled one.
    const completedSettlements = settlementsNewestFirst(group.settlements ?? []);
    const filteredHistory = filter === "all"
        ? completedSettlements
        : filter === "mine"
            ? completedSettlements.filter(s => s.from === user.id || s.to === user.id)
            : completedSettlements.filter(s => s.from !== user.id && s.to !== user.id);

    // Day headers, as on the Overview feed. No timeZone argument: settled_at is a
    // real timestamp, not a date-only value stored at UTC midnight. Safe because
    // filteredHistory is still in settlementsNewestFirst order — filtering never
    // reorders, and groupByDay only merges into the last group.
    const groupedHistory = useMemo(
        () => groupByDay(filteredHistory, (s) => s.settled_at),
        [filteredHistory],
    );

    if (pendingSettlements.length === 0 && completedSettlements.length === 0) {
        return (
            <Box>
                <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<AddIcon sx={{ fontSize: 18 }} />}
                    onClick={() => setCreateOpen(true)}
                    sx={{ borderRadius: 2, fontWeight: 600, textTransform: "none", mb: 2.5 }}
                >
                    New Settlement
                </Button>

                <Box sx={{ textAlign: "center", py: 4 }}>
                    <Typography variant="body1" color="text.secondary">No settlements yet</Typography>
                </Box>

                <CreateSettlementDialog
                    open={createOpen}
                    onClose={() => setCreateOpen(false)}
                    members={group.members}
                    currentUser={user}
                    defaultCurrency={group.default_currency}
                    currencyOptions={getGroupCurrencies(group.default_currency, group.secondary_currencies)}
                    settleDebt={settleDebt}
                    isSettling={isSettlingDebt}
                />
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2, minHeight: 48, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>Settlements</Typography>
                <ToggleButtonGroup size="small" value={filter} exclusive onChange={(_, v) => { if (v) { setFilter(v); localStorage.setItem(lsKey, v); } }} sx={{ height: 24 }}>
                    <ToggleButton value="all" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>All</ToggleButton>
                    <ToggleButton value="mine" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>Mine</ToggleButton>
                    <ToggleButton value="others" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>Others</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            <Box sx={{ display: "flex", gap: 1.5, mb: 2.5 }}>
                <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<AddIcon sx={{ fontSize: 18 }} />}
                    onClick={() => setCreateOpen(true)}
                    sx={{ borderRadius: 2, fontWeight: 600, textTransform: "none" }}
                >
                    New
                </Button>
                {group.secondary_currencies?.length > 0 && (
                    <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<SwapHorizIcon sx={{ fontSize: 18 }} />}
                        onClick={onAddExchange}
                        sx={{ borderRadius: 2, fontWeight: 600, textTransform: "none" }}
                    >
                        Swap
                    </Button>
                )}
                <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<HubIcon sx={{ fontSize: 18 }} />}
                    onClick={() => navigate(`/internal/xensplit/groups/${groupId}/explain`)}
                    sx={{ borderRadius: 2, fontWeight: 600, textTransform: "none" }}
                >
                    Explain
                </Button>
            </Box>

            {/* Rewind banner — a silently altered list would be worse than no preview */}
            {isRewound && rewoundSettlement && (
                <Box sx={{ mb: 2.5, px: 2, py: 1.5, borderRadius: 2, bgcolor: "action.hover", borderLeft: 3, borderColor: "warning.main" }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Showing the list as it stood before{" "}
                        {getMember(rewoundSettlement.from)?.username ?? "someone"} paid{" "}
                        {getMember(rewoundSettlement.to)?.username ?? "someone"}{" "}
                        {formatCurrency(rewoundSettlement.amount, rewoundSettlement.currency)} on{" "}
                        {settledOnLabel(rewoundSettlement.settled_at)}.
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                        Approximate: expenses edited since, on-hold changes and membership changes aren't reconstructed.
                    </Typography>
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setRewindTo(null)}
                        sx={{ mt: 1, borderRadius: 2, fontWeight: 600, fontSize: "0.75rem", py: 0.25, px: 1.5, textTransform: "none" }}
                    >
                        Back to now
                    </Button>
                </Box>
            )}

            {/* Pending */}
            {pendingSettlements.length > 0 && (
                <>
                    <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1.5 }}>
                        {isRewound ? `Pending as of ${settledOnLabel(rewoundSettlement!.settled_at)}` : "Pending"}
                    </Typography>
                    {displayedPending.length === 0 ? (
                        <Box sx={{ textAlign: "center", py: 3, mb: completedSettlements.length > 0 ? 2 : 0 }}>
                            <Typography variant="body2" color="text.secondary">All settled up</Typography>
                        </Box>
                    ) : (
                        <Box sx={listGridSx}>
                            {displayedPending.map((s, idx) => {
                                const arrowColor = s.from === user.id ? "error.main" : s.to === user.id ? "success.main" : "text.disabled";
                                return (
                                    <Box
                                        key={idx}
                                        onClick={isRewound ? undefined : () => setViewPending(s)}
                                        sx={{ ...cardSx, ...(isRewound ? { cursor: "default" } : {}) }}
                                    >
                                        {/* row 1: avatars + amount */}
                                        <Avatar src={s.fromUser.avatar || undefined} sx={{ width: 38, height: 38, mx: "auto" }}>{s.fromUser.username[0]?.toUpperCase()}</Avatar>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: "nowrap", alignSelf: "center", color: arrowColor }}>{formatCurrency(s.amount, s.currency)}</Typography>
                                        <Avatar src={s.toUser.avatar || undefined} sx={{ width: 38, height: 38, mx: "auto" }}>{s.toUser.username[0]?.toUpperCase()}</Avatar>
                                        {/* row 2: names + arrow */}
                                        <Typography variant="caption" noWrap sx={{ textTransform: "capitalize", color: "text.secondary" }}>{s.fromUser.username}</Typography>
                                        <EastIcon sx={{ fontSize: 16, color: arrowColor, justifySelf: "center", alignSelf: "center" }} />
                                        <Typography variant="caption" noWrap sx={{ textTransform: "capitalize", color: "text.secondary" }}>{s.toUser.username}</Typography>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </>
            )}

            {pendingSettlements.length === 0 && (
                <Box sx={{ textAlign: "center", py: 3, mb: completedSettlements.length > 0 ? 2 : 0 }}>
                    <Typography variant="body2" color="text.secondary">All settled up</Typography>
                </Box>
            )}

            {/* History */}
            {completedSettlements.length > 0 && (
                <>
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: showHistory ? 1.5 : 0 }}>
                        <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            History
                        </Typography>
                        <Button size="small" variant="outlined" onClick={() => setShowHistory(v => !v)} sx={{ borderRadius: 2, fontWeight: 600, fontSize: "0.75rem", py: 0.25, px: 1.5 }}>
                            {showHistory ? "Hide" : "Show"}
                        </Button>
                    </Box>

                    {showHistory && (filteredHistory.length === 0 ? (
                        <Box sx={{ textAlign: "center", py: 3 }}>
                            <Typography variant="body2" color="text.secondary">No settlements yet</Typography>
                        </Box>
                    ) : (
                        <Box sx={listGridSx}>
                            {groupedHistory.map((dateGroup, groupIdx) => (
                                <Fragment key={dateGroup.key}>
                                    {/* Day header. Full-width so the cards stay direct children of
                                        the grid — their subgrid columns inherit from it, and an
                                        intermediate wrapper would let each day size its own. */}
                                    <Typography
                                        variant="caption"
                                        color="text.disabled"
                                        sx={{ gridColumn: "1 / -1", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1, ml: 0.25, mt: groupIdx === 0 ? 0 : 1.5 }}
                                    >
                                        {dateGroup.label}
                                    </Typography>
                                    {dateGroup.items.map((s, idx) => {
                                        const fromMember = getMember(s.from);
                                        const toMember = getMember(s.to);
                                        const isCut = rewindTo === s._id;
                                        const isHidden = hiddenByRewind.has(s._id);
                                        return (
                                            <Box
                                                key={s._id ?? idx}
                                                onClick={() => setViewSettlement(s)}
                                                sx={{ ...historyCardSx, ...(isHidden ? { opacity: 0.45 } : {}) }}
                                            >
                                                {/* row 1: avatars + amount */}
                                                <Avatar src={fromMember?.avatar || undefined} sx={{ width: 38, height: 38, mx: "auto" }}>{fromMember?.username[0]?.toUpperCase()}</Avatar>
                                                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25, alignSelf: "center" }}>
                                                    <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: "nowrap", ...(isHidden ? { textDecoration: "line-through" } : {}) }}>{formatCurrency(s.amount, s.currency)}</Typography>
                                                </Box>
                                                <Avatar src={toMember?.avatar || undefined} sx={{ width: 38, height: 38, mx: "auto" }}>{toMember?.username[0]?.toUpperCase()}</Avatar>
                                                {/* row 2: names + arrow */}
                                                <Typography variant="caption" noWrap sx={{ textTransform: "capitalize", color: "text.secondary" }}>{fromMember?.username ?? "?"}</Typography>
                                                <EastIcon sx={{ fontSize: 16, color: "text.disabled", justifySelf: "center", alignSelf: "center" }} />
                                                <Typography variant="caption" noWrap sx={{ textTransform: "capitalize", color: "text.secondary" }}>{toMember?.username ?? "?"}</Typography>
                                                {/* row 3: rewind toggle — the date is on the day header */}
                                                <Box sx={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "center", mt: 0.25 }}>
                                                    <Tooltip title={isCut ? "Back to now" : "See the pending list as it was before this"}>
                                                        <IconButton
                                                            size="small"
                                                            color={isCut ? "warning" : "default"}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRewindTo(isCut ? null : s._id);
                                                            }}
                                                            sx={{ p: 0.25 }}
                                                        >
                                                            {isCut
                                                                ? <VisibilityIcon sx={{ fontSize: 16 }} />
                                                                : <VisibilityOffIcon sx={{ fontSize: 16 }} />}
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </Box>
                                        );
                                    })}
                                </Fragment>
                            ))}
                        </Box>
                    ))}
                </>
            )}

            <PendingSettlementDialog
                settlement={viewPending}
                onClose={() => setViewPending(null)}
                userId={user.id}
                settleDebt={settleDebt}
                isSettling={isSettlingDebt}
            />

            <SettlementDetailDialog
                settlement={viewSettlement}
                onClose={() => setViewSettlement(null)}
                getMember={getMember}
                userId={user.id}
                deleteSettlement={deleteSettlement}
                isDeletingSettlement={isDeletingSettlement}
            />

            <CreateSettlementDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                members={group.members}
                currentUser={user}
                defaultCurrency={group.default_currency}
                currencyOptions={getGroupCurrencies(group.default_currency, group.secondary_currencies)}
                settleDebt={settleDebt}
                isSettling={isSettlingDebt}
            />
        </Box>
    );
}
