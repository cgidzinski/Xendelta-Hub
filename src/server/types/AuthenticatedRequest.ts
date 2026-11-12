import { Request } from "express";

/**
 * Extended Request interface for authenticated routes
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    username: string;
    email: string;
    avatar: string;
  };
  /** How the request signed in. Absent for an ordinary session JWT. */
  auth?: { via: "apiKey"; keyId: string };
}
