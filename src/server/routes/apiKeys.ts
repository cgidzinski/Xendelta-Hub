import express = require("express");
import { ApiKey } from "../models/apiKey";
import { authenticateToken } from "../middleware/auth";
import { AppError, callerId } from "../utils/http";
import { hashToken, randomToken } from "../utils/tokens";
import { validate, validateParams, createApiKeySchema, apiKeyIdParamSchema } from "../utils/validation";
import { API_KEY_MAX_PER_USER, API_KEY_PREFIX } from "@shared/apiKeys";

// Managing API keys. These live under /api/user, which an API key can never reach (shared/apiKeys.ts), so a key
// can't mint or revoke keys: that needs a real sign-in.
const serialize = (k: any) => ({
  _id: String(k._id),
  name: k.name,
  preview: k.preview,
  apps: k.apps ?? [],
  readOnly: !!k.readOnly,
  expiresAt: k.expiresAt ?? null,
  lastUsedAt: k.lastUsedAt ?? null,
  createdAt: k.createdAt,
});

module.exports = function (app: express.Application) {
  app.get("/api/user/api-keys", authenticateToken, async (req, res) => {
    const keys = await ApiKey.find({ userId: callerId(req) })
      .sort({ createdAt: -1 })
      .exec();
    res.json({ status: true, message: "", data: { apiKeys: keys.map(serialize) } });
  });

  app.post("/api/user/api-keys", authenticateToken, validate(createApiKeySchema), async (req, res) => {
    const userId = callerId(req);
    if ((await ApiKey.countDocuments({ userId }).exec()) >= API_KEY_MAX_PER_USER) {
      throw new AppError(400, `You can have at most ${API_KEY_MAX_PER_USER} API keys`);
    }
    const { name, apps, readOnly, expiresInDays } = req.body;
    const key = API_KEY_PREFIX + randomToken(32);
    const doc = await ApiKey.create({
      userId,
      name,
      hash: hashToken(key),
      preview: key.slice(0, API_KEY_PREFIX.length + 4) + "…",
      apps: [...new Set<string>(apps ?? [])],
      readOnly: !!readOnly,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : undefined,
    });
    // The only time the plain key is ever returned.
    res.json({ status: true, message: "API key created", data: { key, apiKey: serialize(doc) } });
  });

  app.delete("/api/user/api-keys/:keyId", authenticateToken, validateParams(apiKeyIdParamSchema), async (req, res) => {
    const result = await ApiKey.deleteOne({ _id: req.params.keyId, userId: callerId(req) }).exec();
    if (!result.deletedCount) throw new AppError(404, "API key not found");
    res.json({ status: true, message: "API key revoked", data: {} });
  });
};
