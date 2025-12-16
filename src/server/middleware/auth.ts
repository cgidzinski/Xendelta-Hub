import { Request, Response, NextFunction } from "express";
import passport from "../config/passport";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";

interface UserDocument {
  _id: string;
  username: string;
  email: string;
  avatar: string;
}

// Passport JWT authentication middleware
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('jwt', { session: false }, (err: Error | null, user: UserDocument | false, info: { message?: string } | undefined) => {
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

    // Attach user data to request object
    (req as AuthenticatedRequest).user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
    };

    next();
  })(req, res, next);
};
