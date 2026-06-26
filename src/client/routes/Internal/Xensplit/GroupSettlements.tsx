import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Typography, Button, Avatar, Divider, ToggleButtonGroup, ToggleButton } from "@mui/material";
import EastIcon from "@mui/icons-material/East";
import type { GroupDetailContext } from "./GroupDetail";
import type { XenSplitSettlement, XenSplitSettlementTransfer } from "../../../hooks/xensplit/types";
import { xsCardSx } from "./components/rowStyles";
import { formatCurrency } from "../../../utils/currencyUtils";
import SettlementDetailDialog, { PendingSettlementDialog } from "./components/SettlementDetailDialog";

const listGridSx = {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    rowGap: 1,
} as const;

const cardSx = {
    ...xsCardSx,
    gridColumn: "1 / -1",
    display: "grid",
    gridTemplateColumns: "subgrid",
    alignItems: "center",
    cursor: "pointer",
    textAlign: "center",
} as const;

function PersonCol({ avatar, name }: { avatar?: string | null; name: string }) {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5, minWidth: 0 }}>
            <Avatar src={avatar || undefined} sx={{ width: 38, height: 38 }}>
                {name[0]?.toUpperCase() ?? "?"}
            </Avatar>
            <Typography variant="caption" noWrap sx={{ width: "100%", textAlign: "center", textTransform: "capitalize", lineHeight: 1.2, color: "text.secondary" }}>
                {name}
            </Typography>
        </Box>
    );
}

function MiddleCol({ amount, currency, sub }: { amount: number; currency: string; sub?: React.ReactNode }) {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25, px: 1 }}>
            <EastIcon sx={{ fontSize: 16, color: "text.disabled" }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, whiteSpace: "nowrap", lineHeight: 1.3 }}>
                {formatCurrency(amount, currency)}
            </Typography>
            {sub}
        </Box>
    );
}

export default function GroupSettlements() {
    const { balancesData, group, user, onSettle, deleteSettlement, isDeletingSettlement } = useOutletContext<GroupDetailContext>();
    const [filter, setFilter] = useState<"all" | "mine" | "others">("all");
    const [showHistory, setShowHistory] = useState(false);
    const [viewPending, setViewPending] = useState<XenSplitSettlementTransfer | null>(null);
    const [viewSettlement, setViewSettlement] = useState<XenSplitSettlement | null>(null);

    const pendingSettlements = balancesData?.settlements ?? [];
    const myPendingSettlements = pendingSettlements.filter(s => s.from === user.id || s.to === user.id);
    const otherPendingSettlements = pendingSettlements.filter(s => s.from !== user.id && s.to !== user.id);

    const sortedMyPending = [
        ...myPendingSettlements.filter(s => s.from === user.id),
        ...myPendingSettlements.filter(s => s.to === user.id),
    ];
    const sortedAllPending = [...sortedMyPending, ...otherPendingSettlements];
    const displayedPending = filter === "all" ? sortedAllPending : filter === "mine" ? sortedMyPending : otherPendingSettlements;

    const completedSettlements = [...(group.settlements ?? [])].sort(
        (a, b) => new Date(b.settled_at).getTime() - new Date(a.settled_at).getTime()
    );
    const filteredHistory = filter === "all"
        ? completedSettlements
        : filter === "mine"
        ? completedSettlements.filter(s => s.from === user.id || s.to === user.id)
        : completedSettlements.filter(s => s.from !== user.id && s.to !== user.id);

    const getMember = (userId: string) => group.members.find((m) => m.user_id === userId);

    if (pendingSettlements.length === 0 && completedSettlements.length === 0) {
        return (
            <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography variant="body1" color="text.secondary">No settlements yet</Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2, minHeight: 48, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>Settlements</Typography>
                <ToggleButtonGroup size="small" value={filter} exclusive onChange={(_, v) => v && setFilter(v)} sx={{ height: 24 }}>
                    <ToggleButton value="all" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>All</ToggleButton>
                    <ToggleButton value="mine" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>Mine</ToggleButton>
                    <ToggleButton value="others" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>Others</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Pending */}
            {pendingSettlements.length > 0 && (
                <>
                    <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1.5 }}>
                        Pending
                    </Typography>
                    {displayedPending.length === 0 ? (
                        <Box sx={{ textAlign: "center", py: 3, mb: completedSettlements.length > 0 ? 2 : 0 }}>
                            <Typography variant="body2" color="text.secondary">All settled up</Typography>
                        </Box>
                    ) : (
                        <Box sx={listGridSx}>
                            {displayedPending.map((s, idx) => {
                                return (
                                    <Box key={idx} onClick={() => setViewPending(s)} sx={cardSx}>
                                        <PersonCol avatar={s.fromUser.avatar} name={s.fromUser.username} />
                                        <MiddleCol
                                            amount={s.amount}
                                            currency={s.currency}
                                        />
                                        <PersonCol avatar={s.toUser.avatar} name={s.toUser.username} />
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
                            {filteredHistory.map((s, idx) => {
                                const fromMember = getMember(s.from);
                                const toMember = getMember(s.to);
                                return (
                                    <Box key={s._id ?? idx} onClick={() => setViewSettlement(s)} sx={cardSx}>
                                        <PersonCol avatar={fromMember?.avatar} name={fromMember?.username ?? "?"} />
                                        <MiddleCol
                                            amount={s.amount}
                                            currency={s.currency}
                                            sub={
                                                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                                                    {s.is_partial ? "Partial" : "Full"}
                                                </Typography>
                                            }
                                        />
                                        <PersonCol avatar={toMember?.avatar} name={toMember?.username ?? "?"} />
                                    </Box>
                                );
                            })}
                        </Box>
                    ))}
                </>
            )}

            <PendingSettlementDialog
                settlement={viewPending}
                onClose={() => setViewPending(null)}
                userId={user.id}
                onSettle={onSettle}
            />

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
