import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above every import in this file, so they can only safely
// reference variables created through vi.hoisted() (also hoisted, but ahead of the mocks).
const { getAccountMock } = vi.hoisted(() => ({
    getAccountMock: vi.fn(),
}));

// getAccount is a real ESM import in casinoStatus.ts, so module-level vi.mock intercepts it
// cleanly. XenCasino is loaded via a literal `require(...)` there instead (see xenCasino.js's
// CommonJS shape) - vi.mock can't hook a raw `require()` call the way it hooks `import`, so
// XenCasino is spied on directly below (the require() cache guarantees casinoStatus.ts sees
// the exact same object this file mutates).
vi.mock("./weeabetsClient", () => ({
    getAccount: (...args: unknown[]) => getAccountMock(...args),
}));

vi.mock("../config/weeabets", () => ({
    XENCASINO_DISCORD_ID: "test-xencasino-discord-id",
}));

import { getCasinoStatus, requireGameEnabled, CASINO_MIN_BANK_BALANCE } from "./casinoStatus";
const { XenCasino } = require("../models/xenCasino");

function mockSingleton(overrides: { manuallyClosed?: boolean; disabledGames?: Map<string, boolean> } = {}) {
    vi.spyOn(XenCasino, "getSingleton").mockResolvedValue({
        manuallyClosed: overrides.manuallyClosed ?? false,
        disabledGames: overrides.disabledGames ?? new Map(),
    });
}

function mockBalance(balance: number) {
    getAccountMock.mockResolvedValue({ accountId: 1, displayName: "XenCasino", avatarUrl: "", balance: balance.toFixed(10) });
}

beforeEach(() => {
    getAccountMock.mockReset();
    vi.restoreAllMocks();
});

describe("getCasinoStatus", () => {
    it("exposes the current auto-close floor", () => {
        expect(CASINO_MIN_BANK_BALANCE).toBe(2_500_000);
    });

    it("stays open when the bank balance is comfortably above the floor", async () => {
        mockSingleton();
        mockBalance(5_000_000);

        const status = await getCasinoStatus();

        expect(status.open).toBe(true);
        expect(status.reason).toBeNull();
        expect(status.bankBalance).toBe(5_000_000);
        expect(status.minBankBalance).toBe(CASINO_MIN_BANK_BALANCE);
    });

    it("auto-closes with reason 'broke' once the balance drops below the floor", async () => {
        mockSingleton();
        mockBalance(2_499_999);

        const status = await getCasinoStatus();

        expect(status.open).toBe(false);
        expect(status.reason).toBe("broke");
    });

    it("stays open exactly at the floor - only strictly-below counts as broke", async () => {
        mockSingleton();
        mockBalance(CASINO_MIN_BANK_BALANCE);

        const status = await getCasinoStatus();

        expect(status.open).toBe(true);
        expect(status.reason).toBeNull();
    });

    it("stays closed for a manual toggle even when the balance is healthy, and reports 'manual' not 'broke'", async () => {
        mockSingleton({ manuallyClosed: true });
        mockBalance(5_000_000);

        const status = await getCasinoStatus();

        expect(status.open).toBe(false);
        expect(status.reason).toBe("manual");
    });

    it("treats a missing/unlinked house account as a zero balance, which is broke", async () => {
        mockSingleton();
        getAccountMock.mockResolvedValue(null);

        const status = await getCasinoStatus();

        expect(status.bankBalance).toBe(0);
        expect(status.open).toBe(false);
        expect(status.reason).toBe("broke");
    });
});

describe("requireGameEnabled", () => {
    function mockRes() {
        const res = {
            statusCode: undefined as number | undefined,
            body: undefined as unknown,
            status(code: number) {
                res.statusCode = code;
                return res;
            },
            json(body: unknown) {
                res.body = body;
                return res;
            },
        };
        return res;
    }

    it("blocks a game's wager-starting route with a 503 while the casino is closed", async () => {
        mockSingleton();
        mockBalance(1_000_000); // below the 2.5M floor

        const guard = requireGameEnabled("spinmania");
        const res = mockRes();
        const next = vi.fn();

        await guard({} as never, res as never, next as never);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(503);
    });

    it("calls next() once the balance is back above the floor", async () => {
        mockSingleton();
        mockBalance(5_000_000);

        const guard = requireGameEnabled("spinmania");
        const res = mockRes();
        const next = vi.fn();

        await guard({} as never, res as never, next as never);

        expect(next).toHaveBeenCalledOnce();
        expect(res.statusCode).toBeUndefined();
    });
});
