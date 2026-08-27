import { describe, it, expect } from "vitest";
import { buildMovers } from "./movers";
import type { SummaryCategoryPeriod } from "../../../../../hooks/xenbudget/types";

const cell = (category: string, key: string, total: number): SummaryCategoryPeriod =>
    ({ category, key, total });

describe("buildMovers", () => {
    it("subtracts the last two periods", () => {
        const movers = buildMovers([
            cell("Groceries", "2026-07", 400),
            cell("Groceries", "2026-08", 542),
            cell("Travel", "2026-07", 900),
            cell("Travel", "2026-08", 100),
        ], ["2026-07", "2026-08"]);

        expect(movers?.currentKey).toBe("2026-08");
        expect(movers?.previousKey).toBe("2026-07");
        expect(movers?.up).toMatchObject([{ category: "Groceries", delta: 142 }]);
        expect(movers?.down).toMatchObject([{ category: "Travel", delta: -800 }]);
    });

    it("compares only the last two buckets of a longer range", () => {
        const movers = buildMovers([
            cell("Groceries", "2026-01", 10),
            cell("Groceries", "2026-07", 400),
            cell("Groceries", "2026-08", 542),
        ], ["2026-01", "2026-07", "2026-08"]);
        expect(movers?.up).toMatchObject([{ category: "Groceries", previous: 400, current: 542 }]);
    });

    it("suppresses movement too small to be worth reading", () => {
        const movers = buildMovers([
            cell("Groceries", "2026-07", 400),
            cell("Groceries", "2026-08", 400.4),
        ], ["2026-07", "2026-08"]);
        expect(movers?.up).toEqual([]);
        expect(movers?.down).toEqual([]);
    });

    it("scales the noise floor to the size of the period", () => {
        // $30 is real in a $500 month and noise in a $10,000 one.
        // Rent is flat in both, so it only sets how big the period is.
        const small = buildMovers([
            cell("Coffee", "2026-07", 100), cell("Coffee", "2026-08", 130),
            cell("Rent", "2026-07", 370), cell("Rent", "2026-08", 370),
        ], ["2026-07", "2026-08"]);
        expect(small?.up).toMatchObject([{ category: "Coffee", delta: 30 }]);

        const large = buildMovers([
            cell("Coffee", "2026-07", 100), cell("Coffee", "2026-08", 130),
            cell("Rent", "2026-07", 9870), cell("Rent", "2026-08", 9870),
        ], ["2026-07", "2026-08"]);
        expect(large?.up).toEqual([]);
    });

    it("reports no percentage for spending that started from nothing", () => {
        const movers = buildMovers([
            cell("Medical Expenses", "2026-08", 320),
        ], ["2026-07", "2026-08"]);
        expect(movers?.up[0]).toMatchObject({ category: "Medical Expenses", delta: 320, percent: null });
    });

    it("treats a category that stopped as a full decrease", () => {
        const movers = buildMovers([
            cell("Gym", "2026-07", 45),
        ], ["2026-07", "2026-08"]);
        expect(movers?.down[0]).toMatchObject({ category: "Gym", current: 0, delta: -45, percent: -1 });
    });

    it("keeps only the biggest movers in each direction", () => {
        const cells = ["A", "B", "C", "D"].flatMap((c, i) => [
            cell(c, "2026-07", 100),
            cell(c, "2026-08", 100 + (i + 1) * 50),
        ]);
        const movers = buildMovers(cells, ["2026-07", "2026-08"]);
        expect(movers?.up.map((m) => m.category)).toEqual(["D", "C", "B"]);
    });

    it("adds up several cells for the same category in one bucket", () => {
        const movers = buildMovers([
            cell("Groceries", "2026-07", 100),
            cell("Groceries", "2026-08", 60),
            cell("Groceries", "2026-08", 90),
        ], ["2026-07", "2026-08"]);
        expect(movers?.up).toMatchObject([{ category: "Groceries", current: 150, delta: 50 }]);
    });

    it("has nothing to say about a single period", () => {
        expect(buildMovers([cell("Groceries", "2026-08", 542)], ["2026-08"])).toBeNull();
        expect(buildMovers([], [])).toBeNull();
    });
});
