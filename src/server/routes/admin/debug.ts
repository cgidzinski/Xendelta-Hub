import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";

module.exports = function (app: express.Application) {
    // Deliberately throws so it flows through Bugsnag's Express errorHandler (and the
    // fallback handler in server.ts) — lets an admin confirm server-side error reporting
    // is wired up correctly without waiting for a real bug. The client's axios interceptor
    // also reports the resulting 500, so this exercises both sides of the pipeline at once.
    app.post("/api/admin/debug/trigger-error", authenticateToken, requireAdmin, function (req: express.Request, res: express.Response, next: express.NextFunction) {
        next(new Error("Test server error triggered from Admin panel"));
    });
};
