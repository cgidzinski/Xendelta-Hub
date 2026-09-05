import { describe, it, expect } from "vitest";
import {
    limitState, limitColor, limitCaption, limitNoun, aheadIsGood, NEAR_LIMIT_PERCENT,
} from "./budgetKind";

const money = (v: number) => `$${v}`;

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
