import { describe, it, expect } from "vitest";
import {
    parseAmount, parseDate, detectDateFormat, applyMapping, toCsv,
    type MappingConfig, type CsvRow,
} from "./csvMapping";

const signed = (over: Partial<MappingConfig> = {}): MappingConfig => ({
    column_map: { date: "Date", description: "Payee", amount: "Amount" },
    amount_mode: "signed",
    sign_convention: "negative_is_expense",
    date_format: "auto",
    ...over,
});

describe("parseAmount", () => {
    it("reads a plain number", () => {
        expect(parseAmount("42.10")).toBe(42.1);
        expect(parseAmount("-42.10")).toBe(-42.1);
    });

    it("strips currency symbols and thousands separators", () => {
        expect(parseAmount("$1,234.56")).toBe(1234.56);
        expect(parseAmount("£1,234.56")).toBe(1234.56);
        expect(parseAmount(" 1 234.56 ")).toBe(1234.56);
    });

    it("reads European formatting, where the comma is the decimal point", () => {
        expect(parseAmount("1.234,56")).toBe(1234.56);
        expect(parseAmount("12,50")).toBe(12.5);
    });

    it("treats a lone comma with three digits after it as a thousands separator", () => {
        // "1,234" is one thousand two hundred and thirty-four, not 1.234.
        expect(parseAmount("1,234")).toBe(1234);
    });

    it("reads accounting negatives", () => {
        expect(parseAmount("(45.00)")).toBe(-45);
        expect(parseAmount("45.00-")).toBe(-45);
    });

    it("returns null rather than zero for something unreadable", () => {
        // A bad cell must become a reported error, never a silent $0 item.
        expect(parseAmount("")).toBeNull();
        expect(parseAmount("   ")).toBeNull();
        expect(parseAmount("n/a")).toBeNull();
        expect(parseAmount(undefined)).toBeNull();
        expect(parseAmount(null)).toBeNull();
    });

    it("reads a real zero as zero", () => {
        expect(parseAmount("0.00")).toBe(0);
    });
});

describe("detectDateFormat", () => {
    it("spots ISO dates", () => {
        expect(detectDateFormat(["2026-08-21", "2026-08-22"])).toBe("ymd");
    });

    it("infers day-first when a first component exceeds 12", () => {
        expect(detectDateFormat(["01/02/2026", "21/08/2026"])).toBe("dmy");
    });

    it("infers month-first when a second component exceeds 12", () => {
        expect(detectDateFormat(["01/02/2026", "08/21/2026"])).toBe("mdy");
    });

    it("falls back to month-first when the column is genuinely ambiguous", () => {
        // 03/04/2026 is a real date read either way; the wizard shows the guess so the
        // user can override it.
        expect(detectDateFormat(["03/04/2026", "01/02/2026"])).toBe("mdy");
    });
});

describe("parseDate", () => {
    it("anchors at UTC midnight so the day can't shift across a timezone", () => {
        expect(parseDate("2026-08-21", "ymd")!.toISOString()).toBe("2026-08-21T00:00:00.000Z");
    });

    it("respects the resolved day/month order", () => {
        expect(parseDate("03/04/2026", "dmy")!.toISOString()).toBe("2026-04-03T00:00:00.000Z");
        expect(parseDate("03/04/2026", "mdy")!.toISOString()).toBe("2026-03-04T00:00:00.000Z");
    });

    it("accepts dots and dashes as separators", () => {
        expect(parseDate("21.08.2026", "dmy")!.toISOString()).toBe("2026-08-21T00:00:00.000Z");
        expect(parseDate("21-08-2026", "dmy")!.toISOString()).toBe("2026-08-21T00:00:00.000Z");
    });

    it("rejects a date that doesn't exist instead of rolling it forward", () => {
        expect(parseDate("31/02/2026", "dmy")).toBeNull();
        expect(parseDate("2026-13-01", "ymd")).toBeNull();
    });

    it("falls back to the runtime parser for written-out dates", () => {
        expect(parseDate("21 Aug 2026", "dmy")!.toISOString()).toBe("2026-08-21T00:00:00.000Z");
    });

    it("returns null for junk", () => {
        expect(parseDate("not a date", "dmy")).toBeNull();
        expect(parseDate("", "dmy")).toBeNull();
    });
});

describe("applyMapping", () => {
    const rows: CsvRow[] = [
        { Date: "2026-08-01", Payee: "STARBUCKS", Amount: "-6.50" },
        { Date: "2026-08-02", Payee: "PAYROLL", Amount: "2500.00" },
    ];

    it("maps a signed-amount export, using the sign to set the type", () => {
        const { rows: mapped, errors } = applyMapping(rows, signed());
        expect(errors).toEqual([]);
        expect(mapped[0]).toMatchObject({ type: "expense", amount: 6.5, description: "STARBUCKS" });
        expect(mapped[1]).toMatchObject({ type: "income", amount: 2500 });
        // Stored amounts are always positive; `type` carries the sign.
        expect(mapped.every((r) => r.amount > 0)).toBe(true);
    });

    it("honours the opposite sign convention", () => {
        const { rows: mapped } = applyMapping(rows, signed({ sign_convention: "positive_is_expense" }));
        expect(mapped[0].type).toBe("income");
        expect(mapped[1].type).toBe("expense");
    });

    it("maps separate debit and credit columns", () => {
        const dc: CsvRow[] = [
            { Date: "2026-08-01", Payee: "GROCERIES", Debit: "90.00", Credit: "" },
            { Date: "2026-08-02", Payee: "REFUND", Debit: "", Credit: "15.00" },
        ];
        const { rows: mapped, errors } = applyMapping(dc, {
            column_map: { date: "Date", description: "Payee", debit: "Debit", credit: "Credit" },
            amount_mode: "debit_credit",
            sign_convention: "negative_is_expense",
            date_format: "auto",
        });
        expect(errors).toEqual([]);
        expect(mapped[0]).toMatchObject({ type: "expense", amount: 90 });
        expect(mapped[1]).toMatchObject({ type: "income", amount: 15 });
    });

    it("treats a debit as money out even when the file signs it negative", () => {
        const { rows: mapped } = applyMapping(
            [{ Date: "2026-08-01", Payee: "GROCERIES", Debit: "-90.00", Credit: "" }],
            {
                column_map: { date: "Date", description: "Payee", debit: "Debit", credit: "Credit" },
                amount_mode: "debit_credit",
                sign_convention: "negative_is_expense",
                date_format: "auto",
            },
        );
        expect(mapped[0]).toMatchObject({ type: "expense", amount: 90 });
    });

    it("reports unmappable rows instead of dropping them silently", () => {
        const bad: CsvRow[] = [
            { Date: "2026-08-01", Payee: "GOOD", Amount: "10.00" },
            { Date: "2026-08-02", Payee: "", Amount: "10.00" },
            { Date: "2026-08-03", Payee: "NO AMOUNT", Amount: "n/a" },
            { Date: "junk", Payee: "BAD DATE", Amount: "10.00" },
            { Date: "2026-08-05", Payee: "ZERO", Amount: "0.00" },
        ];
        const { rows: mapped, errors } = applyMapping(bad, signed());
        expect(mapped).toHaveLength(1);
        expect(errors.map((e) => e.index)).toEqual([1, 2, 3, 4]);
        expect(errors[0].reason).toMatch(/description/i);
        expect(errors[1].reason).toMatch(/number/i);
        expect(errors[2].reason).toMatch(/date/i);
        expect(errors[3].reason).toMatch(/zero/i);
    });

    it("keeps the original row index so the preview can point at the right line", () => {
        const bad: CsvRow[] = [
            { Date: "junk", Payee: "BAD", Amount: "10.00" },
            { Date: "2026-08-02", Payee: "GOOD", Amount: "10.00" },
        ];
        const { rows: mapped } = applyMapping(bad, signed());
        expect(mapped[0].index).toBe(1);
    });

    it("splits a tag column and merges the preset's default tags", () => {
        const { rows: mapped } = applyMapping(
            [{ Date: "2026-08-01", Payee: "X", Amount: "-5", Tags: "food; coffee" }],
            signed({
                column_map: { date: "Date", description: "Payee", amount: "Amount", tags: "Tags" },
                default_tags: ["imported"],
            }),
        );
        expect(mapped[0].tags).toEqual(["imported", "food", "coffee"]);
    });

    it("does not duplicate a default tag the row already carries", () => {
        const { rows: mapped } = applyMapping(
            [{ Date: "2026-08-01", Payee: "X", Amount: "-5", Tags: "Imported" }],
            signed({
                column_map: { date: "Date", description: "Payee", amount: "Amount", tags: "Tags" },
                default_tags: ["imported"],
            }),
        );
        expect(mapped[0].tags).toEqual(["imported"]);
    });

    it("applies one detected date order across the whole file", () => {
        // The 21 in row two settles it as day-first, which must also govern row one.
        const ambiguous: CsvRow[] = [
            { Date: "03/04/2026", Payee: "A", Amount: "-1" },
            { Date: "21/08/2026", Payee: "B", Amount: "-1" },
        ];
        const { rows: mapped } = applyMapping(ambiguous, signed());
        expect(mapped[0].date).toBe("2026-04-03T00:00:00.000Z");
        expect(mapped[1].date).toBe("2026-08-21T00:00:00.000Z");
    });
});

describe("toCsv", () => {
    it("escapes embedded quotes and commas", () => {
        expect(toCsv([["a,b", 'say "hi"']])).toBe('"a,b","say ""hi"""');
    });

    it("handles null and undefined as empty cells", () => {
        expect(toCsv([[null, undefined, 0]])).toBe('"","","0"');
    });
});
