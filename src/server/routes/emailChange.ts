import express = require("express");
import { rateLimit } from "express-rate-limit";
import { authenticateToken } from "../middleware/auth";
import { User } from "../models/user";
import { AppError, callerId, loadCaller } from "../utils/http";
import { randomToken, hashToken } from "../utils/tokens";
import { sendEmailChangeConfirmEmail, sendEmailChangedNotice } from "../utils/emailUtils";
import { notify } from "../utils/notificationUtils";
import { confirmEmailChangeSchema, requestEmailChangeSchema, validate } from "../utils/validation";

// Changing the account's email: the person proves it is them with their password, a link is sent to the NEW address,
// and the address only changes when that link is opened (so a typo or someone else's address can't lock them out).
// The old address is told afterwards. Accounts that sign in with Google or GitHub have no password and keep the email
// that provider gives, so they can't use this.
export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;
const DUPLICATE_KEY = 11000;

// Per person, since this checks a password: a stolen sign-in can't be used to guess it.
const perPersonPerHour = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => callerId(req),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  handler: (_req, _res, next) => next(new AppError(429, "Too many attempts. Please try again in an hour.")),
});

module.exports = function (app: express.Application) {
  app.post(
    "/api/user/email-change",
    authenticateToken,
    perPersonPerHour,
    validate(requestEmailChangeSchema),
    async function (req: express.Request, res: express.Response) {
      // `validate` only checks; the parsed body is the one with the address trimmed and lower-cased.
      const body = requestEmailChangeSchema.parse(req.body);
      const user = await loadCaller(req);
      if (!user.password) {
        throw new AppError(400, "Your account signs in with Google or GitHub, so its email is managed there.");
      }
      if (!user.validPassword(body.password)) throw new AppError(400, "That password isn't right.");

      const newEmail = body.newEmail;
      if (newEmail === user.email) throw new AppError(400, "That is already your email.");
      if (await User.exists({ email: newEmail, _id: { $ne: user._id } })) {
        throw new AppError(409, "That email is already used by another account.");
      }

      const token = randomToken(32);
      user.set("pendingEmail", {
        email: newEmail,
        token: hashToken(token),
        expires: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
      });
      await user.save();

      const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || "3000"}`;
      const sent = await sendEmailChangeConfirmEmail({
        username: user.username ?? "",
        email: newEmail,
        confirmUrl: `${baseUrl}/confirm-email?token=${token}`,
      });
      if (!sent.success) {
        user.set("pendingEmail", undefined);
        await user.save();
        throw new AppError(502, "We couldn't send the confirmation email. Check the address and try again.");
      }
      return res.json({ status: true, message: `We sent a link to ${newEmail}. Open it within an hour to finish.` });
    },
  );

  // Public (the link is opened from an inbox, maybe on another device): the token is the proof.
  app.post(
    "/api/auth/confirm-email-change",
    validate(confirmEmailChangeSchema),
    async function (req: express.Request, res: express.Response) {
      const user = await User.findOne({
        "pendingEmail.token": hashToken(req.body.token),
        "pendingEmail.expires": { $gt: new Date() },
      }).exec();
      const newEmail = user?.pendingEmail?.email;
      if (!user || !newEmail) throw new AppError(400, "This link is invalid or has expired. Ask for a new one.");

      const oldEmail = user.email;
      user.email = newEmail;
      // The local sign-in entry carries the address too.
      const local = user.authProviders.find((p) => p.provider === "local");
      if (local) local.email = newEmail;
      user.set("pendingEmail", undefined);
      try {
        await user.save();
      } catch (err) {
        if ((err as { code?: number })?.code === DUPLICATE_KEY) {
          throw new AppError(409, "That email is already used by another account.");
        }
        throw err;
      }

      if (oldEmail) {
        void sendEmailChangedNotice({ username: user.username ?? "", email: oldEmail, newEmail }).catch(
          () => undefined,
        );
      }
      void notify(String(user._id), {
        title: "Email changed",
        message: `The email on your account is now ${newEmail}.`,
        link: "/internal/settings",
        icon: "person",
      }).catch(() => undefined);
      return res.json({ status: true, message: "Your email was changed.", data: { email: newEmail } });
    },
  );
};
