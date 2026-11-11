import type { NextFunction, Request, Response } from "express";
import { User, type UserDocument } from "../models/user";
import type { AuthenticatedRequest } from "../types";

/**
 * An error a route can throw to produce a specific HTTP response. Express 5 forwards rejected
 * promises from async handlers to the error handler in server.ts, which turns this into
 * `{ status: false, message }` with the right status code, so routes don't each repeat a
 * try/catch and a hand-written 4xx/5xx body.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** The authenticated caller's id. Only valid behind `authenticateToken`. */
export function callerId(req: Request): string {
  return (req as AuthenticatedRequest).user!._id;
}

/** The authenticated caller's full user document, or a 401 if the account no longer exists. */
export async function loadCaller(req: Request): Promise<UserDocument> {
  const user = await User.findById(callerId(req)).exec();
  if (!user) throw new AppError(401, "User not found");
  return user;
}

/**
 * Last-resort Express error handler.
 *
 * Express recognises an error handler purely by its arity: exactly four parameters. Keep `_next`
 * even though it is unused, or this silently becomes ordinary middleware that runs for every
 * request with the request object as its "error" (every page then 500s). errorHandler.test.ts
 * pins it.
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // An AppError is an expected, deliberate response (not found, forbidden...): answer it
  // quietly. Everything else is a bug and gets logged.
  if (err instanceof AppError) {
    return res.status(err.status).json({ status: false, message: err.message });
  }
  console.error(">>> Unhandled error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
}
