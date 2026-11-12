import { Chip } from "@mui/material";

export type Tone = "default" | "success" | "warning" | "error" | "info";

/** A small outlined label whose colour says what kind of thing it is (a role, a status, a category). */
export default function StatusChip({ label, tone = "default" }: { label: string; tone?: Tone }) {
  return <Chip size="small" variant="outlined" color={tone} label={label} sx={{ fontWeight: 600 }} />;
}
