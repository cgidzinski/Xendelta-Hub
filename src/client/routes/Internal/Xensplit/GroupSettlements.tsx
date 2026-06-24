import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Typography, Button, Avatar, Chip, Divider, Dialog, DialogTitle, DialogContent, DialogActions, ToggleButtonGroup, ToggleButton } from "@mui/material";
import EastIcon from "@mui/icons-material/East";
import CheckIcon from "@mui/icons-material/Check";
import UndoIcon from "@mui/icons-material/Undo";
import type { GroupDetailContext } from "./GroupDetail";
import { formatCurrency } from "../../../utils/currencyUtils";

export default function GroupSettlements() {
    const { balancesData, group, user, onSettle, deleteSettlement, isDeletingSettlement } = useOutletContext<GroupDetailContext>();
    const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
    const [historyFilter, setHistoryFilter] = useState<"mine" | "all">("mine");
    const [pendingFilter, setPendingFilter] = useState<"mine" | "all">("mine");

    const pendingSettlements = balancesData?.settlements ?? [];
    const myPendingSettlements = pendingSettlements.filter(s => s.from === user.id || s.to === user.id);
    const otherPendingSettlements = pendingSettlements.filter(s => s.from !== user.id && s.to !== user.id);

    // Ordered: I owe first, then owed to me
    const sortedMyPending = [
        ...myPendingSettlements.filter(s => s.from === user.id),
        ...myPendingSettlements.filter(s => s.to === user.id),
    ];
    const sortedAllPending = [...sortedMyPending, ...otherPendingSettlements];
    const displayedPending = pendingFilter === "mine" ? sortedMyPending : sortedAllPending;

    const completedSettlements = [...(group.settlements ?? [])].sort(
        (a, b) => new Date(b.settled_at).getTime() - new Date(a.settled_at).getTime()
    );
    const filteredHistory = historyFilter === "mine"
        ? completedSettlements.filter(s => s.from === user.id || s.to === user.id)
        : completedSettlements;

    const getMember = (userId: string) => group.members.find((m) => m.user_id === userId);

    if (pendingSettlements.length === 0 && completedSettlements.length === 0) {
        return (
            <Box sx={{ textAlign: "center", py: 4 }}>
                <Typography variant="body1" color="text.secondary">
                    No settlements yet
                </Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ mb: 2, minHeight: 48, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, my: 0 }}>
                    Settlements
                </Typography>
            </Box>

            {/* Pending settlements with Mine/All toggle */}
            {pendingSettlements.length > 0 && (
                <>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                        <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            Pending
                        </Typography>
                        <ToggleButtonGroup
                            size="small"
                            value={pendingFilter}
                            exclusive
                            onChange={(_, v) => v && setPendingFilter(v)}
                            sx={{ height: 24 }}
                        >
                            <ToggleButton value="mine" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>Mine</ToggleButton>
                            <ToggleButton value="all" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>All</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    {displayedPending.length === 0 ? (
                        <Box sx={{ textAlign: "center", py: 3, mb: completedSettlements.length > 0 ? 2 : 0 }}>
                            <Typography variant="body2" color="text.secondary">All settled up</Typography>
                        </Box>
                    ) : (
                        displayedPending.map((settlement, idx) => {
                            const isInvolved = settlement.from === user.id || settlement.to === user.id;
                            return (
                                <Box
                                    key={idx}
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: "auto 1fr auto 1fr auto 1fr auto 1fr auto",
                                        gridTemplateRows: "auto auto",
                                        rowGap: { xs: 0.75, sm: 1 },
                                        px: { xs: 2, sm: 3 },
                                        py: { xs: 1.5, sm: 2 },
                                        mb: 1.5,
                                        bgcolor: "action.hover",
                                        borderRadius: 2,
                                        alignItems: "center",
                                        opacity: isInvolved ? 1 : 0.6,
                                    }}
                                >
                                    <Box sx={{ gridColumn: 1, gridRow: "1 / 3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: { xs: 0.5, sm: 0.75 } }}>
                                        <Avatar
                                            src={settlement.fromUser.avatar || undefined}
                                            sx={{ width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 } }}
                                        >
                                            {settlement.fromUser.username[0]?.toUpperCase()}
                                        </Avatar>
                                        <Typography variant="caption" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center", fontSize: { sm: "0.8rem" } }}>
                                            {settlement.fromUser.username}
                                        </Typography>
                                    </Box>
                                    <EastIcon sx={{ gridColumn: 3, gridRow: "1 / 3", alignSelf: "center", justifySelf: "center", fontSize: { xs: 14, sm: 18 }, color: "text.disabled" }} />
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            gridColumn: 5,
                                            gridRow: 1,
                                            alignSelf: "center",
                                            justifySelf: "center",
                                            fontWeight: 700,
                                            fontSize: { sm: "1rem" },
                                            whiteSpace: "nowrap",
                                            color: settlement.from === user.id
                                                ? "error.main"
                                                : settlement.to === user.id
                                                    ? "success.main"
                                                    : "text.primary",
                                        }}
                                    >
                                        {formatCurrency(settlement.amount, settlement.currency)}
                                    </Typography>
                                    {isInvolved && (
                                        <Button
                                            variant="outlined"
                                            color="success"
                                            size="small"
                                            sx={{ gridColumn: 5, gridRow: 2, justifySelf: "center", alignSelf: "center", fontWeight: 600, borderRadius: 2, boxShadow: "none", px: { xs: 1, sm: 2 }, fontSize: { xs: "0.75rem", sm: "0.875rem" }, whiteSpace: "nowrap", "&:hover": { boxShadow: "none" } }}
                                            onClick={() => onSettle(settlement)}
                                        >
                                            Settle
                                        </Button>
                                    )}
                                    <EastIcon sx={{ gridColumn: 7, gridRow: "1 / 3", alignSelf: "center", justifySelf: "center", fontSize: { xs: 14, sm: 18 }, color: "text.disabled" }} />
                                    <Box sx={{ gridColumn: 9, gridRow: "1 / 3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: { xs: 0.5, sm: 0.75 } }}>
                                        <Avatar
                                            src={settlement.toUser.avatar || undefined}
                                            sx={{ width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 } }}
                                        >
                                            {settlement.toUser.username[0]?.toUpperCase()}
                                        </Avatar>
                                        <Typography variant="caption" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center", fontSize: { sm: "0.8rem" } }}>
                                            {settlement.toUser.username}
                                        </Typography>
                                    </Box>
                                </Box>
                            );
                        })
                    )}
                </>
            )}

            {/* No pending but all settled */}
            {pendingSettlements.length === 0 && (
                <Box sx={{ textAlign: "center", py: 3, mb: completedSettlements.length > 0 ? 2 : 0 }}>
                    <Typography variant="body2" color="text.secondary">All settled up</Typography>
                </Box>
            )}

            {/* History */}
            {completedSettlements.length > 0 && (
                <>
                    {pendingSettlements.length > 0 && <Divider sx={{ my: 2 }} />}
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                        <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            History
                        </Typography>
                        <ToggleButtonGroup
                            size="small"
                            value={historyFilter}
                            exclusive
                            onChange={(_, v) => v && setHistoryFilter(v)}
                            sx={{ height: 24 }}
                        >
                            <ToggleButton value="mine" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>Mine</ToggleButton>
                            <ToggleButton value="all" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>All</ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                    {filteredHistory.length === 0 ? (
                        <Box sx={{ textAlign: "center", py: 3 }}>
                            <Typography variant="body2" color="text.secondary">No settlements yet</Typography>
                        </Box>
                    ) : filteredHistory.map((s, idx) => {
                        const fromMember = getMember(s.from);
                        const toMember = getMember(s.to);
                        return (
                            <Box
                                key={s._id ?? idx}
                                sx={{
                                    display: "grid",
                                    gridTemplateColumns: "auto 1fr auto 1fr auto 1fr auto 1fr auto",
                                    gridTemplateRows: "auto auto",
                                    rowGap: { xs: 0.75, sm: 1 },
                                    px: { xs: 2, sm: 3 },
                                    py: { xs: 1.5, sm: 2 },
                                    mb: 1.5,
                                    bgcolor: "action.hover",
                                    borderRadius: 2,
                                    alignItems: "center",
                                    opacity: 0.45,
                                }}
                            >
                                <Box sx={{ gridColumn: 1, gridRow: "1 / 3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: { xs: 0.5, sm: 0.75 } }}>
                                    <Avatar src={fromMember?.avatar || undefined} sx={{ width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 } }}>
                                        {fromMember?.username?.[0]?.toUpperCase() ?? "?"}
                                    </Avatar>
                                    <Typography variant="caption" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center", fontSize: { sm: "0.8rem" } }}>
                                        {fromMember?.username ?? "?"}
                                    </Typography>
                                </Box>
                                <EastIcon sx={{ gridColumn: 3, gridRow: "1 / 3", alignSelf: "center", justifySelf: "center", fontSize: { xs: 14, sm: 18 }, color: "text.disabled" }} />
                                <Box sx={{ gridColumn: 5, gridRow: "1 / 3", display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
                                    {s._id && (s.from === user.id || s.to === user.id) && (
                                        <Chip
                                            icon={<UndoIcon sx={{ fontSize: "0.8rem !important" }} />}
                                            label="Undo"
                                            size="small"
                                            color="error"
                                            clickable
                                            onClick={() => setConfirmUndoId(s._id)}
                                            sx={{ fontSize: "0.7rem", height: 22, fontWeight: 600, cursor: "pointer" }}
                                        />
                                    )}
                                    <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                                        {formatCurrency(s.amount, s.currency)}
                                    </Typography>
                                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center" }}>
                                        <Chip
                                            icon={<CheckIcon sx={{ fontSize: "0.75rem !important" }} />}
                                            label={new Date(s.settled_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                            size="small"
                                            color="success"
                                            variant="outlined"
                                            sx={{ fontSize: "0.62rem", height: 20, px: 0.25 }}
                                        />
                                        {s.is_partial && (
                                            <Chip
                                                label="Partial"
                                                size="small"
                                                color="warning"
                                                variant="outlined"
                                                sx={{ fontSize: "0.62rem", height: 20, px: 0.25 }}
                                            />
                                        )}
                                    </Box>
                                </Box>
                                <EastIcon sx={{ gridColumn: 7, gridRow: "1 / 3", alignSelf: "center", justifySelf: "center", fontSize: { xs: 14, sm: 18 }, color: "text.disabled" }} />
                                <Box sx={{ gridColumn: 9, gridRow: "1 / 3", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: { xs: 0.5, sm: 0.75 } }}>
                                    <Avatar src={toMember?.avatar || undefined} sx={{ width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 } }}>
                                        {toMember?.username?.[0]?.toUpperCase() ?? "?"}
                                    </Avatar>
                                    <Typography variant="caption" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center", fontSize: { sm: "0.8rem" } }}>
                                        {toMember?.username ?? "?"}
                                    </Typography>
                                </Box>

                            </Box>
                        );
                    })}
                </>
            )}

            <Dialog open={!!confirmUndoId} onClose={() => setConfirmUndoId(null)}>
                <DialogTitle>Undo Settlement?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">This will remove the settlement record and restore the balance. Are you sure?</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmUndoId(null)}>Cancel</Button>
                    <Button
                        color="error"
                        disabled={isDeletingSettlement}
                        onClick={() => {
                            if (confirmUndoId) {
                                deleteSettlement(confirmUndoId);
                                setConfirmUndoId(null);
                            }
                        }}
                    >
                        Undo
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
