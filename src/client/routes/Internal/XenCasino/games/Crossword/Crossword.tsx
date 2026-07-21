import { ReactNode, useState } from "react";
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
import crosswordBackground from "./crossword-background.png";
import crosswordTop from "./crossword-top.png";

// A real intersecting crossword ticket: the background is decorative only (it already has 30
// circle outlines baked in for "your letters" up top, and a blank square below for the grid).
// The dynamic layer's whole job is dropping letters into those circles and building the grid
// of active/blank cells into the square - a fully generated `renderDynamicLayer`, no
// `renderPositionedLayer`-only shortcut for the grid part (only the circles use it).
const TICKET = "crossword";

// The server always sends exactly this many "your letters" circles worth of real content
// (see crossword.ts's CIRCLE_COUNT), but the background art has 30 baked-in circle outlines -
// render all 30 positions, leaving any beyond the real letter count blank.
const CIRCLE_COLS = 10;
const CIRCLE_Y_PCT = [5.7, 10.9, 16.7];
const CIRCLE_LAYOUT: SlotPosition[] = [];
for (const yPct of CIRCLE_Y_PCT) {
    for (let col = 0; col < CIRCLE_COLS; col++) {
        const xPct = 8 + (col * (92 - 8)) / (CIRCLE_COLS - 1);
        CIRCLE_LAYOUT.push({ xPct, yPct });
    }
}

// The blank square in the background art where the generated grid gets drawn - fine-tune
// these percentage bounds against the real artwork. No heightPct: cells are square
// (aspectRatio: "1"), so the grid's total height is derived from its width, not set directly.
const GRID_AREA = { leftPct: 2, topPct: 23.75, widthPct: 94.3 };

interface CrosswordWord {
    id: string;
    direction: "across" | "down";
    cells: [number, number][];
    word: string;
    found: boolean;
}

interface CrosswordResult extends ScratchPlayResultBase {
    rows: number;
    cols: number;
    grid: { row: number; col: number; letter: string }[];
    words: CrosswordWord[];
    letters: string[];
    wordsFoundCount: number;
}

interface CrosswordOddsResponse {
    price: number;
    slotCount: number;
    distribution: { wordsFound: number; payout: number; probability: number }[];
    rtp: number;
}

const fetchOdds = async (): Promise<CrosswordOddsResponse> =>
    (await apiClient.get<ApiResponse<CrosswordOddsResponse>>(`/api/casino/games/${TICKET}/odds`)).data.data!;

const buyTicket = async (): Promise<CrosswordResult> =>
    (await apiClient.post<ApiResponse<CrosswordResult>>(`/api/casino/games/${TICKET}/play`, {})).data.data!;

function buildCircleContent(letters: string[]): ReactNode[] {
    return CIRCLE_LAYOUT.map((_, i) => (
        <Typography
            sx={{
                fontSize: 15,
                fontWeight: 800,
                color: "common.white",
                width: 22,
                height: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            }}
        >
            {letters[i] ?? ""}
        </Typography>
    ));
}

// Found-word cells only get their win styling once `checked` - scratching reveals the grid's
// letters, but the official "you found this" highlight waits for Check Ticket, same as the
// verdict banner itself (and Kitty Scratch's row highlighting).
function CrosswordGrid({ result, checked }: { result: CrosswordResult; checked: boolean }) {
    const cellByKey = new Map(result.grid.map((c) => [`${c.row},${c.col}`, c.letter]));
    const foundCellKeys = new Set(
        result.words
            .filter((w) => w.found)
            .flatMap((w) => w.cells)
            .map(([r, c]) => `${r},${c}`)
    );

    return (
        <Box
            sx={{
                position: "absolute",
                left: `${GRID_AREA.leftPct}%`,
                top: `${GRID_AREA.topPct}%`,
                width: `${GRID_AREA.widthPct}%`,
                display: "grid",
                gridTemplateColumns: `repeat(${result.cols}, 1fr)`,
                gap: "0.5%",
            }}
        >
            {Array.from({ length: result.rows * result.cols }, (_, i) => {
                const row = Math.floor(i / result.cols);
                const col = i % result.cols;
                const key = `${row},${col}`;
                const letter = cellByKey.get(key);
                if (letter === undefined) {
                    return <Box key={key} sx={{ aspectRatio: "1" }} />;
                }
                const found = checked && foundCellKeys.has(key);
                return (
                    <Box
                        key={key}
                        sx={{
                            aspectRatio: "1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: found ? "rgba(76,175,80,0.35)" : "rgba(0,0,0,0.35)",
                            border: "1px solid",
                            borderColor: found ? "success.main" : "rgba(255,255,255,0.25)",
                            borderRadius: 0.5,
                            color: "common.white",
                            fontWeight: 800,
                            fontSize: 14,
                        }}
                    >
                        {letter}
                    </Box>
                );
            })}
        </Box>
    );
}

// What actually won, for the verdict banner - the specific words found, and the count -> prize
// link spelled out explicitly (the payout is by *count* found, not which words).
function renderVerdictDetails(result: CrosswordResult): ReactNode {
    const foundWords = result.words.filter((w) => w.found);
    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, alignItems: "center" }}>
            <Typography sx={{ fontSize: 13 }}>{foundWords.length > 0 ? `Found: ${foundWords.map((w) => w.word).join(", ")}` : "No words found"}</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                {result.wordsFoundCount} word{result.wordsFoundCount === 1 ? "" : "s"} found pays {formatCheddar(result.totalPayout)}
            </Typography>
        </Box>
    );
}

export default function Crossword() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();
    const [result, setResult] = useState<CrosswordResult | null>(null);
    const [checked, setChecked] = useState(false);

    const { data: odds } = useQuery({ queryKey: ["crosswordOdds"], queryFn: fetchOdds, staleTime: 5 * 60 * 1000 });

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

    const probabilityAnyWin = odds ? odds.distribution.filter((d) => d.payout > 0).reduce((sum, d) => sum + d.probability, 0) : undefined;
    const oddsLabel = formatOddsRatio(probabilityAnyWin);
    const rtpLabel = odds ? `RTP ${(odds.rtp * 100).toFixed(1)}%` : undefined;

    const oddsSections: OddsSection[] = odds
        ? [
            {
                title: "Prizes",
                rows: odds.distribution.map((d) => ({
                    label: d.wordsFound <= 1 ? "0 - 1 words" : `${d.wordsFound} words`,
                    probability: d.probability,
                    payout: d.payout > 0 ? formatCheddar(d.payout) : "—",
                })),
                footnote: `${odds.slotCount} words are hidden in the grid each ticket - find as many as you can spell with your letters.`,
            },
        ]
        : [];

    return (
        <GameWrapper
            title="Crossword"
            howToPlay="A 20,000-cheddar high-roller ticket. Buy it, then scratch to reveal your letters and the crossword grid - spell as many hidden words as you can using only your letters. The more words you find, the bigger the prize."
            oddsSections={oddsSections}
        >
            <PlayLauncher
                title="Crossword"
                description="20,000-cheddar high-roller ticket - spell hidden words with your letters for big prizes."
                price={odds?.price ?? 20000}
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
                <ScratchCard<CrosswordResult>
                    price={odds?.price ?? 20000}
                    isPending={isPending}
                    result={result}
                    checked={checked}
                    onBuy={() => buy()}
                    backgroundImageSrc={crosswordBackground}
                    topImageSrc={crosswordTop}
                    renderDynamicLayer={(res) => (
                        <>
                            {renderPositionedLayer(CIRCLE_LAYOUT, buildCircleContent(res.letters))}
                            <CrosswordGrid result={res} checked={checked} />
                        </>
                    )}
                    renderVerdictDetails={renderVerdictDetails}
                />
            </PlayLauncher>
        </GameWrapper>
    );
}
