import { ReactNode, useMemo, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import PlayLauncher from "../../components/PlayLauncher";
import ScratchCard, { ScratchPlayResultBase } from "../../components/ScratchCard";
import { renderPositionedLayer, SlotPosition } from "../../components/PositionedLayer";
import { formatCheddar } from "../../utils/currency";
import { formatOddsRatio } from "../../utils/odds";
import kittyBackground from "./kitty-background.png";
import kittyTop from "./kitty-top.png";
import archie from "../../icons/Archie.png";
import b1 from "../../icons/B1.png";
import b2 from "../../icons/B2.png";
import bean from "../../icons/Bean.png";
import crunch from "../../icons/Crunch.png";
import penelope2 from "../../icons/Penelope2.png";
import picci from "../../icons/Picci.jpg";

// Kitty Scratch: 4 rows, each an independent real win/lose draw (a row "wins" its own drawn
// amount, which can be $0), plus a real multiplier applied to the total. No symbol pools, no
// match combinatorics - a row's "3 matching symbols" is purely a client-side costume for its
// real `won` flag, decided first, server-side. The symbols themselves never affect anything.
const TICKET = "kitty-scratch";

interface KittyScratchRow {
    amount: number;
    won: boolean;
}

interface KittyScratchResult extends ScratchPlayResultBase {
    rows: KittyScratchRow[];
    multiplier: number;
    basePayout: number;
}

interface KittyOddsResponse {
    price: number;
    rowCount: number;
    rowDistribution: { value: number; probability: number }[];
    multiplierDistribution: { value: number; probability: number }[];
    rtp: number;
}

const fetchOdds = async (): Promise<KittyOddsResponse> =>
    (await apiClient.get<ApiResponse<KittyOddsResponse>>(`/api/casino/games/${TICKET}/odds`)).data.data!;

const buyTicket = async (): Promise<KittyScratchResult> =>
    (await apiClient.post<ApiResponse<KittyScratchResult>>(`/api/casino/games/${TICKET}/play`, {})).data.data!;

// 4 rows x [3 symbol cells + 1 prize cell] positioned to match the background art, plus one
// big "bonus" box lower on the card - matches the background image's baked-in box layout.
// Fine-tune these percentages to taste against the real artwork.
const ROW_Y_PCT = [17.8, 31.0, 44.3, 57.5];
const SYMBOL_X_PCT = [13.7, 38.1, 61.5];
const PRIZE_X_PCT = 87.4;
const LAYOUT: SlotPosition[] = [];
for (const yPct of ROW_Y_PCT) {
    for (const xPct of SYMBOL_X_PCT) {
        LAYOUT.push({ xPct, yPct });
    }
    LAYOUT.push({ xPct: PRIZE_X_PCT, yPct });
}
const BONUS_POSITION: SlotPosition = { xPct: 44.1, yPct: 81.3, sizePct: 48 };

const CAT_PHOTOS = [archie, b1, b2, bean, crunch, penelope2, picci];
const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

// A row's symbols are pure decoration for its already-decided `won` flag, never the other way
// around: won -> always 3 identical; lost -> never all 3 identical, but sometimes a "near
// miss" (2-of-3 matching) to tease, sometimes all 3 different - neither carries any meaning.
function buildLosingRowSymbols(): string[] {
    const a = pick(CAT_PHOTOS);
    if (Math.random() < 0.5) {
        let b = pick(CAT_PHOTOS);
        while (b === a) {
            b = pick(CAT_PHOTOS);
        }
        const oddIndex = Math.floor(Math.random() * 3);
        const symbols = [a, a, a];
        symbols[oddIndex] = b;
        return symbols;
    }
    let symbols: string[];
    do {
        symbols = [pick(CAT_PHOTOS), pick(CAT_PHOTOS), pick(CAT_PHOTOS)];
    } while (symbols[0] === symbols[1] && symbols[1] === symbols[2]);
    return symbols;
}

interface RowDecoration {
    symbols: string[];
    lossDisplayAmount: number;
}

// The only randomness - which emoji to show, and (for a losing row) which filler amount to
// print - computed once per ticket (memoized on `result` alone, never on `checked`) so it
// stays fixed no matter how many times the card re-renders in between. The filler amount for
// a losing row is drawn from the same real, actually-winnable amounts (per `/odds`) - never a
// made-up number - it just isn't *this* row's real (zero) result.
function buildRowDecorations(rows: KittyScratchRow[], winnableAmounts: number[]): RowDecoration[] {
    return rows.map((row) => ({
        symbols: row.won ? (() => { const s = pick(CAT_PHOTOS); return [s, s, s]; })() : buildLosingRowSymbols(),
        lossDisplayAmount: winnableAmounts.length > 0 ? pick(winnableAmounts) : 0,
    }));
}

// Purely cosmetic layout - the real payout is already fully decided server-side by the time
// this runs. Every row always shows a filled-in amount (real if it won, decorative filler if
// not - never a blank/dash), and a winning row is only actually highlighted green once
// `checked` - scratching reveals the numbers, but the official win styling waits for Check
// Ticket, same as the verdict banner itself.
function buildDynamicContent(result: KittyScratchResult, decorations: RowDecoration[], checked: boolean): ReactNode[] {
    const nodes: ReactNode[] = [];

    result.rows.forEach((row, i) => {
        const { symbols, lossDisplayAmount } = decorations[i];
        for (const s of symbols) {
            nodes.push(<Box component="img" src={s} sx={{ width: 60, height: 60, borderRadius: 1, objectFit: "cover" }} />);
        }
        nodes.push(
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: row.won && checked ? "success.light" : "common.white" }}>
                {formatCheddar(row.won ? row.amount : lossDisplayAmount)}
            </Typography>
        );
    });

    nodes.push(
        <Typography variant="h4" sx={{ fontWeight: 800, color: "warning.light", textAlign: "center" }}>
            {result.multiplier}x
        </Typography>
    );

    return nodes;
}

// What actually won, for the verdict banner - every row's win/lose status and amount (not
// just the winners), then the arithmetic that gets from the row subtotal to the final total:
// base × multiplier = total.
function renderVerdictDetails(result: KittyScratchResult): ReactNode {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "center" }}>
            <Typography sx={{ fontSize: 13 }}>
                {result.rows.map((r, i) => `Row ${i + 1}: ${r.won ? formatCheddar(r.amount) : "—"}`).join("   ")}
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                {formatCheddar(result.basePayout)} base × {result.multiplier}x multiplier = {formatCheddar(result.totalPayout)}
            </Typography>
        </Box>
    );
}

export default function KittyScratch() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();
    const [result, setResult] = useState<KittyScratchResult | null>(null);
    const [checked, setChecked] = useState(false);

    const { data: odds } = useQuery({ queryKey: ["kittyScratchOdds"], queryFn: fetchOdds, staleTime: 5 * 60 * 1000 });

    // The real, actually-winnable amounts (per /odds) - a losing row's filler display is drawn
    // from this, never a made-up number. Memoized on `odds` itself (stable while the query
    // data doesn't change) so it doesn't destabilize the decoration memo below.
    const winnableAmounts = useMemo(() => odds?.rowDistribution.filter((d) => d.value > 0).map((d) => d.value) ?? [], [odds]);

    // The emoji/filler-amount choices are computed once per ticket and frozen for every
    // re-render in between (Check Ticket, etc.) - not because they matter, but so the display
    // doesn't visibly change for no reason. The styling (green highlight) is recomputed
    // separately, keyed on `checked` too, so it can update without re-rolling any decoration.
    const rowDecorations = useMemo(
        () => (result ? buildRowDecorations(result.rows, winnableAmounts) : null),
        [result, winnableAmounts]
    );
    const dynamicContent = useMemo(
        () => (result && rowDecorations ? buildDynamicContent(result, rowDecorations, checked) : null),
        [result, rowDecorations, checked]
    );

    const { mutate: buy, isPending } = useMutation({
        mutationFn: buyTicket,
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
            setResult(res);
            setChecked(false);
        },
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to buy ticket", { variant: "error" }),
    });

    const rowLossProbability = odds?.rowDistribution.find((d) => d.value === 0)?.probability ?? 0;
    const probabilityAnyRowWin = odds ? 1 - Math.pow(rowLossProbability, odds.rowCount) : undefined;
    const oddsLabel = formatOddsRatio(probabilityAnyRowWin);
    const rtpLabel = odds ? `RTP ${(odds.rtp * 100).toFixed(1)}%` : undefined;

    const oddsSections: OddsSection[] = odds
        ? [
            {
                title: "Per Row",
                rows: odds.rowDistribution.map((d) => ({
                    label: d.value > 0 ? `Win ${formatCheddar(d.value)}` : "No win",
                    probability: d.probability,
                    payout: d.value > 0 ? formatCheddar(d.value) : "—",
                })),
                footnote: `Each of the ${odds.rowCount} rows draws independently.`,
            },
            {
                title: "Bonus Multiplier",
                rows: odds.multiplierDistribution.map((d) => ({
                    label: `${d.value}x`,
                    probability: d.probability,
                    payout: `${d.value}x total`,
                })),
                footnote: "Applied once to the sum of all 4 rows.",
            },
        ]
        : [];

    return (
        <GameWrapper
            title="Kitty Scratch"
            howToPlay="A 5,000-cheddar ticket. Scratch to reveal 4 rows - each row independently wins its own shown amount (3 matching symbols means that row won), and a bonus multiplier at the bottom applies to your total. Check Ticket instantly finishes the reveal."
            oddsSections={oddsSections}
        >
            <PlayLauncher
                title="Kitty Scratch"
                description="5,000-cheddar ticket - scratch the whole card to reveal your prize."
                price={odds?.price ?? 5000}
                oddsLabel={oddsLabel}
                rtpLabel={rtpLabel}
                fullBleed
                onOpen={() => {
                    if (checked) {
                        setResult(null);
                        setChecked(false);
                    }
                }}
                headerActions={
                    result ? (
                        <Button
                            variant="contained"
                            color="warning"
                            size="small"
                            disabled={isPending}
                            onClick={() => (checked ? buy() : setChecked(true))}
                            sx={{ fontWeight: 800 }}
                        >
                            {checked ? "Buy Another Ticket" : "Check Ticket"}
                        </Button>
                    ) : null
                }
            >
                <ScratchCard<KittyScratchResult>
                    price={odds?.price ?? 5000}
                    isPending={isPending}
                    result={result}
                    checked={checked}
                    onBuy={() => buy()}
                    backgroundImageSrc={kittyBackground}
                    topImageSrc={kittyTop}
                    renderDynamicLayer={() => renderPositionedLayer([...LAYOUT, BONUS_POSITION], dynamicContent ?? [])}
                    renderVerdictDetails={renderVerdictDetails}
                />
            </PlayLauncher>
        </GameWrapper>
    );
}
