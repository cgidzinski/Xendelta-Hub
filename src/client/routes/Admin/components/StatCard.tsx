import { Box, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  /** Colours the value (an error count) or the note (a trend). */
  valueTone?: "error" | "warning";
  noteTone?: "success" | "warning" | "error";
}

/** One headline number with a label and a short note under it. */
export default function StatCard({ label, value, note, valueTone, noteTone }: StatCardProps) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: { xs: 1.5, md: 2 } }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: { xs: 22, md: 28 },
          fontWeight: 600,
          letterSpacing: "-0.01em",
          mt: 0.5,
          color: valueTone ? `${valueTone}.main` : "text.primary",
        }}
      >
        {value}
      </Typography>
      {note && (
        <Typography variant="body2" sx={{ mt: 0.25, color: noteTone ? `${noteTone}.main` : "text.secondary" }}>
          {note}
        </Typography>
      )}
    </Box>
  );
}
