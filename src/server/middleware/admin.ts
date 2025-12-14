import { Request, Response, NextFunction } from "express";
import { User } from "../models/user";

// Admin middleware - checks if user has admin role
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;
  
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

  // Attach full user to request for admin operations
  (req as any).adminUser = fullUser;
  
  next();
};

