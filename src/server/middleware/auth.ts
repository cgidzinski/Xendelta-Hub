import { Request, Response, NextFunction } from "express";
import passport from "../config/passport";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
import { ApiKey } from "../models/apiKey";
import { User } from "../models/user";
import { hashToken } from "../utils/tokens";
import { API_KEY_PREFIX, checkApiKeyAccess } from "@shared/apiKeys";

interface UserDocument {
  _id: string;
  username: string;
  email: string;
  avatar: string;
}

const LAST_USED_THROTTLE_MS = 60_000;

/** The bearer token on a request, or null. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  return header && /^Bearer /i.test(header) ? header.slice(7).trim() : null;
}

// An `xd_` bearer is an API key (shared/apiKeys.ts). It stands in for a session JWT: on success `req.user` has the
// same shape, so every route behind authenticateToken works unchanged. A bad key is a 401 and never falls back to JWT.
async function authenticateApiKey(token: string, req: Request, res: Response, next: NextFunction) {
  const reject = (status: number, message: string) => res.status(status).json({ status: false, message });
  try {
    const key = await ApiKey.findOne({ hash: hashToken(token) }).exec();
    if (!key || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) return reject(401, "Invalid API key");

    // Mounted middleware (app.use("/api/xennote", ...)) sees a path relative to its mount point.
    const access = checkApiKeyAccess({ apps: key.apps, readOnly: key.readOnly }, req.method, req.baseUrl + req.path);
    if (!access.ok) return reject(403, access.reason);

    const user = await User.findById(key.userId).exec();
    if (!user) return reject(401, "Invalid API key");

    const now = Date.now();
    if (!key.lastUsedAt || now - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
      void ApiKey.updateOne({ _id: key._id }, { lastUsedAt: new Date(now) }).exec();
    }

    const authed = req as AuthenticatedRequest;
    authed.user = {
      _id: user._id as unknown as string,
      username: user.username as string,
      email: user.email as string,
      avatar: user.avatar as string,
    };
    authed.auth = { via: "apiKey", keyId: String(key._id) };
    next();
  } catch (error) {
    console.error("API key authentication error:", error);
    reject(503, "Authentication service temporarily unavailable");
  }
}

// Passport JWT authentication middleware
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const token = bearerToken(req);
  if (token?.startsWith(API_KEY_PREFIX)) {
    void authenticateApiKey(token, req, res, next);
    return;
  }
  passport.authenticate(
    "jwt",
    { session: false },
    (err: Error | null, user: UserDocument | false, info: { message?: string } | undefined) => {
      if (err) {
        console.error("Authentication error:", err);
        return res.status(503).json({
          status: false,
          code: "SERVICE_UNAVAILABLE",
          message: "Authentication service temporarily unavailable",
        });
      }

      if (!user) {
        return res.status(401).json({
          status: false,
          message: info?.message || "Access token required",
        });
      }

      // Attach user data to request object
      (req as AuthenticatedRequest).user = {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
      };

      next();
    },
  )(req, res, next);
};
