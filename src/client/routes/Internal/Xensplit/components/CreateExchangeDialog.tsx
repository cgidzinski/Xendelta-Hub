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
    Paper,
    Stepper,
    Step,
    StepLabel,
    Divider,
    useMediaQuery,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import CheckIcon from "@mui/icons-material/Check";
import type { XenSplitMember, CreateExchangeInput } from "../../../../hooks/xensplit/types";
import { sanitizeAmount, getGroupCurrencies, getCurrencySymbol, formatCurrency, getPreferredRateCurrency, setPreferredRateCurrency, resolveRateBase, formatRate } from "../../../../utils/currencyUtils";

interface CreateExchangeDialogProps {
    open: boolean;
    onClose: () => void;
    members: XenSplitMember[];
    currentUser: { id: string; username: string; avatar?: string | null };
    defaultCurrency?: string;
    secondaryCurrencies?: string[];
    groupId: string;
    addExchange: (input: CreateExchangeInput, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => void;
    isAddingExchange: boolean;
}

const STEPS = ["Parties", "Amounts", "Summary"];

export default function CreateExchangeDialog({
    open,
    onClose,
    members,
    currentUser,
    defaultCurrency,
    secondaryCurrencies,
    groupId,
    addExchange,
    isAddingExchange,
}: CreateExchangeDialogProps) {
    const { enqueueSnackbar } = useSnackbar();
    const isMobile = useMediaQuery("(max-width:600px)");

    const [step, setStep] = useState(0);
    const [partyAId, setPartyAId] = useState(currentUser.id);
    const [currencyA, setCurrencyA] = useState(defaultCurrency ?? "CAD");
    const [amountA, setAmountA] = useState("");
    const [amountB, setAmountB] = useState("");
    const [partyBId, setPartyBId] = useState("");
    const [currencyB, setCurrencyB] = useState(secondaryCurrencies?.[0] ?? ((defaultCurrency ?? "CAD") === "CAD" ? "USD" : "CAD"));
    const [rate, setRate] = useState("");
    // rateInput is the string shown in the TextField; it may be in the inverted direction.
    // rate (canonical) is always 1 currencyA = rate currencyB.
    const [rateInput, setRateInput] = useState("");
    // preferred is the user's chosen base currency for the rate display, stored per group.
    const [preferred, setPreferred] = useState(() => getPreferredRateCurrency(groupId, defaultCurrency ?? "CAD"));
    const [note, setNote] = useState("");
    // Tracks the order in which the user manually edited the 3 amount fields.
    // The field NOT in the last 2 entries is always auto-computed from the other two.
    const [editOrder, setEditOrder] = useState<Array<"amountA" | "amountB" | "rate">>([]);

    // Derived: whether the rate field is currently displayed as inverted (base = currencyB).
    const inverted = resolveRateBase(currencyA, currencyB, preferred, defaultCurrency ?? "CAD") === "b";

    useEffect(() => {
        if (open) {
            setStep(0);
            setPartyAId(currentUser.id);
            setCurrencyA(defaultCurrency ?? "CAD");
            setAmountA("");
            setAmountB("");
            setPartyBId("");
            setCurrencyB(secondaryCurrencies?.[0] ?? ((defaultCurrency ?? "CAD") === "CAD" ? "USD" : "CAD"));
            setRate("");
            setRateInput("");
            setPreferred(getPreferredRateCurrency(groupId, defaultCurrency ?? "CAD"));
            setNote("");
            setEditOrder([]);
        }
    }, [open, defaultCurrency, currentUser.id, groupId]);

    // Re-sync rateInput whenever the display direction changes (e.g. user swaps currencies in step 1).
    useEffect(() => {
        const n = parseFloat(rate);
        if (!isNaN(n) && n > 0) {
            const displayVal = inverted
                ? parseFloat((1 / n).toFixed(6)).toString()
                : parseFloat(n.toFixed(6)).toString();
            setRateInput(displayVal);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inverted]);

    const amountANum = parseFloat(amountA);
    const amountBNum = parseFloat(amountB);
    const rateNum = parseFloat(rate);

    const allAmountFields = ["amountA", "amountB", "rate"] as const;

    const handleFieldEdit = (field: "amountA" | "amountB" | "rate", rawValue: string) => {
        const newOrder = [...editOrder.filter((f) => f !== field), field];
        setEditOrder(newOrder);

        // Build the new values map with the just-typed value applied
        const vals = {
            amountA: field === "amountA" ? rawValue : amountA,
            amountB: field === "amountB" ? rawValue : amountB,
            // rawValue for rate is always canonical (1 A = rate B)
            rate: field === "rate" ? rawValue : rate,
        };

        if (field === "amountA") setAmountA(rawValue);
        else if (field === "amountB") setAmountB(rawValue);
        else setRate(rawValue);

        // Determine which field to auto-compute
        if (newOrder.length >= 2) {
            const computed = allAmountFields.find((f) => !newOrder.slice(-2).includes(f));
            const a = parseFloat(vals.amountA);
            const b = parseFloat(vals.amountB);
            const r = parseFloat(vals.rate);

            if (computed === "amountB" && !isNaN(a) && !isNaN(r) && a > 0 && r > 0) {
                setAmountB((a * r).toFixed(2));
            } else if (computed === "amountA" && !isNaN(b) && !isNaN(r) && b > 0 && r > 0) {
                setAmountA((b / r).toFixed(2));
            } else if (computed === "rate" && !isNaN(a) && !isNaN(b) && a > 0 && b > 0) {
                const canonicalRate = parseFloat((b / a).toFixed(6));
                setRate(canonicalRate.toString());
                // Sync the visible input to the current display direction
                const displayRate = inverted
                    ? parseFloat((1 / canonicalRate).toFixed(6))
                    : canonicalRate;
                setRateInput(displayRate.toString());
            }
        }
    };

    const handleRateInvert = () => {
        // Flip the base to whichever currency is not currently the base.
        const next = inverted ? currencyA : currencyB;
        setPreferred(next);
        setPreferredRateCurrency(groupId, next);
        // rateInput will be re-synced by the inverted effect.
    };

    const partyA = members.find((m) => m.user_id === partyAId);
    const partyB = members.find((m) => m.user_id === partyBId);

    const step1Valid = !!partyAId && !!partyBId && partyAId !== partyBId && currencyA !== currencyB;
    const allAmountsProvided = amountANum > 0 && amountBNum > 0 && rateNum > 0;
    const expectedAmountB = amountANum * rateNum;
    const mathTolerance = Math.max(0.01, expectedAmountB * 0.01);
    const mathValid = !allAmountsProvided || Math.abs(expectedAmountB - amountBNum) <= mathTolerance;
    const step2Valid = allAmountsProvided && mathValid;
    const isValid = step1Valid && step2Valid;

    const handleCreate = () => {
        if (!isValid) return;
        addExchange(
            {
                party_a: partyAId,
                currency_a: currencyA,
                amount_a: amountANum,
                party_b: partyBId,
                currency_b: currencyB,
                rate: rateNum,
                rate_from_currency: inverted ? currencyB : currencyA,
                ...(note.trim() ? { note: note.trim() } : {}),
            },
            {
                onSuccess: () => {
                    enqueueSnackbar("Exchange recorded!", { variant: "success" });
                    onClose();
                },
                onError: (error: Error) => {
                    enqueueSnackbar(error?.message || "Failed to record exchange", { variant: "error" });
                },
            }
        );
    };

    const MemberChips = ({
        selectedId,
        disabledId,
        onSelect,
    }: {
        selectedId: string;
        disabledId: string;
        onSelect: (id: string) => void;
    }) => (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {members.map((m) => {
                const isSelected = m.user_id === selectedId;
                const isDisabled = m.user_id === disabledId;
                return (
                    <Box
                        key={m.user_id}
                        onClick={() => !isDisabled && onSelect(isSelected ? "" : m.user_id)}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            px: 2,
                            py: 1,
                            borderRadius: 2,
                            cursor: isDisabled ? "not-allowed" : "pointer",
                            bgcolor: "action.hover",
                            color: isDisabled ? "text.disabled" : "text.primary",
                            border: isSelected ? "2px solid" : "2px solid transparent",
                            borderColor: isSelected ? "primary.main" : "transparent",
                            opacity: isDisabled ? 0.4 : 1,
                            transition: "all 0.2s",
                        }}
                    >
                        <Avatar src={m.avatar || undefined} sx={{ width: 24, height: 24, fontSize: 12 }}>
                            {m.username[0]?.toUpperCase()}
                        </Avatar>
                        <Typography variant="caption">{m.username}</Typography>
                    </Box>
                );
            })}
        </Box>
    );

    return (
        <Dialog fullWidth maxWidth="xs" fullScreen={isMobile} open={open} onClose={onClose} PaperProps={{ sx: { borderRadius: isMobile ? 0 : 3 } }}>
            <Box sx={{ position: "relative", pt: 3, pb: 1, px: 3, textAlign: "center" }}>
                <IconButton onClick={onClose} size="small" sx={{ position: "absolute", top: 12, right: 12 }}>
                    <CloseIcon fontSize="small" />
                </IconButton>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Currency Exchange
                </Typography>
            </Box>

            <DialogContent sx={{ px: 3, pt: 1.5, pb: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                <Stepper activeStep={step} alternativeLabel sx={{ mb: 0.5 }}>
                    {STEPS.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {/* Step 1: Parties */}
                {step === 0 && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
                        {/* Party A */}
                        <Box>
                            <MemberChips selectedId={partyAId} disabledId={partyBId} onSelect={setPartyAId} />
                        </Box>

                        {/* Currency A */}
                        <FormControl fullWidth size="small">
                            <InputLabel id="exchange-currency-a-label">Gives</InputLabel>
                            <Select labelId="exchange-currency-a-label" label="Gives" value={currencyA} onChange={(e) => setCurrencyA(e.target.value)}>
                                {getGroupCurrencies(defaultCurrency, secondaryCurrencies, currencyA).map((c) => (
                                    <MenuItem key={c} value={c}>
                                        {c} ({getCurrencySymbol(c)})
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Divider>
                            <IconButton
                                size="small"
                                onClick={() => {
                                    const tmp = currencyA;
                                    setCurrencyA(currencyB);
                                    setCurrencyB(tmp);
                                }}
                                title="Swap currencies"
                                sx={{
                                    bgcolor: "action.selected",
                                    border: "1px solid",
                                    borderColor: "divider",
                                    "&:hover": { bgcolor: "action.hover" },
                                }}
                            >
                                <SwapVertIcon fontSize="small" />
                            </IconButton>
                        </Divider>

                        {/* Party B */}
                        <Box>
                            <MemberChips selectedId={partyBId} disabledId={partyAId} onSelect={setPartyBId} />
                        </Box>

                        {/* Currency B */}
                        <FormControl fullWidth size="small">
                            <InputLabel id="exchange-currency-b-label">Gives</InputLabel>
                            <Select labelId="exchange-currency-b-label" label="Gives" value={currencyB} onChange={(e) => setCurrencyB(e.target.value)}>
                                {getGroupCurrencies(defaultCurrency, secondaryCurrencies, currencyB).map((c) => (
                                    <MenuItem key={c} value={c}>
                                        {c} ({getCurrencySymbol(c)})
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        {partyAId && partyBId && partyAId === partyBId && (
                            <Typography variant="caption" color="error">Party A and Party B must be different members.</Typography>
                        )}
                        {currencyA && currencyB && currencyA === currencyB && (
                            <Typography variant="caption" color="error">Currency A and Currency B must be different.</Typography>
                        )}
                    </Box>
                )}

                {/* Step 2: Amounts */}
                {step === 1 && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5 }}>
                            <Avatar src={partyA?.avatar || undefined} sx={{ width: 32, height: 32 }}>
                                {partyA?.username[0]?.toUpperCase()}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                                    {partyA?.username}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Gives {currencyA}
                                </Typography>
                            </Box>
                            <IconButton
                                size="small"
                                onClick={() => {
                                    // Swap currencies
                                    setCurrencyA(currencyB);
                                    setCurrencyB(currencyA);
                                    // Swap amounts
                                    setAmountA(amountB);
                                    setAmountB(amountA);
                                    // Invert the canonical rate (1 A = rate B becomes 1 B = rate A, i.e. 1 newA = 1/rate newB)
                                    const newCanonical = rateNum > 0 ? 1 / rateNum : NaN;
                                    if (!isNaN(newCanonical) && newCanonical > 0) {
                                        setRate(newCanonical.toFixed(10));
                                        // Re-sync rateInput using the new currencies + unchanged preferred
                                        const newInverted = resolveRateBase(currencyB, currencyA, preferred, defaultCurrency ?? "CAD") === "b";
                                        setRateInput(newInverted
                                            ? parseFloat((1 / newCanonical).toFixed(6)).toString()
                                            : parseFloat(newCanonical.toFixed(6)).toString()
                                        );
                                    }
                                    // Reset edit order so auto-compute doesn't clobber the freshly swapped values
                                    setEditOrder([]);
                                }}
                                sx={{
                                    flexShrink: 0,
                                    color: "text.secondary",
                                    bgcolor: "action.selected",
                                    border: "1px solid",
                                    borderColor: "divider",
                                    "&:hover": { bgcolor: "action.hover" },
                                }}
                                title="Swap parties and currencies"
                            >
                                <SwapHorizIcon sx={{ fontSize: 20 }} />
                            </IconButton>
                            <Box sx={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                                    {partyB?.username}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Gives {currencyB}
                                </Typography>
                            </Box>
                            <Avatar src={partyB?.avatar || undefined} sx={{ width: 32, height: 32 }}>
                                {partyB?.username[0]?.toUpperCase()}
                            </Avatar>
                        </Box>

                        <TextField
                            label={`${partyA?.username ?? "Party A"}'s amount (${currencyA})`}
                            fullWidth
                            value={amountA}
                            onChange={(e) => {
                                const v = sanitizeAmount(e.target.value);
                                if (v !== null) handleFieldEdit("amountA", v);
                            }}
                            onBlur={() => {
                                const n = parseFloat(amountA);
                                if (!isNaN(n)) setAmountA(n.toFixed(2));
                            }}
                            slotProps={{ htmlInput: { inputMode: "decimal" }, inputLabel: { shrink: true } }}
                            helperText={undefined}
                            sx={undefined}
                        />

                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                            <TextField
                                label="Exchange Rate"
                                fullWidth
                                value={rateInput}
                                onChange={(e) => {
                                    const v = sanitizeAmount(e.target.value);
                                    if (v === null) return;
                                    setRateInput(v);
                                    const parsed = parseFloat(v);
                                    if (!isNaN(parsed) && parsed > 0) {
                                        const canonical = inverted
                                            ? parseFloat((1 / parsed).toFixed(10)).toString()
                                            : v;
                                        handleFieldEdit("rate", canonical);
                                    } else {
                                        handleFieldEdit("rate", v);
                                    }
                                }}
                                onBlur={() => {
                                    const n = parseFloat(rateInput);
                                    if (!isNaN(n)) setRateInput(parseFloat(n.toFixed(6)).toString());
                                }}
                                slotProps={{
                                    htmlInput: { inputMode: "decimal" },
                                    inputLabel: { shrink: true },
                                }}
                                helperText={inverted ? `1 ${currencyB} = ? ${currencyA}` : `1 ${currencyA} = ? ${currencyB}`}
                                sx={undefined}
                            />
                            <IconButton
                                onClick={handleRateInvert}
                                tabIndex={-1}
                                title="Invert rate direction"
                                sx={{
                                    mt: 1,
                                    flexShrink: 0,
                                    bgcolor: "action.selected",
                                    border: "1px solid",
                                    borderColor: "divider",
                                    "&:hover": { bgcolor: "action.hover" },
                                }}
                            >
                                <SwapVertIcon fontSize="small" />
                            </IconButton>
                        </Box>

                        <TextField
                            label={`${partyB?.username ?? "Party B"}'s amount (${currencyB})`}
                            fullWidth
                            value={amountB}
                            onChange={(e) => {
                                const v = sanitizeAmount(e.target.value);
                                if (v !== null) handleFieldEdit("amountB", v);
                            }}
                            onBlur={() => {
                                const n = parseFloat(amountB);
                                if (!isNaN(n)) setAmountB(n.toFixed(2));
                            }}
                            slotProps={{ htmlInput: { inputMode: "decimal" }, inputLabel: { shrink: true } }}
                            helperText={undefined}
                            sx={undefined}
                        />

                        {allAmountsProvided && !mathValid && (
                            <Typography variant="caption" color="error">
                                The amounts don&apos;t match the exchange rate. Expected{" "}
                                {formatCurrency(expectedAmountB, currencyB)} for {partyB?.username ?? "Party B"}.
                            </Typography>
                        )}

                    </Box>
                )}

                {/* Step 3: Summary */}
                {step === 2 && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ textAlign: "center" }}>
                            Review the exchange before confirming
                        </Typography>

                        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
                            {/* Party A side */}
                            <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, py: 2 }}>
                                <Avatar src={partyA?.avatar || undefined} sx={{ width: 40, height: 40 }}>
                                    {partyA?.username[0]?.toUpperCase()}
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {partyA?.username}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Party A
                                    </Typography>
                                </Box>
                                <Box sx={{ textAlign: "right" }}>
                                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                                        {formatCurrency(amountANum, currencyA)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {currencyA}
                                    </Typography>
                                </Box>
                            </Box>

                            <Divider>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1 }}>
                                    <SwapHorizIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                                    <Typography variant="caption" color="text.secondary">
                                        {formatRate(currencyA, currencyB, rateNum, preferred, defaultCurrency ?? "CAD")}
                                    </Typography>
                                </Box>
                            </Divider>

                            {/* Party B side */}
                            <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2.5, py: 2 }}>
                                <Avatar src={partyB?.avatar || undefined} sx={{ width: 40, height: 40 }}>
                                    {partyB?.username[0]?.toUpperCase()}
                                </Avatar>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {partyB?.username}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Party B
                                    </Typography>
                                </Box>
                                <Box sx={{ textAlign: "right" }}>
                                    <Typography variant="body1" sx={{ fontWeight: 700 }}>
                                        {amountBNum > 0 ? formatCurrency(amountBNum, currencyB) : "—"}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {currencyB}
                                    </Typography>
                                </Box>
                            </Box>
                        </Paper>

                        {/* What each party owes */}
                        <Paper variant="outlined" sx={{ px: 2, py: 1.5, borderRadius: 2 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                                Settlement
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                                <Typography variant="body2">
                                    <strong>{partyA?.username}</strong> owes <strong>{partyB?.username}</strong>{" "}
                                    <strong>{formatCurrency(amountANum, currencyA)}</strong>
                                </Typography>
                                {amountBNum > 0 && (
                                    <Typography variant="body2">
                                        <strong>{partyB?.username}</strong> owes <strong>{partyA?.username}</strong>{" "}
                                        <strong>{formatCurrency(amountBNum, currencyB)}</strong>
                                    </Typography>
                                )}
                            </Box>
                        </Paper>

                        <TextField
                            label="Note (optional)"
                            fullWidth
                            size="small"
                            multiline
                            rows={2}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            inputProps={{ maxLength: 500 }}
                        />
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, pt: 0, display: "flex", justifyContent: "space-between" }}>
                <Button
                    variant="outlined"
                    sx={{ visibility: step === 0 ? "hidden" : "visible" }}
                    onClick={() => setStep((s) => s - 1)}
                >
                    Back
                </Button>

                {step < 2 ? (
                    <Button
                        variant="contained"
                        disabled={step === 0 ? !step1Valid : !step2Valid}
                        onClick={() => setStep((s) => s + 1)}
                    >
                        Next
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        startIcon={<CheckIcon />}
                        disabled={!isValid || isAddingExchange}
                        loading={isAddingExchange}
                        onClick={handleCreate}
                    >
                        Record Exchange
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
