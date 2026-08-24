// Turning a parsed CSV into XenBudget items.
//
// Kept pure and free of React so it can be unit-tested, which matters more here than
// almost anywhere else in the app: bank exports disagree about date order, sign
// convention, thousands separators and whether debits and credits share a column, and
// getting any of those wrong silently produces plausible-looking but wrong money.
//
// Parsing the file itself is papaparse's job (quoted fields, embedded newlines, BOM);
// this module only maps already-parsed rows.

export type SignConvention = "negative_is_expense" | "positive_is_expense";

export interface ColumnMap {
    date?: string;
    description?: string;
    amount?: string;
    debit?: string;
    credit?: string;
    categories?: string;
    people?: string;
}

export interface MappingConfig {
    column_map: ColumnMap;
    sign_convention: SignConvention;
    /** A date-fns-ish pattern, or "auto" to infer from the data. */
    date_format: string;
    /** False for a file that starts straight into data, with no header row at all. */
    has_header?: boolean;
    /** Junk rows to drop before the header (or the data, if there's no header). */
    skip_rows?: number;
    default_categories?: string[];
}

export interface MappedRow {
    index: number;
    type: "expense" | "income";
    amount: number;
    date: string;
    description: string;
    categories: string[];
}

export interface MappingError {
    index: number;
    reason: string;
}

export interface MappingResult {
    rows: MappedRow[];
    errors: MappingError[];
}

export type CsvRow = Record<string, string>;

/**
 * Parses a money cell.
 *
 * Handles the shapes that actually turn up in bank exports: "1,234.56", "1.234,56"
 * (European), "$1,234.56", "(45.00)" for a negative, and a trailing "-". Returns null
 * rather than 0 for anything unparseable, so a bad cell becomes a reported error instead
 * of a silent zero-value item.
 */
export function parseAmount(raw: string | undefined | null): number | null {
    if (raw === undefined || raw === null) return null;
    let text = String(raw).trim();
    if (text === "") return null;

    // Accounting parentheses and a trailing minus both mean negative.
    let negative = false;
    if (/^\(.*\)$/.test(text)) {
        negative = true;
        text = text.slice(1, -1);
    }
    if (/-\s*$/.test(text)) {
        negative = true;
        text = text.replace(/-\s*$/, "");
    }

    // Strip currency symbols, spaces and non-breaking spaces.
    text = text.replace(/[^\d,.\-]/g, "");
    if (text.startsWith("-")) {
        negative = true;
        text = text.slice(1);
    }
    if (text === "") return null;

    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    if (lastComma !== -1 && lastDot !== -1) {
        // Whichever separator comes last is the decimal one.
        if (lastComma > lastDot) text = text.replace(/\./g, "").replace(",", ".");
        else text = text.replace(/,/g, "");
    } else if (lastComma !== -1) {
        // A lone comma is a decimal separator only when it splits exactly two digits;
        // "1,234" is one thousand two hundred and thirty-four, not 1.234.
        const after = text.length - lastComma - 1;
        text = after === 2 ? text.replace(",", ".") : text.replace(/,/g, "");
    }

    const value = Number(text);
    if (!Number.isFinite(value)) return null;
    return negative ? -value : value;
}

const DATE_PATTERNS: { pattern: RegExp; order: "ymd" | "dmy" | "mdy" }[] = [
    { pattern: /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/, order: "ymd" },
    { pattern: /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/, order: "dmy" },
];

/**
 * Decides whether ambiguous d/m/y dates in a column are day-first or month-first.
 *
 * Any value with a first component above 12 settles it. With no such value the column is
 * genuinely ambiguous — 03/04/2026 is a real date either way — so this returns "mdy" and
 * the wizard shows the interpretation for the user to override.
 */
export function detectDateFormat(samples: string[]): "ymd" | "dmy" | "mdy" {
    let sawIso = false;
    for (const sample of samples) {
        const text = String(sample || "").trim();
        if (/^\d{4}[-/.]/.test(text)) { sawIso = true; continue; }
        const match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
        if (!match) continue;
        const first = Number(match[1]);
        const second = Number(match[2]);
        if (first > 12) return "dmy";
        if (second > 12) return "mdy";
    }
    return sawIso ? "ymd" : "mdy";
}

/**
 * Parses a date cell into a date-only Date anchored at UTC midnight.
 *
 * This is a *calendar day*, not an instant: it's the wire value the client sends, and the
 * server anchors it to the book's own timezone before storing. Keeping it as UTC midnight
 * here means the day never shifts as it crosses timezones on the way there.
 */
export function parseDate(raw: string | undefined | null, order: "ymd" | "dmy" | "mdy"): Date | null {
    if (!raw) return null;
    const text = String(raw).trim();
    if (text === "") return null;

    for (const { pattern, order: patternOrder } of DATE_PATTERNS) {
        const match = text.match(pattern);
        if (!match) continue;
        let year: number, month: number, day: number;
        if (patternOrder === "ymd") {
            [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
        } else if (order === "dmy") {
            [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
        } else {
            [month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
        }
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        const date = new Date(Date.UTC(year, month - 1, day));
        // Rejects the likes of 31 February, which Date would roll forward into March.
        if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
        return date;
    }

    // Fall back to whatever the runtime can make of it (e.g. "21 Aug 2026").
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

/**
 * Guesses whether a row of cells is CSV data rather than a header. Bank headers are words
 * like "Date"/"Amount"; data rows contain real dates or money. Lightweight and best-effort
 * — the wizard's "No header" checkbox remains the source of truth.
 */
export function looksLikeDataRow(cells: string[]): boolean {
    let dataSignals = 0;
    let headerSignals = 0;
    for (const cell of cells) {
        const text = String(cell ?? "").trim();
        if (!text) continue;
        if (parseAmount(text) !== null
            || parseDate(text, "ymd") || parseDate(text, "dmy") || parseDate(text, "mdy")) {
            dataSignals++;
        }
        if (/date|description|payee|merchant|amount|debit|credit|memo|post|reference|transaction/i.test(text)) {
            headerSignals++;
        }
    }
    return dataSignals > 0 && headerSignals === 0;
}

function splitList(raw: string | undefined): string[] {
    if (!raw) return [];
    return String(raw).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Maps parsed CSV rows onto item drafts.
 *
 * Rows that can't be mapped are reported rather than dropped — an import that silently
 * loses eight of forty rows is worse than one that says so.
 */
export function applyMapping(rows: CsvRow[], config: MappingConfig): MappingResult {
    const { column_map: map, sign_convention: sign } = config;
    // A signed Amount column wins when it is mapped, so a file that has both a signed
    // column and a stray debit/credit pair can't double-count.
    const usesAmount = !!map.amount;
    const usesDebitCredit = !!map.debit || !!map.credit;
    const order = config.date_format === "auto" || !config.date_format
        ? detectDateFormat(rows.map((r) => (map.date ? r[map.date] : "")))
        : (config.date_format as "ymd" | "dmy" | "mdy");

    const out: MappedRow[] = [];
    const errors: MappingError[] = [];

    rows.forEach((row, index) => {
        const description = String(map.description ? row[map.description] ?? "" : "").trim();
        if (!description) {
            errors.push({ index, reason: "No description" });
            return;
        }

        let signedAmount: number | null = null;
        if (!usesAmount && !usesDebitCredit) {
            errors.push({ index, reason: "No amount, debit, or credit column mapped" });
            return;
        }
        if (usesAmount) {
            const parsed = parseAmount(map.amount ? row[map.amount] : undefined);
            if (parsed === null) {
                errors.push({ index, reason: "Amount is not a number" });
                return;
            }
            if (parsed === 0) {
                errors.push({ index, reason: "Amount is zero" });
                return;
            }
            signedAmount = sign === "positive_is_expense" ? -parsed : parsed;
        } else {
            const debit = parseAmount(map.debit ? row[map.debit] : undefined);
            const credit = parseAmount(map.credit ? row[map.credit] : undefined);
            // A debit column is money out however it's signed in the file.
            if (debit !== null && debit !== 0) signedAmount = -Math.abs(debit);
            else if (credit !== null && credit !== 0) signedAmount = Math.abs(credit);
            else {
                errors.push({ index, reason: "No amount in either debit or credit" });
                return;
            }
        }

        const date = parseDate(map.date ? row[map.date] : undefined, order);
        if (!date) {
            errors.push({ index, reason: "Date could not be read" });
            return;
        }

        out.push({
            index,
            // Negative means money out, whatever the file's own convention was.
            type: signedAmount < 0 ? "expense" : "income",
            amount: Math.round(Math.abs(signedAmount) * 100) / 100,
            date: date.toISOString(),
            description: description.slice(0, 500),
            categories: [
                ...(config.default_categories || []),
                ...splitList(map.categories ? row[map.categories] : undefined),
            ].filter((c, i, arr) => arr.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i),
        });
    });

    return { rows: out, errors };
}

/**
 * Quotes a value for CSV output. Extracted from Xensplit's inline export so the report
 * page and any future export share one implementation.
 */
export function csvCell(value: unknown): string {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
    return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

/** Triggers a browser download of `content` as `filename`. */
export function downloadCsv(filename: string, content: string): void {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
