import { describe, it, expect } from "vitest";
import {
    windowLabel, periodNoun, monthlyEquivalent, amountForUnit, annualEquivalent,
    normalizedAmounts,
} from "./periodDisplay";

// UTC dates throughout, matching the server's windows (see the repo's UTC convention).
const local = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString();

describe("windowLabel", () => {
    it("names a weekly window by its Monday", () => {
        expect(windowLabel("weekly", iso(local(2026, 8, 24)), iso(local(2026, 8, 31))))
            .toBe("Week of Aug 24");
    });

    it("names a monthly window as its month", () => {
        expect(windowLabel("monthly", iso(local(2026, 8, 1)), iso(local(2026, 9, 1))))
            .toBe("Aug 2026");
    });

    it("names a quarterly window as Qn yyyy", () => {
        expect(windowLabel("quarterly", iso(local(2026, 7, 1)), iso(local(2026, 10, 1))))
            .toBe("Q3 2026");
        expect(windowLabel("quarterly", iso(local(2026, 1, 1)), iso(local(2026, 4, 1))))
            .toBe("Q1 2026");
    });

    it("names a yearly window as its year", () => {
        expect(windowLabel("yearly", iso(local(2026, 1, 1)), iso(local(2027, 1, 1))))
            .toBe("2026");
    });

    it("names a custom window as its date range", () => {
        expect(windowLabel("custom", iso(local(2026, 8, 24)), iso(local(2026, 9, 20))))
            .toBe("Aug 24 – Sep 20, 2026");
    });

    it("names a cross-year custom window with both years", () => {
        expect(windowLabel("custom", iso(local(2025, 12, 20)), iso(local(2026, 1, 5))))
            .toBe("Dec 20 – Jan 5, 2025 – 2026");
    });
});

describe("periodNoun", () => {
    it("maps every period to its rate noun", () => {
        expect(periodNoun("weekly")).toBe("week");
        expect(periodNoun("monthly")).toBe("month");
        expect(periodNoun("quarterly")).toBe("quarter");
        expect(periodNoun("yearly")).toBe("year");
        expect(periodNoun("custom")).toBe("period");
    });
});

describe("monthlyEquivalent", () => {
    it("multiplies a weekly amount by 52/12, not by four", () => {
        // The old flat "4 weeks to a month" was ~8.7% out and disagreed with the server's
        // own PER_MONTH (xenBudgetRecurring.ts), which has always used 52/12.
        expect(monthlyEquivalent("weekly", 100)).toBe(433.33);
    });

    it("divides a quarterly amount by three", () => {
        expect(monthlyEquivalent("quarterly", 3000)).toBe(1000);
    });

    it("leaves a monthly amount alone", () => {
        expect(monthlyEquivalent("monthly", 800)).toBe(800);
    });

    it("divides a yearly amount by twelve", () => {
        expect(monthlyEquivalent("yearly", 12000)).toBe(1000);
    });

    it("is undefined for a one-off custom period", () => {
        expect(monthlyEquivalent("custom", 1000)).toBeUndefined();
    });

    it("is undefined with no overall amount or a non-positive one", () => {
        expect(monthlyEquivalent("monthly", undefined)).toBeUndefined();
        expect(monthlyEquivalent("monthly", 0)).toBeUndefined();
        expect(monthlyEquivalent("monthly", -5)).toBeUndefined();
    });
});

describe("amountForUnit", () => {
    // The requirement this whole conversion exists for: a cap must not move with the length
    // of the window it happens to be shown in.
    it("restates a $600 yearly budget in every unit", () => {
        expect(amountForUnit("yearly", 600, "day")).toBe(1.64);
        expect(amountForUnit("yearly", 600, "week")).toBe(11.54);
        expect(amountForUnit("yearly", 600, "month")).toBe(50);
        expect(amountForUnit("yearly", 600, "quarter")).toBe(150);
        expect(amountForUnit("yearly", 600, "year")).toBe(600);
    });

    it("restates an $800 monthly budget in every unit", () => {
        expect(amountForUnit("monthly", 800, "day")).toBe(26.3);
        expect(amountForUnit("monthly", 800, "week")).toBe(184.62);
        expect(amountForUnit("monthly", 800, "month")).toBe(800);
        expect(amountForUnit("monthly", 800, "quarter")).toBe(2400);
        expect(amountForUnit("monthly", 800, "year")).toBe(9600);
    });

    it("gives the same figure whichever month, week or day is being viewed", () => {
        // The point of converting nominally rather than by how much of the window overlaps:
        // prorating by real days made a $600/yr budget worth $1.79 on a February day against
        // $1.61 on a January one, and made a week straddling a month boundary worth less than
        // one inside it. The unit is the only input, so there is nothing left to vary.
        const perMonth = amountForUnit("yearly", 600, "month");
        const perWeek = amountForUnit("yearly", 600, "week");
        const perDay = amountForUnit("yearly", 600, "day");

        expect(perMonth).toBe(50);   // February, and every other month
        expect(perWeek).toBe(11.54); // including a week spanning Jan 29 - Feb 4
        expect(perDay).toBe(1.64);   // including Feb 29 in a leap year
    });

    it("round-trips through the annual pivot without drifting", () => {
        expect(annualEquivalent("weekly", 100)).toBe(5200);
        expect(amountForUnit("yearly", 5200, "week")).toBe(100);
        expect(amountForUnit("quarterly", amountForUnit("monthly", 800, "quarter")!, "month"))
            .toBe(800);
    });

    it("has no answer for a one-off custom budget or a missing amount", () => {
        expect(amountForUnit("custom", 1000, "month")).toBeUndefined();
        expect(amountForUnit("monthly", undefined, "month")).toBeUndefined();
        expect(amountForUnit("monthly", 0, "month")).toBeUndefined();
        expect(annualEquivalent("custom", 1000)).toBeUndefined();
    });
});

describe("normalizedAmounts", () => {
    it("agrees with amountForUnit on every unit", () => {
        const n = normalizedAmounts("quarterly", 3000);
        expect(n).toEqual({
            daily: amountForUnit("quarterly", 3000, "day"),
            weekly: amountForUnit("quarterly", 3000, "week"),
            monthly: amountForUnit("quarterly", 3000, "month"),
            quarterly: amountForUnit("quarterly", 3000, "quarter"),
            yearly: amountForUnit("quarterly", 3000, "year"),
        });
        expect(n.monthly).toBe(1000);
        expect(n.yearly).toBe(12000);
    });

    it("is empty for a one-off custom period or a missing amount", () => {
        expect(normalizedAmounts("custom", 1000)).toEqual({});
        expect(normalizedAmounts("monthly", undefined)).toEqual({});
    });
});
