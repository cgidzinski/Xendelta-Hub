import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography, ToggleButtonGroup, ToggleButton, useMediaQuery } from "@mui/material";
import { formatCheddar } from "../utils/currency";

export interface SlotSpinResult {
    reels: string[]; // symbol keys - must match the `symbols` prop's keys
    payout: number;
    jackpot?: boolean;
    balance: string;
}

export interface SlotMachineProps {
    symbols: Record<string, string>; // symbol key -> emoji/image for THIS machine
    betOptions: number[]; // THIS machine's denomination buttons
    defaultBet?: number; // defaults to betOptions[0]
    reelCount?: number; // defaults to 3
    jackpotPool?: number; // omit to hide the marquee
    denominationLabel?: string; // e.g. "500" badge on the cabinet
    isPending: boolean; // network request in flight
    spin: (wager: number) => Promise<SlotSpinResult>;
    onResult?: (result: SlotSpinResult) => void; // fired once reels have visually landed
}

const CYCLE_INTERVAL_MS = 90;
const STOP_DELAYS_MS = [900, 1250, 1600];

/**
 * The reusable slot-machine engine every machine page renders - required template for
 * every future machine (more denominations, more themes). Purely presentational +
 * animation state: knows nothing about a specific machine's odds, backend route, or
 * theme - it's just handed a symbol map, a list of bet amounts, and a `spin` function
 * that resolves with the real (server-decided) result. Reel cycling and the staggered
 * per-reel stop are pure client-side motion; the server's answer is already known the
 * moment `spin` resolves, only the *reveal* is delayed for effect.
 */
export default function SlotMachine({
    symbols,
    betOptions,
    defaultBet,
    reelCount = 3,
    jackpotPool,
    denominationLabel,
    isPending,
    spin,
    onResult,
}: SlotMachineProps) {
    const symbolKeys = Object.keys(symbols);
    const defaultReels = Array.from({ length: reelCount }, () => symbolKeys[0]);

    const [wager, setWager] = useState(defaultBet ?? betOptions[0]);
    const [displaySymbols, setDisplaySymbols] = useState<string[]>(defaultReels);
    const [reelStopped, setReelStopped] = useState<boolean[]>(defaultReels.map(() => true));
    const [spinning, setSpinning] = useState(false);
    const [spinId, setSpinId] = useState(0);

    const reelStoppedRef = useRef<boolean[]>(defaultReels.map(() => true));
    const cycleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const stopTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

    const clearTimers = () => {
        if (cycleIntervalRef.current) {
            clearInterval(cycleIntervalRef.current);
            cycleIntervalRef.current = null;
        }
        stopTimeoutsRef.current.forEach(clearTimeout);
        stopTimeoutsRef.current = [];
    };

    useEffect(() => () => clearTimers(), []);

    const randomSymbol = () => symbolKeys[Math.floor(Math.random() * symbolKeys.length)];

    function revealResult(result: SlotSpinResult): Promise<void> {
        return new Promise((resolve) => {
            for (let i = 0; i < reelCount; i++) {
                const delay = STOP_DELAYS_MS[i] ?? STOP_DELAYS_MS[STOP_DELAYS_MS.length - 1] + i * 350;
                const t = setTimeout(() => {
                    reelStoppedRef.current[i] = true;
                    setDisplaySymbols((prev) => {
                        const next = [...prev];
                        next[i] = result.reels[i];
                        return next;
                    });
                    setReelStopped((prev) => {
                        const next = [...prev];
                        next[i] = true;
                        return next;
                    });
                    if (i === reelCount - 1) {
                        resolve();
                    }
                }, delay);
                stopTimeoutsRef.current.push(t);
            }
        });
    }

    const canSpin = !isPending && !spinning && wager > 0;

    const handleSpin = async () => {
        if (!canSpin) {
            return;
        }
        clearTimers();
        reelStoppedRef.current = defaultReels.map(() => false);
        setReelStopped(defaultReels.map(() => false));
        setSpinning(true);
        setSpinId((id) => id + 1);

        if (!prefersReducedMotion) {
            cycleIntervalRef.current = setInterval(() => {
                setDisplaySymbols((prev) => prev.map((sym, i) => (reelStoppedRef.current[i] ? sym : randomSymbol())));
            }, CYCLE_INTERVAL_MS);
        }

        try {
            const result = await spin(wager);
            if (prefersReducedMotion) {
                setDisplaySymbols(result.reels);
                setReelStopped(defaultReels.map(() => true));
            } else {
                await revealResult(result);
            }
            onResult?.(result);
        } finally {
            clearTimers();
            setSpinning(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 480, mx: "auto" }}>
            <Box
                sx={{
                    position: "relative",
                    borderRadius: 3,
                    p: 3,
                    background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.15) 100%)",
                    bgcolor: "background.paper",
                    border: "3px solid",
                    borderColor: "warning.main",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                }}
            >
                {denominationLabel && (
                    <Box
                        sx={{
                            position: "absolute",
                            top: 10,
                            right: 10,
                            px: 1.2,
                            py: 0.2,
                            borderRadius: 999,
                            bgcolor: "warning.main",
                            color: "warning.contrastText",
                            fontSize: "0.7rem",
                            fontWeight: 800,
                        }}
                    >
                        {denominationLabel}
                    </Box>
                )}

                {jackpotPool !== undefined && (
                    <Box sx={{ textAlign: "center", mb: 2 }}>
                        <Typography variant="overline" sx={{ letterSpacing: 3, color: "warning.main", fontWeight: 700 }}>
                            Jackpot
                        </Typography>
                        <Typography
                            variant="h4"
                            sx={{
                                fontWeight: 800,
                                color: "warning.light",
                                textShadow: "0 0 14px rgba(255,193,7,0.55)",
                                fontVariantNumeric: "tabular-nums",
                            }}
                        >
                            {formatCheddar(jackpotPool)}
                        </Typography>
                    </Box>
                )}

                <Box
                    sx={{
                        display: "flex",
                        gap: 1,
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: "#000",
                        border: "3px solid",
                        borderColor: "grey.800",
                        boxShadow: "inset 0 6px 18px rgba(0,0,0,0.75)",
                    }}
                >
                    {displaySymbols.map((symbol, i) => (
                        <Box
                            key={i}
                            sx={{
                                flex: 1,
                                height: 96,
                                borderRadius: 1,
                                bgcolor: "#0d0d0d",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden",
                                border: "1px solid",
                                borderColor: reelStopped[i] ? "warning.main" : "grey.900",
                                transition: "border-color 0.3s",
                            }}
                        >
                            <Box
                                key={`${i}-${spinId}-${reelStopped[i]}`}
                                sx={{
                                    fontSize: 48,
                                    lineHeight: 1,
                                    animation: reelStopped[i]
                                        ? "landBounce 0.35s ease-out"
                                        : `reelSpin ${CYCLE_INTERVAL_MS}ms linear infinite`,
                                    "@keyframes reelSpin": {
                                        "0%": { transform: "translateY(-8%)", opacity: 0.75 },
                                        "100%": { transform: "translateY(0)", opacity: 1 },
                                    },
                                    "@keyframes landBounce": {
                                        "0%": { transform: "scale(1.3)" },
                                        "55%": { transform: "scale(0.92)" },
                                        "100%": { transform: "scale(1)" },
                                    },
                                }}
                            >
                                {symbols[symbol] ?? "❔"}
                            </Box>
                        </Box>
                    ))}
                </Box>
                <Box sx={{ height: 3, bgcolor: "error.main", opacity: 0.5, borderRadius: 1, mt: 1.5 }} />
            </Box>

            <ToggleButtonGroup
                exclusive
                size="small"
                value={wager}
                onChange={(_, value) => value !== null && setWager(value)}
                sx={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 1, mt: 3, "& .MuiToggleButtonGroup-grouped": { border: "1px solid", borderColor: "divider", borderRadius: "4px !important" } }}
            >
                {betOptions.map((amount) => (
                    <ToggleButton key={amount} value={amount} disabled={spinning || isPending} sx={{ px: 2, fontWeight: 700, textTransform: "none" }}>
                        {formatCheddar(amount)}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            <Box sx={{ textAlign: "center", mt: 2.5 }}>
                <Button
                    variant="contained"
                    color="error"
                    size="large"
                    onClick={handleSpin}
                    disabled={!canSpin}
                    sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                >
                    {spinning ? "Spinning…" : `Spin (${formatCheddar(wager)})`}
                </Button>
            </Box>
        </Box>
    );
}
