import { useEffect, useState } from "react";
import {
    Box, IconButton, Popover, Stack, TextField, Tooltip,
} from "@mui/material";

const HEX_RE = /^#[0-9a-f]{6}$/i;

interface LabelColorPickerProps {
    color: string;
    onChange: (hex: string) => void;
}

/**
 * A colour dot that opens a small popover: a native OS colour picker for point-and-click,
 * plus a hex field for typing or pasting an exact value. No picker library — the browser's
 * own `input[type=color]` already is one.
 */
export default function LabelColorPicker({ color, onChange }: LabelColorPickerProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [hexDraft, setHexDraft] = useState(color);

    // Re-seed the draft whenever the popover opens, or the colour changes out from under
    // it (another tab, a refetch) - typing shouldn't be clobbered mid-edit otherwise.
    useEffect(() => {
        if (anchorEl) setHexDraft(color);
    }, [anchorEl, color]);

    const commitHex = () => {
        const trimmed = hexDraft.trim();
        if (HEX_RE.test(trimmed)) onChange(trimmed);
        else setHexDraft(color);
    };

    return (
        <>
            <Tooltip title="Click to change colour">
                <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ p: 0.25 }}>
                    <Box sx={{ width: 16, height: 16, borderRadius: "50%", bgcolor: color }} />
                </IconButton>
            </Tooltip>
            <Popover
                open={!!anchorEl}
                anchorEl={anchorEl}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5 }}>
                    <Box
                        component="input"
                        type="color"
                        value={color}
                        onChange={(e) => onChange((e.target as HTMLInputElement).value)}
                        sx={{
                            width: 32, height: 32, p: 0, border: "none", borderRadius: 1,
                            cursor: "pointer", background: "none",
                            "&::-webkit-color-swatch-wrapper": { p: 0 },
                            "&::-webkit-color-swatch": { border: "none", borderRadius: 1 },
                        }}
                    />
                    <TextField
                        size="small" value={hexDraft} sx={{ width: 96 }}
                        onChange={(e) => setHexDraft(e.target.value)}
                        onBlur={commitHex}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                </Stack>
            </Popover>
        </>
    );
}
