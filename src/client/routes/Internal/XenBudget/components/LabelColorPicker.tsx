import { useEffect, useState } from "react";
import {
    Box, IconButton, Popover, Slider, Stack, TextField, Tooltip, Typography,
} from "@mui/material";

const HEX_RE = /^#[0-9a-f]{6}$/i;

interface Rgb {
    r: number;
    g: number;
    b: number;
}

function hexToRgb(hex: string): Rgb {
    const match = HEX_RE.exec(hex);
    if (!match) return { r: 0, g: 0, b: 0 };
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
    };
}

function rgbToHex({ r, g, b }: Rgb): string {
    const byte = (v: number) => Math.round(v).toString(16).padStart(2, "0");
    return `#${byte(r)}${byte(g)}${byte(b)}`;
}

const CHANNELS: { key: keyof Rgb; label: string; track: (v: Rgb) => string }[] = [
    { key: "r", label: "R", track: (v) => `rgb(${v.r}, 0, 0)` },
    { key: "g", label: "G", track: (v) => `rgb(0, ${v.g}, 0)` },
    { key: "b", label: "B", track: (v) => `rgb(0, 0, ${v.b})` },
];

interface LabelColorPickerProps {
    color: string;
    onChange: (hex: string) => void;
}

/**
 * A colour dot that opens a small popover with three RGB sliders and a hex field. Dragging
 * updates the local preview instantly; the change only reaches the server once a slider is
 * released (or the hex field is committed), so scrubbing a channel doesn't fire a save per
 * pixel moved.
 */
export default function LabelColorPicker({ color, onChange }: LabelColorPickerProps) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [rgb, setRgb] = useState<Rgb>(() => hexToRgb(color));
    const [hexDraft, setHexDraft] = useState(color);

    // Re-seed the draft whenever the popover opens, or the colour changes out from under
    // it (another tab, a refetch) - dragging shouldn't be clobbered mid-edit otherwise.
    useEffect(() => {
        if (anchorEl) {
            setRgb(hexToRgb(color));
            setHexDraft(color);
        }
    }, [anchorEl, color]);

    const commitHex = () => {
        const trimmed = hexDraft.trim();
        if (HEX_RE.test(trimmed)) {
            setRgb(hexToRgb(trimmed));
            onChange(trimmed);
        } else {
            setHexDraft(color);
        }
    };

    const previewHex = rgbToHex(rgb);

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
                <Stack spacing={1.5} sx={{ p: 2, width: 220 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: previewHex, flexShrink: 0 }} />
                        <TextField
                            size="small" value={hexDraft} fullWidth
                            onChange={(e) => setHexDraft(e.target.value)}
                            onBlur={commitHex}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                    </Stack>

                    {CHANNELS.map(({ key, label, track }) => (
                        <Stack key={key} direction="row" spacing={1.5} alignItems="center">
                            <Typography variant="caption" sx={{ width: 12, color: "text.secondary" }}>{label}</Typography>
                            <Slider
                                size="small" min={0} max={255} value={rgb[key]}
                                onChange={(_, v) => {
                                    const next = { ...rgb, [key]: v as number };
                                    setRgb(next);
                                    setHexDraft(rgbToHex(next));
                                }}
                                onChangeCommitted={(_, v) => onChange(rgbToHex({ ...rgb, [key]: v as number }))}
                                sx={{ color: track(rgb) }}
                            />
                            <Typography variant="caption" sx={{ width: 26, textAlign: "right", color: "text.secondary" }}>
                                {rgb[key]}
                            </Typography>
                        </Stack>
                    ))}
                </Stack>
            </Popover>
        </>
    );
}
