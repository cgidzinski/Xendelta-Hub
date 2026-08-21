import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { MenuItem, TextField, Typography } from "@mui/material";
import type { BookDetailContext } from "../BookDetail";
import SectionCard from "./SectionCard";
import { ALL_CURRENCIES, STABLE_CURRENCY_MENU_PROPS } from "../../../../utils/currencyUtils";

export default function BookSection() {
    const { book, updateBook, isUpdating } = useOutletContext<BookDetailContext>();
    const [name, setName] = useState(book.name);

    return (
        <SectionCard title="Book">
            <TextField
                fullWidth label="Name" value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                    const trimmed = name.trim();
                    if (trimmed && trimmed !== book.name) updateBook({ name: trimmed });
                    else setName(book.name);
                }}
            />
            <TextField
                select fullWidth label="Default currency" value={book.default_currency}
                onChange={(e) => updateBook({ default_currency: e.target.value })}
                disabled={isUpdating}
                slotProps={{ select: { MenuProps: STABLE_CURRENCY_MENU_PROPS } }}
            >
                {ALL_CURRENCIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
            <Typography variant="caption" color="text.secondary">
                Months and budget periods follow each viewer&rsquo;s own timezone, set on your
                profile — so this book reads in your local time and in everyone else&rsquo;s.
            </Typography>
        </SectionCard>
    );
}
