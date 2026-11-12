import { Box, Chip, MenuItem, TextField, useMediaQuery, useTheme } from "@mui/material";

interface FilterChipsProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/**
 * The filters above a list, where one is chosen. A row of chips on a computer; on a phone a boxed select (like the other
 * fields), so several choices don't scroll sideways off the screen.
 */
export default function FilterChips<T extends string>({ options, value, onChange, label }: FilterChipsProps<T>) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down("sm"));

  if (phone) {
    return (
      <TextField
        select
        size="small"
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        sx={{ width: "100%" }}
      >
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  return (
    <Box role="group" aria-label={label} sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
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
