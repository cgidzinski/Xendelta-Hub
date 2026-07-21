import { Request, Response, NextFunction } from "express";
import { getAccount } from "./weeabetsClient";
import { XENCASINO_DISCORD_ID } from "../config/weeabets";
const { XenCasino } = require("../models/xenCasino");

// Below this live house balance, the casino auto-closes regardless of the manual toggle -
// a losing streak (or an exploit) draining an already-broke house shouldn't be able to keep
// going just because nobody flipped the switch.
export const CASINO_MIN_BANK_BALANCE = 1_000_000;

export interface CasinoStatus {
    open: boolean;
    reason: "manual" | "broke" | null;
    bankBalance: number;
    disabledGames: string[];
}

// Single source of truth for "is the casino open" / "is this game enabled" - both the public
// status endpoint players poll and the server-side play-route guards below call through this,
// so the open/closed logic only ever lives in one place.
export async function getCasinoStatus(): Promise<CasinoStatus> {
    const [singleton, account] = await Promise.all([XenCasino.getSingleton(), getAccount(XENCASINO_DISCORD_ID)]);

    const bankBalance = account ? parseFloat(account.balance) : 0;
    const broke = bankBalance < CASINO_MIN_BANK_BALANCE;
    const manuallyClosed = !!singleton.manuallyClosed;

    const disabledGames: string[] = [];
    singleton.disabledGames.forEach((disabled: boolean, slug: string) => {
        if (disabled) disabledGames.push(slug);
    });

    return {
        open: !manuallyClosed && !broke,
        reason: manuallyClosed ? "manual" : broke ? "broke" : null,
        bankBalance,
        disabledGames,
    };
}

// Express guard for a game's wager-starting route (spin/play/buy/drop/start) - not for routes
// that only resume or cash out an already-purchased round, so disabling a game never strands a
// player's already-paid-for round. `slug` can be a function of the request when the route is
// parametrized (slots.ts serves multiple machines off one route).
export function requireGameEnabled(slug: string | ((req: Request) => string)) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const status = await getCasinoStatus();
            if (!status.open) {
                return res.status(503).json({ status: false, message: "XenCasino is currently closed." });
            }
            const resolvedSlug = typeof slug === "function" ? slug(req) : slug;
            if (status.disabledGames.includes(resolvedSlug)) {
                return res.status(503).json({ status: false, message: "This game is temporarily disabled." });
            }
            next();
        } catch (err) {
            return res.status(503).json({ status: false, message: (err as Error).message });
        }
    };
}
