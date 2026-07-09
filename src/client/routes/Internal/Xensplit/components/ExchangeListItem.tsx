import {
    Box,
    Typography,
    Avatar,
    Dialog,
    DialogContent,
    DialogActions,
    Button,
    IconButton,
    Divider,
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import { useState } from "react";
import { formatCurrency } from "../../../../utils/currencyUtils";
import type { XenSplitExchange, XenSplitMember } from "../../../../hooks/xensplit/types";
import { xsCardSx } from "./rowStyles";

/** Returns "1 X = N Y" respecting the user's global rate direction preference. */
function formatRate(exchange: XenSplitExchange, inverted: boolean): string {
    const { currency_a, currency_b, rate } = exchange;
    if (inverted) {
        return `1 ${currency_b} = ${parseFloat((1 / rate).toFixed(6))} ${currency_a}`;
    }
    return `1 ${currency_a} = ${parseFloat(rate.toFixed(6))} ${currency_b}`;
}

interface ExchangeListItemProps {
    exchange: XenSplitExchange;
    members: XenSplitMember[];
    currentUserId: string;
    canDelete: boolean;
    onDelete: (exchangeId: string) => void;
    isDeletingExchange: boolean;
}

export default function ExchangeListItem({
    exchange,
    members,
    currentUserId,
    canDelete,
    onDelete,
    isDeletingExchange,
}: ExchangeListItemProps) {
    const [open, setOpen] = useState(false);

    const partyA = members.find((m) => m.user_id === exchange.party_a);
    const partyB = members.find((m) => m.user_id === exchange.party_b);

    const isInvolved = exchange.party_a === currentUserId || exchange.party_b === currentUserId;
    const [rateInverted, setRateInverted] = useState(() => localStorage.getItem("xensplit_rateInverted") === "true");

    const handleRateInvert = () => {
        const next = !rateInverted;
        setRateInverted(next);
        localStorage.setItem("xensplit_rateInverted", String(next));
    };

    return (
        <>
            <Box
                onClick={() => setOpen(true)}
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
                {/* Overlapping avatars with SwapHoriz badge — mirrors settlement row */}
                <Box sx={{ position: "relative", width: 40, height: 40 }}>
                    <Avatar
                        src={partyA?.avatar || undefined}
                        sx={{ position: "absolute", top: 0, left: 0, width: 26, height: 26, fontSize: "0.6875rem", zIndex: 1 }}
                    >
                        {partyA?.username?.[0]?.toUpperCase() ?? "?"}
                    </Avatar>
                    <Avatar
                        src={partyB?.avatar || undefined}
                        sx={{ position: "absolute", bottom: 0, right: 0, width: 26, height: 26, fontSize: "0.6875rem" }}
                    >
                        {partyB?.username?.[0]?.toUpperCase() ?? "?"}
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
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {partyA?.username ?? "?"} ↔ {partyB?.username ?? "?"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        Exchange · {exchange.currency_a}/{exchange.currency_b}
                    </Typography>
                </Box>

                <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "flex-end" }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isInvolved ? "primary.main" : "text.primary", lineHeight: 1.3, whiteSpace: "nowrap" }}>
                            {formatCurrency(exchange.amount_a, exchange.currency_a)}
                        </Typography>
                        <SwapHorizIcon sx={{ fontSize: 13, color: isInvolved ? "primary.main" : "text.disabled", flexShrink: 0 }} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isInvolved ? "primary.main" : "text.primary", lineHeight: 1.3, whiteSpace: "nowrap" }}>
                            {formatCurrency(exchange.amount_b, exchange.currency_b)}
                        </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                        {formatRate(exchange, rateInverted)}
                    </Typography>
                </Box>
            </Box>

            {/* Detail/delete dialog */}
            <Dialog fullWidth maxWidth="xs" open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { borderRadius: 3 } }}>
                <Box sx={{ position: "relative", pt: 3, pb: 1, px: 3, textAlign: "center" }}>
                    <IconButton onClick={() => setOpen(false)} size="small" sx={{ position: "absolute", top: 12, right: 12 }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                    <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
                        <Box sx={{ width: 48, height: 48, borderRadius: "50%", bgcolor: "primary.main", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <SwapHorizIcon sx={{ color: "primary.contrastText", fontSize: 28 }} />
                        </Box>
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>Currency Exchange</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {new Date(exchange.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </Typography>
                </Box>

                <DialogContent sx={{ px: 3, pt: 1.5, pb: 2 }}>
                    {/* Party A leg */}
                    <Box sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.25, mb: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <Avatar src={partyA?.avatar || undefined} sx={{ width: 32, height: 32, flexShrink: 0 }}>
                                {partyA?.username?.[0]?.toUpperCase()}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Party A owes Party B</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{partyA?.username ?? "?"}</Typography>
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: "error.main", flexShrink: 0 }}>
                                -{formatCurrency(exchange.amount_a, exchange.currency_a)}
                            </Typography>
                        </Box>
                    </Box>

                    {/* Party B leg */}
                    <Box sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.25, mb: 1.5 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <Avatar src={partyB?.avatar || undefined} sx={{ width: 32, height: 32, flexShrink: 0 }}>
                                {partyB?.username?.[0]?.toUpperCase()}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>Party B owes Party A</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{partyB?.username ?? "?"}</Typography>
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: "error.main", flexShrink: 0 }}>
                                -{formatCurrency(exchange.amount_b, exchange.currency_b)}
                            </Typography>
                        </Box>
                    </Box>

                    <Divider sx={{ my: 1 }} />

                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">Rate</Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                                {formatRate(exchange, rateInverted)}
                            </Typography>
                            <IconButton size="small" onClick={handleRateInvert} title="Invert rate direction" sx={{ p: 0.25 }}>
                                <SwapVertIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                            </IconButton>
                        </Box>
                    </Box>

                    {exchange.note && (
                        <Box sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.25, mt: 1.5 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.25 }}>Note</Typography>
                            <Typography variant="body2">{exchange.note}</Typography>
                        </Box>
                    )}
                </DialogContent>

                {canDelete && (
                    <DialogActions sx={{ px: 3, pb: 2.5, pt: 0 }}>
                        <Button
                            fullWidth
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteIcon />}
                            disabled={isDeletingExchange}
                            loading={isDeletingExchange}
                            onClick={() => {
                                if (window.confirm("Delete this exchange? This cannot be undone.")) {
                                    onDelete(exchange._id);
                                    setOpen(false);
                                }
                            }}
                        >
                            Delete Exchange
                        </Button>
                    </DialogActions>
                )}
            </Dialog>
        </>
    );
}
