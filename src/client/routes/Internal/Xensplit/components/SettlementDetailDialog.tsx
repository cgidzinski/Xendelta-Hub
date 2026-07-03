import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import { Box, Typography, Button, Avatar, Dialog, DialogContent, DialogActions, TextField, Chip } from "@mui/material";
import EastIcon from "@mui/icons-material/East";
import UndoIcon from "@mui/icons-material/Undo";
import CheckIcon from "@mui/icons-material/Check";
import LockIcon from "@mui/icons-material/Lock";
import type { XenSplitSettlement, XenSplitSettlementTransfer, SettleDebtInput } from "../../../../hooks/xensplit/types";
import { formatCurrency } from "../../../../utils/currencyUtils";

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

// --- Pending settlement modal ---

interface PendingProps {
    settlement: XenSplitSettlementTransfer | null;
    onClose: () => void;
    userId: string;
    settleDebt: (input: SettleDebtInput, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => void;
    isSettling: boolean;
}

export function PendingSettlementDialog({ settlement, onClose, userId, settleDebt, isSettling }: PendingProps) {
    const { enqueueSnackbar } = useSnackbar();
    const [amount, setAmount] = useState("");
    const [note, setNote] = useState("");

    useEffect(() => {
        if (settlement) {
            setAmount(settlement.amount.toString());
            setNote("");
        }
    }, [settlement]);

    if (!settlement) return null;
    const s = settlement;
    const direction = s.from === userId ? "You owe" : s.to === userId ? "Owed to you" : "Pending";
    const amountColor = s.from === userId ? "error.main" : s.to === userId ? "success.main" : "text.primary";
    const isInvolved = s.from === userId || s.to === userId;

    const handleConfirm = () => {
        settleDebt(
            {
                from: s.from,
                to: s.to,
                amount: parseFloat(amount),
                currency: s.currency,
                ...(note.trim() ? { note: note.trim() } : {}),
            },
            {
                onSuccess: () => {
                    enqueueSnackbar("Settled!", { variant: "success" });
                    onClose();
                },
                onError: (error: Error) => {
                    enqueueSnackbar(error?.message || "Failed to settle", { variant: "error" });
                },
            }
        );
    };

    return (
        <Dialog fullWidth maxWidth="xs" open={!!settlement} onClose={onClose} PaperProps={{ sx: { borderRadius: 3 } }}>
            <Box sx={{ pt: 3, pb: 1, px: 3, textAlign: "center" }}>
                <Typography variant="h4" sx={{ fontWeight: 800, color: amountColor, letterSpacing: "-0.02em" }}>
                    {formatCurrency(s.amount, s.currency)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                    {direction}
                </Typography>
            </Box>

            <DialogContent sx={{ px: 3, pt: 1.5, pb: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", alignItems: "center", bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5 }}>
                    <PersonStack avatar={s.fromUser.avatar} name={s.fromUser.username} />
                    <EastIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                    <PersonStack avatar={s.toUser.avatar} name={s.toUser.username} />
                </Box>

                {isInvolved && (
                    <>
                        <TextField
                            label="Amount"
                            type="number"
                            fullWidth
                            size="small"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            inputProps={{ min: 0.01, step: 0.01 }}
                            InputProps={{ endAdornment: <Typography variant="caption" sx={{ ml: 0.5, color: "text.secondary" }}>{s.currency}</Typography> }}
                        />
                        <TextField
                            label="Note (optional)"
                            fullWidth
                            size="small"
                            multiline
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            inputProps={{ maxLength: 500 }}
                            helperText="Only visible between you and the other party"
                        />
                    </>
                )}
            </DialogContent>

            {isInvolved && (
                <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
                    <Button
                        fullWidth
                        variant="contained"
                        color="success"
                        startIcon={<CheckIcon />}
                        disabled={isSettling || !amount || parseFloat(amount) <= 0}
                        loading={isSettling}
                        onClick={handleConfirm}
                    >
                        Confirm Settlement
                    </Button>
                </DialogActions>
            )}
        </Dialog>
    );
}

// --- Completed settlement modal ---

interface CompletedProps {
    settlement: XenSplitSettlement | null;
    onClose: () => void;
    getMember: (userId: string) => { avatar?: string | null; username: string } | undefined;
    userId: string;
    deleteSettlement: (id: string) => void;
    isDeletingSettlement: boolean;
}

export default function SettlementDetailDialog({ settlement, onClose, getMember, userId, deleteSettlement, isDeletingSettlement }: CompletedProps) {
    const [confirmUndo, setConfirmUndo] = useState(false);

    if (!settlement) return null;

    const s = settlement;
    const fromMember = getMember(s.from);
    const toMember = getMember(s.to);
    const isInvolved = s.from === userId || s.to === userId;
    const canUndo = !!s._id && isInvolved;

    const handleUndo = () => {
        deleteSettlement(s._id);
        setConfirmUndo(false);
        onClose();
    };

    return (
        <>
            <Dialog fullWidth maxWidth="xs" open={!!settlement} onClose={onClose} PaperProps={{ sx: { borderRadius: 3 } }}>
                <Box sx={{ pt: 3, pb: 1, px: 3, textAlign: "center" }}>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: "success.main", letterSpacing: "-0.02em" }}>
                        {formatCurrency(s.amount, s.currency)}
                    </Typography>
                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 0.75, mt: 0.75, flexWrap: "wrap" }}>
                        <Typography variant="caption" color="text.secondary">
                            {new Date(s.settled_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                        </Typography>
                        {s.is_partial && <Chip label="Partial" size="small" sx={{ fontSize: "0.65rem", height: 18 }} />}
                    </Box>
                </Box>

                <DialogContent sx={{ px: 3, pt: 1.5, pb: 2 }}>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", alignItems: "center", bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5, mb: 2 }}>
                        <PersonStack avatar={fromMember?.avatar} name={fromMember?.username ?? "?"} />
                        <EastIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                        <PersonStack avatar={toMember?.avatar} name={toMember?.username ?? "?"} />
                    </Box>

                    <Box sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, fontSize: "0.65rem" }}>
                            Note
                        </Typography>
                        {isInvolved ? (
                            s.note
                                ? <Typography variant="body2">{s.note}</Typography>
                                : <Typography variant="body2" color="text.disabled">No note added</Typography>
                        ) : (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                <LockIcon sx={{ fontSize: "0.9rem", color: "text.disabled" }} />
                                <Typography variant="body2" color="text.disabled">Only visible between the two parties</Typography>
                            </Box>
                        )}
                    </Box>
                </DialogContent>

                {canUndo && (
                    <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
                        <Button fullWidth variant="outlined" color="error" startIcon={<UndoIcon />} onClick={() => { onClose(); setConfirmUndo(true); }}>
                            Undo Settlement
                        </Button>
                    </DialogActions>
                )}
            </Dialog>

            <Dialog open={confirmUndo} onClose={() => setConfirmUndo(false)}>
                <Box sx={{ p: 3, pb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Undo Settlement?</Typography>
                    <Typography variant="body2" color="text.secondary">
                        This will remove the settlement record and restore the balance. Are you sure?
                    </Typography>
                </Box>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setConfirmUndo(false)}>Cancel</Button>
                    <Button color="error" disabled={isDeletingSettlement} onClick={handleUndo}>Undo</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
