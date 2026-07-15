import { ReactNode } from "react";
import { Box } from "@mui/material";

export interface SlotPosition {
    xPct: number;
    yPct: number;
    sizePct?: number;
}

// Shared helper for tickets whose dynamic layer is just "drop these nodes at these fixed
// normalized spots" (Easy Scratch/Scratchmania today, a future Bingo-style ticket) - not
// part of ScratchCard's contract, just one way of building the ReactNode a ticket hands to
// `renderDynamicLayer`. `positions`/`content` must be the same length/order; a ticket with a
// fully generated layout (e.g. Crossword-style) skips this helper entirely and writes its
// own `renderDynamicLayer` from scratch.
export function renderPositionedLayer(positions: SlotPosition[], content: ReactNode[]): ReactNode {
    return (
        <>
            {positions.map((pos, i) => (
                <Box
                    key={i}
                    sx={{
                        position: "absolute",
                        left: `${pos.xPct}%`,
                        top: `${pos.yPct}%`,
                        transform: "translate(-50%, -50%)",
                        width: pos.sizePct ? `${pos.sizePct}%` : undefined,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {content[i]}
                </Box>
            ))}
        </>
    );
}
