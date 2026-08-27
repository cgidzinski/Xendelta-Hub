import { describe, it, expect } from "vitest";
import { projectBook } from "./bookPace";

// A 30-day window, read on the 15th: exactly half elapsed.
const HALF_WAY = {
    periodFrom: "2026-09-01T00:00:00.000Z",
    periodTo: "2026-10-01T00:00:00.000Z",
    asOf: "2026-09-16T00:00:00.000Z",
};

describe("projectBook", () => {
    it("extrapolates spending from the rate so far", () => {
        const p = projectBook({ ...HALF_WAY, expense: 1000, income: 3000, committed: 0 });
        expect(p.runRate).toBeCloseTo(2000, 5);
        expect(p.projectedExpense).toBeCloseTo(2000, 5);
        expect(p.projectedNet).toBeCloseTo(1000, 5);
    });

    it("does not extrapolate income — a paycheque is not a rate", () => {
        const p = projectBook({ ...HALF_WAY, expense: 1000, income: 3000, committed: 0 });
        expect(p.income).toBe(3000);
    });

    it("does NOT add committed spend on top of a run rate that already covers it", () => {
        // The run rate projects 2000. Committed 200 is already inside that extrapolation,
        // so the answer must stay 2000 — 2200 would count those subscriptions twice.
        const p = projectBook({ ...HALF_WAY, expense: 1000, income: 3000, committed: 200 });
        expect(p.projectedExpense).toBeCloseTo(2000, 5);
    });

    it("lifts the projection when the run rate is below what is contractually due", () => {
        // A quiet month whose rent hasn't posted: 100 spent projects to 200, but 1500 is
        // known to be coming, so the projection has to be at least 1600.
        const p = projectBook({ ...HALF_WAY, expense: 100, income: 3000, committed: 1500 });
        expect(p.projectedExpense).toBeCloseTo(1600, 5);
        expect(p.projectedNet).toBeCloseTo(1400, 5);
    });

    it("reports a negative net when the projection outruns income", () => {
        const p = projectBook({ ...HALF_WAY, expense: 2000, income: 3000, committed: 0 });
        expect(p.projectedExpense).toBeCloseTo(4000, 5);
        expect(p.projectedNet).toBeCloseTo(-1000, 5);
    });

    it("stops projecting once the window has closed", () => {
        const p = projectBook({
            periodFrom: "2026-08-01T00:00:00.000Z",
            periodTo: "2026-09-01T00:00:00.000Z",
            asOf: "2026-09-16T00:00:00.000Z",
            expense: 2400, income: 3000, committed: 0,
        });
        expect(p.finished).toBe(true);
        // A closed window has nothing left to extrapolate: the projection is what happened.
        expect(p.projectedExpense).toBeCloseTo(2400, 5);
        expect(p.projectedNet).toBeCloseTo(600, 5);
    });

    it("does not divide by zero at the very start of a window", () => {
        const p = projectBook({
            ...HALF_WAY, asOf: HALF_WAY.periodFrom, expense: 0, income: 0, committed: 900,
        });
        expect(Number.isFinite(p.projectedExpense)).toBe(true);
        // Nothing spent and no elapsed rate, so the commitments are all there is to say.
        expect(p.projectedExpense).toBe(900);
    });

    it("carries the elapsed fraction through", () => {
        const p = projectBook({ ...HALF_WAY, expense: 1000, income: 0, committed: 0 });
        expect(p.elapsed).toBeCloseTo(0.5, 2);
        expect(p.finished).toBe(false);
    });
});
