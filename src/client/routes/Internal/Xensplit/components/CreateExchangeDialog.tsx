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
    StepButton,
    Divider,
    useMediaQuery,
    ToggleButtonGroup,
    ToggleButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import CheckIcon from "@mui/icons-material/Check";
import type { XenSplitMember, CreateExchangeInput } from "../../../../hooks/xensplit/types";
import { sanitizeAmount, getGroupCurrencies, getCurrencySymbol, formatCurrency, getPreferredRateCurrency, setPreferredRateCurrency, resolveRateBase, formatRate, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";
import { MemberSelect } from "./MemberSelect";

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
    fetchLiveRate: (input: { from: string; to: string }) => Promise<{ rate: number }>;
    isFetchingLiveRate: boolean;
}

const STEPS = ["Parties", "Rate", "Amounts", "Summary"];

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
    fetchLiveRate,
    isFetchingLiveRate,
}: CreateExchangeDialogProps) {
    const { enqueueSnackbar } = useSnackbar();
    const isMobile = useMediaQuery("(max-width:600px)");

    const [step, setStep] = useState(0);
    // The furthest step reached this session — lets the stepper allow navigating back to any
    // previously visited step even after moving on, without allowing skipping ahead to unvisited ones.
    const [maxStepReached, setMaxStepReached] = useState(0);
    const [partyAId, setPartyAId] = useState(currentUser.id);
    const [currencyA, setCurrencyA] = useState(defaultCurrency ?? "CAD");
    const [amountA, setAmountA] = useState("");
    const [amountB, setAmountB] = useState("");
    const [partyBId, setPartyBId] = useState("");
    const [currencyB, setCurrencyB] = useState(secondaryCurrencies?.[0] ?? ((defaultCurrency ?? "CAD") === "CAD" ? "USD" : "CAD"));
    // The exchange rate, established on the Rate step — canonical 1 currencyA = rateNum currencyB.
    const [rateNum, setRateNum] = useState(NaN);
    // The two Rate-step boxes; their currencies flip with `inverted`.
    const [previewLeft, setPreviewLeft] = useState("1");
    const [previewRight, setPreviewRight] = useState("");
    // preferred is the user's chosen base currency for the rate display, stored per group.
    const [preferred, setPreferred] = useState(() => getPreferredRateCurrency(groupId, defaultCurrency ?? "CAD"));
    const [note, setNote] = useState("");
    // Which rate source the user has selected on the Rate step — null until they pick one, so nothing autofills.
    const [rateMode, setRateMode] = useState<"live" | "cash" | null>(null);

    // Derived: whether the rate field is currently displayed as inverted (base = currencyB).
    const inverted = resolveRateBase(currencyA, currencyB, preferred, defaultCurrency ?? "CAD") === "b";

    useEffect(() => {
        if (open) {
            setStep(0);
            setMaxStepReached(0);
            setPartyAId(currentUser.id);
            setCurrencyA(defaultCurrency ?? "CAD");
            setAmountA("");
            setAmountB("");
            setPartyBId("");
            setCurrencyB(secondaryCurrencies?.[0] ?? ((defaultCurrency ?? "CAD") === "CAD" ? "USD" : "CAD"));
            setRateNum(NaN);
            setPreviewLeft("1");
            setPreviewRight("");
            setPreferred(getPreferredRateCurrency(groupId, defaultCurrency ?? "CAD"));
            setNote("");
            setRateMode(null);
        }
    }, [open, defaultCurrency, currentUser.id, groupId]);

    useEffect(() => {
        setMaxStepReached((m) => Math.max(m, step));
    }, [step]);

    // Whenever the Rate step becomes active, refresh its two boxes from the canonical rate —
    // catches cases where the rate changed elsewhere (e.g. the currency swap on the Amounts step)
    // without fighting the user's live typing while they're actually on this step.
    useEffect(() => {
        if (step !== 1) return;
        if (!isNaN(rateNum) && rateNum > 0) {
            setPreviewLeft("1");
            setPreviewRight(parseFloat((inverted ? 1 / rateNum : rateNum).toFixed(6)).toString());
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    const amountANum = parseFloat(amountA);
    const amountBNum = parseFloat(amountB);

    // Recomputes rateNum from the Rate step's two boxes — called on blur.
    const commitRate = (left: string, right: string) => {
        const l = parseFloat(left);
        const r = parseFloat(right);
        if (isNaN(l) || isNaN(r) || l <= 0 || r <= 0) {
            setRateNum(NaN);
            return;
        }
        setRateNum(inverted ? l / r : r / l);
    };

    const handleRateInvert = () => {
        // Flip the base to whichever currency is not currently the base.
        const next = inverted ? currencyA : currencyB;
        setPreferred(next);
        setPreferredRateCurrency(groupId, next);
        // Resync the boxes to the new direction immediately, without waiting for a re-render.
        const newInverted = resolveRateBase(currencyA, currencyB, next, defaultCurrency ?? "CAD") === "b";
        if (!isNaN(rateNum) && rateNum > 0) {
            setPreviewLeft("1");
            setPreviewRight(parseFloat((newInverted ? 1 / rateNum : rateNum).toFixed(6)).toString());
        }
    };

    const partyA = members.find((m) => m.user_id === partyAId);
    const partyB = members.find((m) => m.user_id === partyBId);

    const step1Valid = !!partyAId && !!partyBId && partyAId !== partyBId && currencyA !== currencyB;
    const stepRateValid = !isNaN(rateNum) && rateNum > 0;
    const stepAmountsValid = amountANum > 0 && amountBNum > 0;
    const isValid = step1Valid && stepRateValid && stepAmountsValid;

    const stepsValid = [step1Valid, stepRateValid, stepAmountsValid, true];
    const stepValid = stepsValid[step];
    // Can only jump to a step via the stepper if it's already been visited.
    const canGoToStep = (index: number) => index <= maxStepReached;

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
                    {STEPS.map((label, index) => (
                        <Step key={label} completed={index < STEPS.length - 1 && stepsValid[index] && index !== step}>
                            <StepButton disabled={!canGoToStep(index)} onClick={() => setStep(index)}>
                                {label}
                            </StepButton>
                        </Step>
                    ))}
                </Stepper>

                {/* Step 1: Parties */}
                {step === 0 && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {/* Party A */}
                        <MemberSelect members={members} label="Party A" value={partyAId} excludeId={partyBId} onChange={setPartyAId} />

                        {/* Currency A */}
                        <FormControl fullWidth>
                            <InputLabel id="exchange-currency-a-label">Gives</InputLabel>
                            <Select labelId="exchange-currency-a-label" label="Gives" value={currencyA} onChange={(e) => setCurrencyA(e.target.value)} MenuProps={STABLE_CURRENCY_MENU_PROPS}>
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
                        <MemberSelect members={members} label="Party B" value={partyBId} excludeId={partyAId} onChange={setPartyBId} />

                        {/* Currency B */}
                        <FormControl fullWidth>
                            <InputLabel id="exchange-currency-b-label">Gives</InputLabel>
                            <Select labelId="exchange-currency-b-label" label="Gives" value={currencyB} onChange={(e) => setCurrencyB(e.target.value)} MenuProps={STABLE_CURRENCY_MENU_PROPS}>
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

                {/* Step 2: Rate */}
                {step === 1 && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                            Set the exchange rate between {currencyA} and {currencyB}.
                        </Typography>

                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                            <TextField
                                label={inverted ? currencyB : currencyA}
                                fullWidth
                                value={previewLeft}
                                onChange={(e) => {
                                    const v = sanitizeAmount(e.target.value);
                                    if (v === null) return;
                                    setPreviewLeft(v);
                                    commitRate(v, previewRight);
                                }}
                                onBlur={() => {
                                    const n = parseFloat(previewLeft);
                                    if (!isNaN(n)) setPreviewLeft(parseFloat(n.toFixed(6)).toString());
                                }}
                                slotProps={{ htmlInput: { inputMode: "decimal" }, inputLabel: { shrink: true } }}
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
                                <SwapHorizIcon fontSize="small" />
                            </IconButton>
                            <TextField
                                label={inverted ? currencyA : currencyB}
                                fullWidth
                                value={previewRight}
                                onChange={(e) => {
                                    const v = sanitizeAmount(e.target.value);
                                    if (v === null) return;
                                    setPreviewRight(v);
                                    commitRate(previewLeft, v);
                                }}
                                onBlur={() => {
                                    const n = parseFloat(previewRight);
                                    if (!isNaN(n)) setPreviewRight(parseFloat(n.toFixed(6)).toString());
                                }}
                                slotProps={{ htmlInput: { inputMode: "decimal" }, inputLabel: { shrink: true } }}
                            />
                        </Box>

                        <ToggleButtonGroup
                            exclusive
                            value={rateMode}
                            onChange={async (_, v) => {
                                if (!v) return;
                                setRateMode(v);
                                if (v === "live") {
                                    try {
                                        const { rate } = await fetchLiveRate({ from: currencyA, to: currencyB });
                                        setRateNum(rate);
                                        setPreviewLeft("1");
                                        setPreviewRight(parseFloat((inverted ? 1 / rate : rate).toFixed(6)).toString());
                                    } catch (e) {
                                        enqueueSnackbar(e instanceof Error ? e.message : "Failed to fetch live rate", { variant: "error" });
                                    }
                                } else {
                                    // No live source for cash rate — clear the boxes for manual entry.
                                    setRateNum(NaN);
                                    setPreviewLeft("1");
                                    setPreviewRight("");
                                }
                            }}
                            sx={{ alignSelf: "center" }}
                        >
                            <ToggleButton value="live" disabled={isFetchingLiveRate} sx={{ px: 2, fontSize: "0.75rem", textTransform: "none" }}>
                                {isFetchingLiveRate ? "Fetching…" : "Live Rate"}
                            </ToggleButton>
                            <ToggleButton value="cash" sx={{ px: 2, fontSize: "0.75rem", textTransform: "none" }}>
                                Cash Rate
                            </ToggleButton>
                        </ToggleButtonGroup>

                        <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                            Live rate is the ideal exchange rate — cash rate is the more realistic rate you'll get exchanging in person.
                        </Typography>

                        {!isNaN(rateNum) && rateNum > 0 ? (
                            <Typography variant="subtitle1" sx={{ textAlign: "center", fontWeight: 700 }}>
                                {formatRate(currencyA, currencyB, rateNum, preferred, defaultCurrency ?? "CAD")}
                            </Typography>
                        ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                                Enter the rate above to continue
                            </Typography>
                        )}
                    </Box>
                )}

                {/* Step 3: Amounts */}
                {step === 2 && (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {!isNaN(rateNum) && rateNum > 0 && (
                            <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                                {formatRate(currencyA, currencyB, rateNum, preferred, defaultCurrency ?? "CAD")}
                            </Typography>
                        )}

                        {/* Party A: name box, amount field directly underneath */}
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
                        </Box>
                        <TextField
                            label={`Amount (${currencyA})`}
                            fullWidth
                            value={amountA}
                            onChange={(e) => {
                                const v = sanitizeAmount(e.target.value);
                                if (v === null) return;
                                setAmountA(v);
                                const n = parseFloat(v);
                                if (!isNaN(n) && !isNaN(rateNum) && rateNum > 0) {
                                    setAmountB((n * rateNum).toFixed(2));
                                }
                            }}
                            onBlur={() => {
                                const n = parseFloat(amountA);
                                if (!isNaN(n)) setAmountA(n.toFixed(2));
                            }}
                            slotProps={{ htmlInput: { inputMode: "decimal" }, inputLabel: { shrink: true } }}
                        />

                        <Divider>
                            <SwapVertIcon fontSize="small" sx={{ color: "text.disabled" }} />
                        </Divider>

                        {/* Party B: name box, amount field directly underneath */}
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1.5 }}>
                            <Avatar src={partyB?.avatar || undefined} sx={{ width: 32, height: 32 }}>
                                {partyB?.username[0]?.toUpperCase()}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                                    {partyB?.username}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Gives {currencyB}
                                </Typography>
                            </Box>
                        </Box>
                        <TextField
                            label={`Amount (${currencyB})`}
                            fullWidth
                            value={amountB}
                            onChange={(e) => {
                                const v = sanitizeAmount(e.target.value);
                                if (v === null) return;
                                setAmountB(v);
                                const n = parseFloat(v);
                                if (!isNaN(n) && !isNaN(rateNum) && rateNum > 0) {
                                    setAmountA((n / rateNum).toFixed(2));
                                }
                            }}
                            onBlur={() => {
                                const n = parseFloat(amountB);
                                if (!isNaN(n)) setAmountB(n.toFixed(2));
                            }}
                            slotProps={{ htmlInput: { inputMode: "decimal" }, inputLabel: { shrink: true } }}
                        />
                    </Box>
                )}

                {/* Step 4: Summary */}
                {step === 3 && (
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
                        <Paper variant="outlined" sx={{ px: 2, py: 1, borderRadius: 2 }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                                Settlement
                            </Typography>
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                                <Typography variant="caption" color="text.secondary">
                                    <strong>{partyA?.username}</strong> owes <strong>{partyB?.username}</strong>{" "}
                                    <Box component="span" sx={{ color: "common.white", fontWeight: 700 }}>
                                        {formatCurrency(amountANum, currencyA)}
                                    </Box>
                                </Typography>
                                {amountBNum > 0 && (
                                    <Typography variant="caption" color="text.secondary">
                                        <strong>{partyB?.username}</strong> owes <strong>{partyA?.username}</strong>{" "}
                                        <Box component="span" sx={{ color: "common.white", fontWeight: 700 }}>
                                            {formatCurrency(amountBNum, currencyB)}
                                        </Box>
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

                {step < 3 ? (
                    <Button
                        variant="contained"
                        disabled={!stepValid}
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
