/**
 * Demo Game — a placeholder to prove the XenCasino money-movement wiring end to end.
 * Not a real game: the outcome is chosen by the caller (two deterministic buttons on the
 * client, "Win" and "Lose"), not rolled here. Fully self-contained: its own route, its own
 * fixed wager, its own note conventions - a template for how future real games should be
 * structured (own file here, own page + hook on the client, nothing shared but the
 * weeabetsClient utility and the casino shell).
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

const DEMO_AMOUNT = "5";

module.exports = function (app: express.Application) {

    app.post("/api/casino/games/demo/play", authenticateToken, async function (req: express.Request, res: express.Response) {
        const { outcome } = req.body as { outcome?: string };
        if (outcome !== "win" && outcome !== "loss") {
            return res.status(400).json({ status: false, message: "outcome must be 'win' or 'loss'" });
        }

        const userId = (req as AuthenticatedRequest).user!._id;
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const key = `xendelta-demo-${userId}-${crypto.randomUUID()}`;

            const result = outcome === "win"
                ? await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: DEMO_AMOUNT,
                    key,
                    note: "win",
                })
                : await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: DEMO_AMOUNT,
                    key,
                    note: "loss",
                });

            const newBalance = outcome === "win" ? result.toNewBalance : result.fromNewBalance;
            return res.json({ status: true, data: { outcome, balance: newBalance } });
        } catch (err) {
            if (err instanceof WeeabetsTransferError && err.status === 400) {
                return res.status(400).json({ status: false, message: "Insufficient balance to play" });
            }
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
