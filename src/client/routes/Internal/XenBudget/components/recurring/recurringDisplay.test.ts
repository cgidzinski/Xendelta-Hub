import { describe, it, expect } from "vitest";
import { cadenceLabel, recentPriceRise, commitmentsIn, commitmentTotal } from "./recurringDisplay";
import type { XenBudgetRecurringSeries } from "../../../../../hooks/xenbudget/types";

function series(over: Partial<XenBudgetRecurringSeries> = {}): XenBudgetRecurringSeries {
    return {
        key: "NETFLIX",
        merchant: "NETFLIX",
        sample_description: "NETFLIX.COM 8829472",
        amount: 16.99,
        frequency: "monthly",
        occurrences: 8,
        first_date: "2026-01-15T00:00:00.000Z",
        last_date: "2026-08-15T00:00:00.000Z",
        next_expected: "2026-09-15T00:00:00.000Z",
        monthly_equivalent: 16.99,
        categories: ["Entertainment"],
        status: "active",
        price_changes: [],
        ...over,
    };
}

describe("cadenceLabel", () => {
    it("reads as English rather than as an enum", () => {
        expect(cadenceLabel("biweekly")).toBe("every 2 weeks");
        expect(cadenceLabel("monthly")).toBe("monthly");
    });
});

describe("recentPriceRise", () => {
    const now = new Date("2026-08-26T00:00:00.000Z");

    it("surfaces a recent rise", () => {
        const rise = recentPriceRise(series({
            price_changes: [{ date: "2026-07-15T00:00:00.000Z", from: 11.99, to: 13.99 }],
        }), now);
        expect(rise).toMatchObject({ from: 11.99, to: 13.99 });
    });

    it("ignores a price DROP — that is not something to chase", () => {
        expect(recentPriceRise(series({
            price_changes: [{ date: "2026-07-15T00:00:00.000Z", from: 13.99, to: 11.99 }],
        }), now)).toBeNull();
    });

    it("ignores a rise old enough to be history", () => {
        expect(recentPriceRise(series({
            price_changes: [{ date: "2024-02-15T00:00:00.000Z", from: 11.99, to: 13.99 }],
        }), now)).toBeNull();
    });

    it("reports the LATEST rise when there have been several", () => {
        const rise = recentPriceRise(series({
            price_changes: [
                { date: "2026-03-15T00:00:00.000Z", from: 9.99, to: 11.99 },
                { date: "2026-07-15T00:00:00.000Z", from: 11.99, to: 13.99 },
            ],
        }), now);
        expect(rise).toMatchObject({ from: 11.99, to: 13.99 });
    });

    it("says nothing when the price has never moved", () => {
        expect(recentPriceRise(series(), now)).toBeNull();
    });
});

describe("commitmentsIn", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    const to = new Date("2026-10-01T00:00:00.000Z");

    it("includes a charge still to come inside the window", () => {
        expect(commitmentsIn([series()], from, to)).toHaveLength(1);
    });

    it("excludes a charge that has already posted — it is in spend-to-date already", () => {
        // The double-count guard: next_expected is in October, so September holds nothing.
        expect(commitmentsIn([series({ next_expected: "2026-10-15T00:00:00.000Z" })], from, to))
            .toHaveLength(0);
    });

    it("excludes a charge due before the window opened", () => {
        expect(commitmentsIn([series({ next_expected: "2026-08-15T00:00:00.000Z" })], from, to))
            .toHaveLength(0);
    });

    it("excludes an ended series — money no longer paid is not a commitment", () => {
        expect(commitmentsIn([series({ status: "ended" })], from, to)).toHaveLength(0);
    });

    it("keeps a missing one: an unposted bill is still owed", () => {
        expect(commitmentsIn([series({ status: "missing" })], from, to)).toHaveLength(1);
    });

    it("treats the window end as exclusive, so a charge is never counted in two periods", () => {
        expect(commitmentsIn([series({ next_expected: to.toISOString() })], from, to)).toHaveLength(0);
    });

    it("adds up what is still to come", () => {
        expect(commitmentTotal([
            series(),
            series({ key: "INTERNET", amount: 90 }),
            series({ key: "GYM", amount: 45, next_expected: "2026-11-01T00:00:00.000Z" }),
        ], from, to)).toBe(106.99);
    });
});
