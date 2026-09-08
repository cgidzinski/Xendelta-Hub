import { useMemo, type ReactNode } from "react";
import { Autocomplete, Box, TextField } from "@mui/material";
import type { XenBudgetLabel } from "../../../../hooks/xenbudget/types";
import { CategoryChip, FlagChip, resolveLabelColor } from "./LabelChip";

type Common = {
    /** Which registry this is and which chip to draw — categories fill, flags outline. */
    kind: "category" | "flag";
    /** `book.categories` or `book.flags`. */
    registry: XenBudgetLabel[];
    label?: string;
    helperText?: ReactNode;
    placeholder?: string;
    size?: "small" | "medium";
    required?: boolean;
    noOptionsText?: string;
    /**
     * Override the option list. Defaults to every registry name plus anything already
     * selected the registry no longer has (a label deleted out from under a budget, or a
     * name a CSV column introduced). Pass this when the caller needs to filter the
     * registry itself — e.g. hiding a derived flag.
     */
    options?: string[];
};

type Props = Common & (
    | { multiple: true; value: string[]; onChange: (v: string[]) => void }
    | { multiple?: false; value: string | null; onChange: (v: string | null) => void }
);

/**
 * The one category / flag picker for XenBudget.
 *
 * Single-select is a `multiple` Autocomplete capped to one value, so one chosen label
 * reads as the same coloured chip a multi picker shows — no separate single-select
 * styling to drift out of step.
 */
export default function LabelPicker(props: Props) {
    const { kind, registry, label, helperText, placeholder, size, required, noOptionsText } = props;
    const Chip = kind === "flag" ? FlagChip : CategoryChip;

    const selected = props.multiple ? props.value : (props.value ? [props.value] : []);

    const options = useMemo(() => {
        if (props.options) return props.options;
        const names = registry.map((l) => l.name);
        return [...names, ...selected.filter((s) => !names.includes(s))];
    }, [props.options, registry, selected]);

    return (
        <Autocomplete
            multiple
            size={size}
            options={options}
            value={selected}
            disableCloseOnSelect={!!props.multiple}
            onChange={(_, next) => {
                if (props.multiple) props.onChange(next);
                else props.onChange(next.length ? next[next.length - 1] : null);
            }}
            noOptionsText={noOptionsText}
            renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                    const { key, ...rest } = getTagProps({ index });
                    // A touch larger than the default display chip — these sit in a form
                    // field where 20px reads cramped next to the text cursor.
                    return (
                        <Chip
                            key={key} name={option} registry={registry} {...rest}
                            sx={{ height: 24, fontSize: 12 }}
                        />
                    );
                })
            }
            renderOption={(optionProps, option) => {
                const { key, ...rest } = optionProps as typeof optionProps & { key: string };
                return (
                    <Box component="li" key={option} {...rest} sx={{ display: "flex", gap: 1 }}>
                        <Box sx={{
                            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                            bgcolor: resolveLabelColor(option, registry, kind),
                        }} />
                        {option}
                    </Box>
                );
            }}
            renderInput={(params) => (
                <TextField
                    {...params}
                    label={label}
                    required={required}
                    placeholder={selected.length === 0 ? placeholder : undefined}
                    helperText={helperText}
                />
            )}
        />
    );
}
