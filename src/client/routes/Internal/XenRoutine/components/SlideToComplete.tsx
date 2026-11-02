import { useRef, useState } from "react";
import { Box, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface Props {
    label?: string;
    disabled?: boolean;
    onComplete: () => void;
    /** Keyboard fallback: Enter/Space on the thumb, since dragging is pointer-only. */
    onKeyboardActivate?: () => void;
}

const THUMB = 44;
// Release past this fraction of the track to count as a deliberate slide.
const THRESHOLD = 0.9;

export default function SlideToComplete({ label = "Slide to mark done", disabled, onComplete, onKeyboardActivate }: Props) {
    const trackRef = useRef<HTMLDivElement>(null);
    const startX = useRef(0);
    const [offset, setOffset] = useState(0);
    const [dragging, setDragging] = useState(false);

    const maxOffset = () => Math.max(1, (trackRef.current?.clientWidth ?? 0) - THUMB - 8);

    const onPointerDown = (e: React.PointerEvent) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        startX.current = e.clientX - offset;
        setDragging(true);
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragging) return;
        setOffset(Math.min(maxOffset(), Math.max(0, e.clientX - startX.current)));
    };
    const finish = () => {
        if (!dragging) return;
        setDragging(false);
        const done = offset / maxOffset() >= THRESHOLD;
        setOffset(0); // spring back either way; a completed routine re-renders into its new state
        if (done) onComplete();
    };

    return (
        <Box ref={trackRef} sx={{
            position: "relative", height: THUMB + 8, borderRadius: 999, bgcolor: "action.hover", overflow: "hidden",
            opacity: disabled ? 0.5 : 1, userSelect: "none", touchAction: "none",
        }}>
            <Box sx={{ position: "absolute", inset: 0, bgcolor: "success.main", opacity: 0.25, width: offset + THUMB + 4 }} />
            <Typography variant="body2" color="text.secondary" sx={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                pl: `${THUMB}px`, pointerEvents: "none", opacity: 1 - Math.min(1, offset / (maxOffset() * 0.6)),
            }}>
                {label}
            </Typography>
            <Box
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={label}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finish}
                onPointerCancel={finish}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onKeyboardActivate?.(); }
                }}
                sx={{
                    position: "absolute", top: 4, left: 4, width: THUMB, height: THUMB, borderRadius: "50%",
                    bgcolor: "success.main", color: "success.contrastText", display: "flex", alignItems: "center",
                    justifyContent: "center", cursor: disabled ? "default" : "grab", transform: `translateX(${offset}px)`,
                    transition: dragging ? "none" : "transform 0.2s ease", "&:active": { cursor: "grabbing" },
                }}>
                <ChevronRightIcon />
            </Box>
        </Box>
    );
}
