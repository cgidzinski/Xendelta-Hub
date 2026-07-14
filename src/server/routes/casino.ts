import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
import { resolveUserAccount, getLedger, WeeabetsUnavailable } from "../utils/weeabetsClient";

module.exports = function (app: express.Application) {

    // Live Weeabets balance for the current user, or {linked:false} if Discord isn't linked.
    app.get("/api/casino/balance", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = (req as AuthenticatedRequest).user!._id;
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked) {
                return res.json({ status: true, data: { linked: false, balance: null } });
            }
            return res.json({
                status: true,
                data: { linked: true, balance: resolved.account?.balance ?? null },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Every movement in/out of the XenCasino account, enriched with local display names
    // where the counterparty is a known Xendelta-Hub user (matched via weeabetsAccountId).
    app.get("/api/casino/ledger", authenticateToken, async function (req: express.Request, res: express.Response) {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const beforeId = req.query.before_id ? Number(req.query.before_id) : undefined;

        try {
            const entries = await getLedger({ limit, beforeId });
            const accountIds = [...new Set(entries.map((e) => e.counterpartyId))];
            const localUsers = await User.find({ weeabetsAccountId: { $in: accountIds } }).exec();
            const nameByAccountId = new Map<number, string>(
                localUsers.map((u: any) => [u.weeabetsAccountId, u.username || u.name || `Account #${u.weeabetsAccountId}`])
            );
            const enriched = entries.map((e) => ({
                ...e,
                displayName: nameByAccountId.get(e.counterpartyId) || `Account #${e.counterpartyId}`,
            }));
            return res.json({ status: true, data: { entries: enriched } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
