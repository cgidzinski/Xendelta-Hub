import { describe, it, expect } from "vitest";
import {
    limitState, limitColor, limitCaption, limitNoun, aheadIsGood, directionOf,
    NEAR_LIMIT_PERCENT, budgetVerdict, isSettled, settledCaption,
} from "./budgetKind";

const money = (v: number) => `$${v}`;

describe("directionOf", () => {
    it("points expenses at a ceiling and both of the others at a floor", () => {
        expect(directionOf("expense")).toBe("ceiling");
        expect(directionOf("income")).toBe("floor");
        // The whole reason the third value exists: saving counts EXPENSE items, so a test
        // for "income" would quietly hand it ceiling treatment and report being behind on
        // it as comfortable.
        expect(directionOf("saving")).toBe("floor");
    });
});

describe("limitState — caps", () => {
    it("is fine well inside the cap", () => {
        expect(limitState("ceiling", 0)).toBe("ok");
        expect(limitState("ceiling", 50)).toBe("ok");
        expect(limitState("ceiling", NEAR_LIMIT_PERCENT - 1)).toBe("ok");
    });

    it("warns as it nears the cap", () => {
        expect(limitState("ceiling", NEAR_LIMIT_PERCENT)).toBe("warn");
        expect(limitState("ceiling", 99)).toBe("warn");
    });

    it("treats spending exactly the cap as still inside it", () => {
        expect(limitState("ceiling", 100)).toBe("warn");
    });

    it("is over once past the cap", () => {
        expect(limitState("ceiling", 101)).toBe("over");
        expect(limitState("ceiling", 260)).toBe("over");
    });

    it("warns on level regardless of how far through the period it is", () => {
        // A cap at 85% is worth knowing on day 2 and on day 28 alike.
        expect(limitState("ceiling", 85, 0.05)).toBe("warn");
        expect(limitState("ceiling", 85, 0.95)).toBe("warn");
    });
});

describe("limitState — floors", () => {
    it("is met once the target is reached", () => {
        expect(limitState("floor", 100)).toBe("met");
        expect(limitState("floor", 140)).toBe("met");
    });

    it("is in progress while short, with no pace to judge against", () => {
        expect(limitState("floor", 40)).toBe("ok");
        expect(limitState("floor", 99)).toBe("ok");
    });

    it("is on track when progress keeps up with the period", () => {
        // Half the money by half the month is exactly on track.
        expect(limitState("floor", 50, 0.5)).toBe("ok");
        expect(limitState("floor", 60, 0.5)).toBe("ok");
    });

    it("warns when progress falls behind the pace it needs", () => {
        // 40% saved with 80% of the period gone will not arrive.
        expect(limitState("floor", 40, 0.8)).toBe("warn");
    });

    it("never reports a floor as over - passing the target is the point", () => {
        expect(limitState("floor", 300, 0.1)).toBe("met");
        expect(limitState("floor", 300)).not.toBe("over");
    });

    it("does not warn about a met floor even at the end of the period", () => {
        expect(limitState("floor", 120, 1)).toBe("met");
    });
});

describe("limitColor", () => {
    it("paints failure red and success green", () => {
        expect(limitColor("over")).toBe("error.main");
        expect(limitColor("met")).toBe("#199e70");
        expect(limitColor("warn")).toBe("warning.main");
    });

    it("leaves the ordinary state uncoloured", () => {
        expect(limitColor("ok")).toBeUndefined();
    });
});

describe("limitCaption", () => {
    it("counts a cap down", () => {
        expect(limitCaption("ceiling", 180, 78, money)).toBe("$180 left · 78%");
    });

    it("names the overspend on a breached cap", () => {
        expect(limitCaption("ceiling", -60, 130, money)).toBe("$60 over · 130%");
    });

    it("counts a floor up", () => {
        expect(limitCaption("floor", 180, 78, money)).toBe("$180 to go · 78%");
    });

    it("celebrates a floor that went past its target", () => {
        expect(limitCaption("floor", -60, 130, money)).toBe("$60 past target · 130%");
    });

    it("reads a floor landing exactly on target as reached, not as owing nothing", () => {
        expect(limitCaption("floor", 0, 100, money)).toBe("$0 past target · 100%");
    });

    it("reads a cap spent exactly to the limit as nothing left, not as over", () => {
        expect(limitCaption("ceiling", 0, 100, money)).toBe("$0 left · 100%");
    });
});

describe("limitNoun / aheadIsGood", () => {
    it("names the thing being measured", () => {
        expect(limitNoun("ceiling")).toBe("limit");
        expect(limitNoun("floor")).toBe("target");
    });

    it("knows that outrunning the pace is only good on a floor", () => {
        expect(aheadIsGood("floor")).toBe(true);
        expect(aheadIsGood("ceiling")).toBe(false);
    });
});

describe("isSettled", () => {
    const to = "2026-09-01T00:00:00.000Z";

    it("is not settled part-way through the window", () => {
        expect(isSettled(to, "2026-08-20T12:00:00.000Z")).toBe(false);
    });

    it("is settled the instant the window ends, since `to` is exclusive", () => {
        expect(isSettled(to, to)).toBe(true);
    });

    it("is not settled on the window's own last day", () => {
        expect(isSettled(to, "2026-08-31T23:59:59.000Z")).toBe(false);
    });
});

describe("budgetVerdict", () => {
    const closed = "2026-09-01T00:00:00.000Z";
    const during = "2026-08-20T00:00:00.000Z";
    const after = "2026-09-05T00:00:00.000Z";

    it("has no verdict while the window is still open", () => {
        expect(budgetVerdict("ceiling", 140, 12, closed, during)).toEqual({
            key: "open", word: "In progress",
        });
    });

    it("leaves an open verdict uncoloured, so the live state keeps the card", () => {
        expect(budgetVerdict("ceiling", 140, 12, closed, during).color).toBeUndefined();
    });

    it("passes a cap that stayed inside its limit", () => {
        expect(budgetVerdict("ceiling", 78, 41, closed, after).key).toBe("pass");
    });

    it("passes a cap spent exactly to the limit - `over` means past it, not on it", () => {
        expect(budgetVerdict("ceiling", 100, 41, closed, after).key).toBe("pass");
    });

    it("misses a cap that went past its limit", () => {
        expect(budgetVerdict("ceiling", 112, 53, closed, after).key).toBe("miss");
    });

    it("has no near-miss band: a cap that closed at 98% simply passed", () => {
        const tight = budgetVerdict("ceiling", 98, 47, closed, after);
        expect(tight.key).toBe("pass");
        expect(tight.color).toBe(budgetVerdict("ceiling", 40, 47, closed, after).color);
    });

    it("passes a floor that reached its target, which is the opposite of a cap", () => {
        expect(budgetVerdict("floor", 116, 3, closed, after).key).toBe("pass");
        expect(budgetVerdict("floor", 100, 3, closed, after).key).toBe("pass");
    });

    it("misses a floor that fell short", () => {
        expect(budgetVerdict("floor", 66, 3, closed, after).key).toBe("miss");
    });

    it("names a met floor a target rather than a pass", () => {
        expect(budgetVerdict("floor", 116, 3, closed, after).word).toBe("Target met");
        expect(budgetVerdict("ceiling", 78, 41, closed, after).word).toBe("Passed");
    });

    it("refuses to congratulate a window with no items in it", () => {
        const empty = budgetVerdict("ceiling", 0, 0, closed, after);
        expect(empty.key).toBe("quiet");
        expect(empty.color).toBeUndefined();
    });

    it("calls an empty floor no activity too, rather than a miss", () => {
        expect(budgetVerdict("floor", 0, 0, closed, after).key).toBe("quiet");
    });
});

describe("settledCaption", () => {
    const money = (v: number) => `$${v.toFixed(0)}`;

    it("reports a cap that came in under", () => {
        expect(settledCaption("ceiling", 180, 78, money)).toBe("Closed $180 under · 78%");
    });

    it("reports a cap that went over", () => {
        expect(settledCaption("ceiling", -92, 112, money)).toBe("Closed $92 over · 112%");
    });

    it("reports a floor that was beaten", () => {
        expect(settledCaption("floor", -65, 116, money)).toBe("Closed $65 past target · 116%");
    });

    it("reports a floor that fell short", () => {
        expect(settledCaption("floor", 135, 66, money)).toBe("Closed $135 short · 66%");
    });

    it("reads a floor landing exactly on target as reached, not as short", () => {
        expect(settledCaption("floor", 0, 100, money)).toBe("Closed $0 past target · 100%");
    });

    it("reads a cap spent exactly to the limit as under, not as over", () => {
        expect(settledCaption("ceiling", 0, 100, money)).toBe("Closed $0 under · 100%");
    });
});
