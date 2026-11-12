import { Box, Chip } from "@mui/material";

interface FilterChipsProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** A row of chips where one is chosen: the filters above a list. */
export default function FilterChips<T extends string>({ options, value, onChange, label }: FilterChipsProps<T>) {
  return (
    <Box
      role="group"
      aria-label={label}
      sx={{
        display: "flex",
        gap: 1,
        flexWrap: { xs: "nowrap", md: "wrap" },
        overflowX: "auto",
        pb: { xs: 0.5, md: 0 },
      }}
    >
      {options.map((o) => (
        <Chip
          key={o.value}
          label={o.label}
          clickable
          color={o.value === value ? "primary" : "default"}
          variant={o.value === value ? "filled" : "outlined"}
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          sx={{ flexShrink: 0, fontWeight: 500 }}
        />
      ))}
    </Box>
  );
}
