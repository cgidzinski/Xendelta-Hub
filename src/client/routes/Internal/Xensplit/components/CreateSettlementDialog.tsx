import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import {
    Box,
    Typography,
    Button,
    Avatar,
    Dialog,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    IconButton,
    Tooltip,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import EastIcon from "@mui/icons-material/East";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import type { XenSplitMember, SettleDebtInput } from "../../../../hooks/xensplit/types";
import { sanitizeAmount, getCurrencySymbol, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";
import { PersonStack } from "./SettlementDetailDialog";

type Direction = "i_paid" | "they_paid";

interface CreateSettlementProps {
    open: boolean;
    onClose: () => void;
    members: XenSplitMember[];
    currentUser: { id: string; username: string; avatar?: string | null };
    defaultCurrency?: string;
    currencyOptions: string[];
    settleDebt: (input: SettleDebtInput, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => void;
    isSettling: boolean;
}

export default function CreateSettlementDialog({ open, onClose, members, currentUser, defaultCurrency, currencyOptions, settleDebt, isSettling }: CreateSettlementProps) {
    const { enqueueSnackbar } = useSnackbar();
    const [counterpartyId, setCounterpartyId] = useState("");
    const [direction, setDirection] = useState<Direction>("i_paid");
    const [amount, setAmount] = useState("");
    const [currency, setCurrency] = useState(defaultCurrency ?? "CAD");
    const [note, setNote] = useState("");

    useEffect(() => {
        if (open) {
            setCounterpartyId("");
            setDirection("i_paid");
            setAmount("");
            setCurrency(defaultCurrency ?? "CAD");
            setNote("");
        }
    }, [open, defaultCurrency]);

    const otherMembers = members.filter((m) => m.user_id !== currentUser.id);
    const counterparty = otherMembers.find((m) => m.user_id === counterpartyId);
    const amountColor = direction === "i_paid" ? "error.main" : "success.main";
    const isValid = !!counterpartyId && !!amount && parseFloat(amount) > 0 && !!currency;

    const flipDirection = () => setDirection((d) => (d === "i_paid" ? "they_paid" : "i_paid"));

    const handleCreate = () => {
        const [from, to] = direction === "i_paid" ? [currentUser.id, counterpartyId] : [counterpartyId, currentUser.id];
        settleDebt(
            {
                from,
                to,
                amount: parseFloat(amount),
                currency,
                ...(note.trim() ? { note: note.trim() } : {}),
            },
            {
                onSuccess: () => {
                    enqueueSnackbar("Settlement recorded!", { variant: "success" });
                    onClose();
                },
                onError: (error: Error) => {
                    enqueueSnackbar(error?.message || "Failed to record settlement", { variant: "error" });
                },
            }
        );
    };

    return (
        <Dialog fullWidth maxWidth="xs" open={open} onClose={onClose} PaperProps={{ sx: { borderRadius: 3 } }}>
            <Box sx={{ position: "relative", pt: 3, pb: 1, px: 3, textAlign: "center" }}>
                <IconButton onClick={onClose} size="small" sx={{ position: "absolute", top: 12, right: 12 }}>
                    <CloseIcon fontSize="small" />
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    New Settlement
                </Typography>
            </Box>

            <DialogContent sx={{ px: 3, pt: 1.5, pb: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                <Box>
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 56px 1fr", alignItems: "center", bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5 }}>
                        <PersonStack avatar={currentUser.avatar} name={currentUser.username} />
                        <Tooltip title="Tap to flip who paid" placement="top">
                            <IconButton
                                onClick={flipDirection}
                                sx={{
                                    mx: "auto",
                                    width: 48,
                                    height: 48,
                                    bgcolor: (theme) => alpha(theme.palette[direction === "i_paid" ? "error" : "success"].main, 0.15),
                                    transition: "transform 0.15s ease, background-color 0.2s ease",
                                    "&:hover": {
                                        bgcolor: (theme) => alpha(theme.palette[direction === "i_paid" ? "error" : "success"].main, 0.25),
                                        transform: "scale(1.08)",
                                    },
                                }}
                            >
                                <EastIcon
                                    sx={{
                                        fontSize: 30,
                                        color: amountColor,
                                        transform: direction === "they_paid" ? "rotate(180deg)" : "rotate(0deg)",
                                        transition: "transform 0.25s ease",
                                    }}
                                />
                            </IconButton>
                        </Tooltip>
                        {counterparty ? (
                            <PersonStack avatar={counterparty.avatar} name={counterparty.username} />
                        ) : (
                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.25, minWidth: 0, flex: 1 }}>
                                <Avatar sx={{ width: 34, height: 34, bgcolor: "action.disabledBackground" }}>?</Avatar>
                                <Typography variant="caption" noWrap sx={{ maxWidth: "100%", color: "text.disabled" }}>
                                    Select member
                                </Typography>
                            </Box>
                        )}
                    </Box>
                    <Typography variant="caption" color="text.disabled" sx={{ display: "block", textAlign: "center", mt: 0.5 }}>
                        {direction === "i_paid" ? "You paid them" : "They paid you"} — tap the arrow to flip
                    </Typography>
                </Box>

                <FormControl fullWidth>
                    <InputLabel>With</InputLabel>
                    <Select
                        value={counterpartyId}
                        label="With"
                        onChange={(e) => setCounterpartyId(e.target.value)}
                        renderValue={(val) => {
                            const m = otherMembers.find((mem) => mem.user_id === val);
                            if (!m) return "";
                            return (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    <Avatar src={m.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                                        {m.username[0]?.toUpperCase()}
                                    </Avatar>
                                    <Typography variant="body2">{m.username}</Typography>
                                </Box>
                            );
                        }}
                    >
                        {otherMembers.map((member) => (
                            <MenuItem key={member.user_id} value={member.user_id}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    <Avatar src={member.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                                        {member.username[0]?.toUpperCase()}
                                    </Avatar>
                                    <Typography variant="body2">{member.username}</Typography>
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <Box sx={{ display: "flex", gap: 2 }}>
                    <FormControl sx={{ flex: 1 }}>
                        <InputLabel>Currency</InputLabel>
                        <Select value={currency} label="Currency" onChange={(e) => setCurrency(e.target.value)} MenuProps={STABLE_CURRENCY_MENU_PROPS}>
                            {currencyOptions.map((c) => (
                                <MenuItem key={c} value={c}>{c} ({getCurrencySymbol(c)})</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        label="Amount"
                        value={amount}
                        onChange={(e) => {
                            const v = sanitizeAmount(e.target.value);
                            if (v !== null) setAmount(v);
                        }}
                        onBlur={() => {
                            const n = parseFloat(amount);
                            if (!isNaN(n)) setAmount(n.toFixed(2));
                        }}
                        slotProps={{ htmlInput: { inputMode: "decimal" }, inputLabel: { shrink: true } }}
                        sx={{ flex: 1 }}
                    />
                </Box>

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
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
                <Button
                    fullWidth
                    variant="contained"
                    color="success"
                    startIcon={<CheckIcon />}
                    disabled={!isValid || isSettling}
                    loading={isSettling}
                    onClick={handleCreate}
                >
                    Record Settlement
                </Button>
            </DialogActions>
        </Dialog>
    );
}
