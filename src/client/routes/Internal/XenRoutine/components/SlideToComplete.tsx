import { useRef, useState } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface Props {
  label?: string;
  disabled?: boolean;
  /**
   * Runs when the handle is released at the far end. The handle stays locked there while
   * the promise is pending; if it rejects the handle springs back so the user can retry.
   * On success it stays locked - the parent is expected to remove or replace the card.
   */
  onComplete: () => Promise<unknown>;
  /** Keyboard fallback: Enter/Space on the handle, since dragging is pointer-only. */
  onKeyboardActivate?: () => void;
}

const THUMB = 44;
// Release past this fraction of the track to count as a deliberate slide.
const THRESHOLD = 0.9;

export default function SlideToComplete({
  label = "Slide to mark done",
  disabled,
  onComplete,
  onKeyboardActivate,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const locked = disabled || submitting;
  const maxOffset = () => Math.max(1, (trackRef.current?.clientWidth ?? 0) - THUMB - 8);

  const onPointerDown = (e: React.PointerEvent) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startX.current = e.clientX - offset;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setOffset(Math.min(maxOffset(), Math.max(0, e.clientX - startX.current)));
  };
  const finish = async () => {
    if (!dragging) return;
    setDragging(false);
    if (offset / maxOffset() < THRESHOLD) {
      setOffset(0);
      return;
    }
    // Snap to the end and hold there while the request runs.
    setOffset(maxOffset());
    setSubmitting(true);
    try {
      await onComplete();
    } catch {
      // The caller reports the error; spring back so it can be retried.
      setSubmitting(false);
      setOffset(0);
    }
  };

  const progress = offset / maxOffset();

  return (
    <Box
      ref={trackRef}
      sx={{
        position: "relative",
        height: THUMB + 8,
        borderRadius: 999,
        bgcolor: "action.hover",
        overflow: "hidden",
        opacity: disabled ? 0.5 : 1,
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {/* A pill the thumb's size, so the fill's leading edge is a semicircle under the thumb. */}
      <Box
        sx={{
          position: "absolute",
          top: 4,
          left: 4,
          height: THUMB,
          borderRadius: 999,
          bgcolor: "success.main",
          opacity: 0.25,
          width: offset + THUMB,
          transition: dragging ? "none" : "width 0.2s ease",
        }}
      />
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pl: `${THUMB}px`,
          pointerEvents: "none",
          opacity: submitting ? 1 : 1 - Math.min(1, progress / 0.6),
        }}
      >
        {submitting ? "Marking done…" : label}
      </Typography>
      <Box
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-label={label}
        aria-busy={submitting}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(e) => {
          if (!locked && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onKeyboardActivate?.();
          }
        }}
        sx={{
          position: "absolute",
          top: 4,
          left: 4,
          width: THUMB,
          height: THUMB,
          borderRadius: "50%",
          bgcolor: "success.main",
          color: "success.contrastText",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: locked ? "default" : "grab",
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
          "&:active": { cursor: locked ? "default" : "grabbing" },
        }}
      >
        {submitting ? <CircularProgress size={20} color="inherit" /> : <ChevronRightIcon />}
      </Box>
    </Box>
  );
}
