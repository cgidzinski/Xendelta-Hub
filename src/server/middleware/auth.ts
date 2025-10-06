import { Request, Response, NextFunction } from "express";
import passport from "../config/passport";

// Extend Request interface locally
interface AuthenticatedRequest extends Request {
  user?: {
    _id: string;
    username: string;
    email: string;
    avatar: string;
  };
}

interface JWTPayload {
  _id: string;
  username: string;
  email: string;
  avatar: string;
  iat?: number;
  exp?: number;
}

// Passport JWT authentication middleware
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: any, user: any, info: any) => {
    if (err) {
      console.error("Authentication error:", err);
      return res.status(500).json({
        status: false,
        message: "Authentication failed",
      });
    }

    if (!user) {
      return res.status(401).json({
        status: false,
        message: info?.message || "Access token required",
      });
    }

    // Attach user data to request object (same format as before)
    (req as any).user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
    };

    next();
  })(req, res, next);
};
