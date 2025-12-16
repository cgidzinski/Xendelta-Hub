import { Request, Response, NextFunction } from "express";
const { User } = require("../models/user");
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";

// Admin middleware - checks if user has admin role
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as AuthenticatedRequest).user;
  
  if (!user || !user._id) {
    return res.status(401).json({
      status: false,
      message: "Authentication required",
    });
  }

  const fullUser = await User.findOne({ _id: user._id }).exec();
  
  if (!fullUser) {
    return res.status(404).json({
      status: false,
      message: "User not found",
    });
  }

  // Check if user has admin role (case-insensitive)
  const hasAdminRole = fullUser.roles && fullUser.roles.some((role: string) => role.toLowerCase() === "admin");
  if (!hasAdminRole) {
    return res.status(403).json({
      status: false,
      message: "Admin access required",
    });
  }

  next();
};

