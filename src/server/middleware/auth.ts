import { Request, Response, NextFunction } from "express";
const jwt = require("jsonwebtoken");
const {User} = require("../models/user");

declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        username: string;
        email: string;
        avatar: string;
      };
    }
  }
}

interface JWTPayload {
  _id: string;
  username: string;
  email: string;
  avatar: string;
  iat?: number;
  exp?: number;
}

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Get token from Authorization header
    const token = req.headers.authorization;

    if (!token) {
      res.status(401).json({
        status: false,
        message: "Access token required",
      });
      return;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

    if (!decoded._id) {
      res.status(401).json({
        status: false,
        message: "Invalid token payload",
      });
      return;
    }

    // Check if user still exists in database
    const user = await User.findOne({ _id: decoded._id }).exec();

    if (!user) {
      res.status(401).json({
        status: false,
        message: "User not found",
      });
      return;
    }

    // Attach user data to request object
    req.user = {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        status: false,
        message: "Invalid or expired token",
      });
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        status: false,
        message: "Token has expired",
      });
      return;
    }

    res.status(500).json({
      status: false,
      message: "Authentication failed",
    });
  }
};
