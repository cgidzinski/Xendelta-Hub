import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Box, Typography, Button, Avatar, Divider, Dialog, DialogTitle, DialogContent, DialogActions, ToggleButtonGroup, ToggleButton, Chip } from "@mui/material";
import EastIcon from "@mui/icons-material/East";
import CheckIcon from "@mui/icons-material/Check";
import UndoIcon from "@mui/icons-material/Undo";
import LockIcon from "@mui/icons-material/Lock";
import type { GroupDetailContext } from "./GroupDetail";
import type { XenSplitSettlement } from "../../../hooks/xensplit/types";
import { xsCardSx } from "./components/rowStyles";
import { formatCurrency } from "../../../utils/currencyUtils";

/** Compact avatar-over-name column used for each party in a settlement row. */
function PersonStack({ avatar, name }: { avatar?: string | null; name: string }) {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25, minWidth: 0, flex: 1 }}>
            <Avatar src={avatar || undefined} sx={{ width: 34, height: 34 }}>
                {name[0]?.toUpperCase() ?? "?"}
            </Avatar>
            <Typography variant="caption" noWrap sx={{ maxWidth: "100%", textTransform: "capitalize", lineHeight: 1.2, color: "text.secondary" }}>
                {name}
            </Typography>
        </Box>
    );
}

/** Shared style for the per-row action buttons (Settle / Undo). */
const settlementBtnSx = {
    fontWeight: 600,
    borderRadius: 2,
    boxShadow: "none",
    py: 0.25,
    px: 1.5,
    fontSize: "0.75rem",
    whiteSpace: "nowrap",
    "&:hover": { boxShadow: "none" },
} as const;

export default function GroupSettlements() {
    const { balancesData, group, user, onSettle, deleteSettlement, isDeletingSettlement } = useOutletContext<GroupDetailContext>();
    const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
    const [filter, setFilter] = useState<"all" | "mine" | "others">("all");
    const [showHistory, setShowHistory] = useState(false);
    const [viewSettlement, setViewSettlement] = useState<XenSplitSettlement | null>(null);

    const pendingSettlements = balancesData?.settlements ?? [];
    const myPendingSettlements = pendingSettlements.filter(s => s.from === user.id || s.to === user.id);
    const otherPendingSettlements = pendingSettlements.filter(s => s.from !== user.id && s.to !== user.id);

    // Ordered: I owe first, then owed to me
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
                <ToggleButtonGroup
                    size="small"
                    value={filter}
                    exclusive
                    onChange={(_, v) => v && setFilter(v)}
                    sx={{ height: 24 }}
                >
                    <ToggleButton value="all" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>All</ToggleButton>
                    <ToggleButton value="mine" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>Mine</ToggleButton>
                    <ToggleButton value="others" sx={{ px: 1.5, fontSize: "0.7rem", textTransform: "none" }}>Others</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Pending settlements */}
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
                        displayedPending.map((settlement, idx) => {
                            const isInvolved = settlement.from === user.id || settlement.to === user.id;
                            const direction = settlement.from === user.id ? "You owe" : settlement.to === user.id ? "Owed to you" : "Pending";
                            const amountColor = settlement.from === user.id ? "error.main" : settlement.to === user.id ? "success.main" : "text.primary";
                            return (
                                <Box
                                    key={idx}
                                    onClick={() => isInvolved && onSettle(settlement)}
                                    sx={{
                                        ...xsCardSx,
                                        display: "flex",
                                        alignItems: "center",
                                        columnGap: 1,
                                        mb: 1,
                                        opacity: isInvolved ? 1 : 0.55,
                                        cursor: isInvolved ? "pointer" : "default",
                                    }}
                                >
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, flex: "1 1 66%" }}>
                                        <PersonStack avatar={settlement.fromUser.avatar} name={settlement.fromUser.username} />
                                        <EastIcon sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }} />
                                        <PersonStack avatar={settlement.toUser.avatar} name={settlement.toUser.username} />
                                    </Box>
                                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, gap: 0.5 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: amountColor, lineHeight: 1.3, whiteSpace: "nowrap" }}>
                                            {formatCurrency(settlement.amount, settlement.currency)}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.1 }}>
                                            {direction}
                                        </Typography>
                                        {isInvolved && (
                                            <Button
                                                variant="outlined"
                                                color="success"
                                                size="small"
                                                sx={settlementBtnSx}
                                                onClick={(e) => { e.stopPropagation(); onSettle(settlement); }}
                                            >
                                                Settle
                                            </Button>
                                        )}
                                    </Box>
                                </Box>
                            );
                        })
                    )}
                </>
            )}

            {/* No pending */}
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
                        <Button size="small" variant="outlined" onClick={() => setShowHistory((v) => !v)} sx={{ borderRadius: 2, fontWeight: 600, fontSize: "0.75rem", py: 0.25, px: 1.5 }}>
                            {showHistory ? "Hide" : "Show"}
                        </Button>
                    </Box>

                    {showHistory && (
                        filteredHistory.length === 0 ? (
                            <Box sx={{ textAlign: "center", py: 3 }}>
                                <Typography variant="body2" color="text.secondary">No settlements yet</Typography>
                            </Box>
                        ) : filteredHistory.map((s, idx) => {
                            const fromMember = getMember(s.from);
                            const toMember = getMember(s.to);
                            const canUndo = !!s._id && (s.from === user.id || s.to === user.id);
                            return (
                                <Box
                                    key={s._id ?? idx}
                                    onClick={() => setViewSettlement(s)}
                                    sx={{
                                        ...xsCardSx,
                                        display: "flex",
                                        alignItems: "center",
                                        columnGap: 1,
                                        mb: 1,
                                        opacity: 0.6,
                                        cursor: "pointer",
                                    }}
                                >
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, flex: "1 1 66%" }}>
                                        <PersonStack avatar={fromMember?.avatar} name={fromMember?.username ?? "?"} />
                                        <EastIcon sx={{ fontSize: 16, color: "text.disabled", flexShrink: 0 }} />
                                        <PersonStack avatar={toMember?.avatar} name={toMember?.username ?? "?"} />
                                    </Box>
                                    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0, gap: 0.5 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: "text.primary", lineHeight: 1.3, whiteSpace: "nowrap" }}>
                                            {formatCurrency(s.amount, s.currency)}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.25, lineHeight: 1.1 }}>
                                            <CheckIcon sx={{ fontSize: "0.85rem", color: "success.main" }} />
                                            {new Date(s.settled_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                            {s.is_partial ? " · Partial" : ""}
                                        </Typography>
                                        {canUndo && (
                                            <Button
                                                variant="outlined"
                                                color="error"
                                                size="small"
                                                startIcon={<UndoIcon sx={{ fontSize: "0.9rem !important" }} />}
                                                sx={settlementBtnSx}
                                                onClick={(e) => { e.stopPropagation(); setConfirmUndoId(s._id); }}
                                            >
                                                Undo
                                            </Button>
                                        )}
                                    </Box>
                                </Box>
                            );
                        })
                    )}
                </>
            )}

            {/* Settlement Detail Modal (history) */}
            {viewSettlement && (() => {
                const s = viewSettlement;
                const fromMember = getMember(s.from);
                const toMember = getMember(s.to);
                const isInvolved = s.from === user.id || s.to === user.id;
                const canUndo = !!s._id && isInvolved;
                return (
                    <Dialog
                        fullWidth
                        maxWidth="xs"
                        open={!!viewSettlement}
                        onClose={() => setViewSettlement(null)}
                        PaperProps={{ sx: { borderRadius: 3 } }}
                    >
                        <Box sx={{ position: "relative", pt: 3, pb: 1, px: 3, textAlign: "center" }}>
                            <Typography variant="h4" sx={{ fontWeight: 800, color: "success.main", letterSpacing: "-0.02em" }}>
                                {formatCurrency(s.amount, s.currency)}
                            </Typography>
                            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 0.75, mt: 0.75, flexWrap: "wrap" }}>
                                <Typography variant="caption" color="text.secondary">
                                    {new Date(s.settled_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                                </Typography>
                                {s.is_partial && (
                                    <Chip label="Partial" size="small" sx={{ fontSize: "0.65rem", height: 18 }} />
                                )}
                            </Box>
                        </Box>

                        <DialogContent sx={{ px: 3, pt: 1.5, pb: 2 }}>
                            {/* From → To */}
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5, mb: 2 }}>
                                <PersonStack avatar={fromMember?.avatar} name={fromMember?.username ?? "?"} />
                                <EastIcon sx={{ fontSize: 20, color: "text.disabled", flexShrink: 0 }} />
                                <PersonStack avatar={toMember?.avatar} name={toMember?.username ?? "?"} />
                            </Box>

                            {/* Note — private to involved parties only */}
                            <Box sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.65rem" }}>
                                    Note
                                </Typography>
                                {isInvolved ? (
                                    s.note ? (
                                        <Typography variant="body2">{s.note}</Typography>
                                    ) : (
                                        <Typography variant="body2" color="text.disabled">No note added</Typography>
                                    )
                                ) : (
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                        <LockIcon sx={{ fontSize: "0.9rem", color: "text.disabled" }} />
                                        <Typography variant="body2" color="text.disabled">
                                            Only visible between the two parties
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </DialogContent>

                        {canUndo && (
                            <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    color="error"
                                    startIcon={<UndoIcon />}
                                    onClick={() => {
                                        setViewSettlement(null);
                                        setConfirmUndoId(s._id);
                                    }}
                                >
                                    Undo Settlement
                                </Button>
                            </DialogActions>
                        )}
                    </Dialog>
                );
            })()}

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
