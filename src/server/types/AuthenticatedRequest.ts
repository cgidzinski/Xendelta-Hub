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
}

